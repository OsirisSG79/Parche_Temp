"""Hipótesis múltiples de onset en modo sombra (V15.10.1).

El score sólo ordena candidatos; no es probabilidad ni decisión de publicación.
Las features proceden del mismo video/detector y por ello no se cuentan como
votos estadísticamente independientes.
"""
from __future__ import annotations

import math
from typing import Any

VERSION_CANDIDATOS = "onset-hypotheses-v1"


def _finito(valor: Any, defecto: float = 0.0) -> float:
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return defecto
    return numero if math.isfinite(numero) else defecto


def _es_indicio(metrica: dict) -> bool:
    return bool(metrica.get("evidencia_debil") or metrica.get("detectado") or
                int(metrica.get("pixeles_ruptura") or 0) > 0 or
                int(metrica.get("pixeles_blanco_nuevo") or 0) > 0 or
                int(metrica.get("pixeles_grieta_nueva") or 0) > 0)


def _centro(metrica: dict) -> tuple[float, float] | None:
    centro = metrica.get("centro_componente_norm")
    if isinstance(centro, (list, tuple)) and len(centro) == 2:
        x, y = _finito(centro[0], -1), _finito(centro[1], -1)
        if 0 <= x <= 1 and 0 <= y <= 1:
            return x, y
    caja = metrica.get("bbox_componente_norm")
    if isinstance(caja, (list, tuple)) and len(caja) == 4:
        x1, y1, x2, y2 = map(_finito, caja)
        if 0 <= x1 < x2 <= 1 and 0 <= y1 < y2 <= 1:
            return (x1 + x2) / 2, (y1 + y2) / 2
    return None


def _misma_microzona(a: dict, b: dict, tolerancia: float = 0.12) -> bool:
    ca, cb = _centro(a), _centro(b)
    if ca is None or cb is None:
        return True  # Sin geometría, se conserva como evidencia débil, no como corroboración independiente.
    return math.hypot(ca[0] - cb[0], ca[1] - cb[1]) <= tolerancia


def _senal_principal(metrica: dict) -> tuple[float, list[str]]:
    scores = metrica.get("scores_fuentes") or {}
    pixeles = max(int(metrica.get("pixeles_ruptura") or 0),
                  int(metrica.get("pixeles_blanco_nuevo") or 0),
                  int(metrica.get("pixeles_grieta_nueva") or 0))
    minimo = max(1, int(metrica.get("min_pixeles_debil") or 1))
    componente = max(int(metrica.get("componente_ruptura_px") or 0),
                     int(metrica.get("componente_blanco_px") or 0))
    min_componente = max(1, int(metrica.get("min_componente_debil") or 1))
    ruptura = min(1.0, max(pixeles / minimo, componente / min_componente) / 4.0)
    borde = min(1.0, _finito(scores.get("bordes_nuevos"),
                             _finito(metrica.get("fraccion_borde_nuevo"))) / 0.004)
    señales = []
    if _finito(scores.get("fisura")) > 0 or int(metrica.get("pixeles_grieta_nueva") or 0) > 0:
        señales.append("fisura_oscura")
    if _finito(scores.get("tela_clara")) > 0 or int(metrica.get("pixeles_blanco_nuevo") or 0) > 0:
        señales.append("material_claro_nuevo")
    if borde > 0:
        señales.append("borde_local_nuevo")
    return ruptura, señales


def generar_candidatos(metricas: list[dict], *, nbase: int = 0,
                        fps_adquisicion: float | None = None,
                        t0_local_ms: float = 0.0,
                        max_candidatos: int = 3,
                        max_hueco_frames: int = 1,
                        ventana_corrobora: int = 5) -> list[dict]:
    """Devuelve hasta ``max_candidatos`` hipótesis ordenadas por evidencia.

    Los índices de ``metricas`` corresponden a índices de fotograma nativos.
    La hora que aquí se calcula, cuando hay FPS fiables, es tiempo LOCAL al
    archivo; no demuestra sincronización con otras cámaras.
    """
    if not isinstance(metricas, list) or not metricas:
        return []
    inicio = max(0, int(nbase or 0))
    indices = [i for i in range(inicio, len(metricas))
               if isinstance(metricas[i], dict) and _es_indicio(metricas[i])]
    if not indices:
        return []

    episodios: list[list[int]] = []
    actual = [indices[0]]
    for indice in indices[1:]:
        if indice - actual[-1] <= max(1, int(max_hueco_frames)) + 1:
            actual.append(indice)
        else:
            episodios.append(actual)
            actual = [indice]
    episodios.append(actual)

    fps = _finito(fps_adquisicion, 0.0)
    if fps <= 0:
        fps = 0.0
    t0 = _finito(t0_local_ms, 0.0)
    candidatos = []
    for episodio in episodios:
        frame = int(episodio[0])  # Mantener el primer indicio, nunca el cuadro de mayor expansión.
        primera = metricas[frame]
        centro = _centro(primera)
        apoyos = [frame]
        fin = min(len(metricas) - 1, frame + max(1, int(ventana_corrobora)))
        for k in range(frame + 1, fin + 1):
            m = metricas[k]
            if _es_indicio(m) and _misma_microzona(primera, m):
                apoyos.append(k)
        continuidad = len(apoyos)
        ruptura, señales = _senal_principal(primera)
        scores = primera.get("scores_fuentes") or {}
        reflejo = _finito(scores.get("reflejo"))
        abombamiento = _finito(scores.get("abombamiento"))
        riesgo = []
        if primera.get("cambio_global_sospechoso"):
            riesgo.append("cambio_global_sospechoso")
        if reflejo > max(0.001, ruptura * 1.5):
            riesgo.append("posible_reflejo")
        if abombamiento > max(0.01, ruptura * 1.5) and ruptura < 0.5:
            riesgo.append("posible_abombamiento_sin_ruptura")
        continuidad_score = min(1.0, max(0, continuidad - 1) / 3.0)
        penalizacion = min(0.45, 0.16 * len(riesgo))
        score = max(0.0, min(1.0,
                    0.52 * ruptura + 0.18 * min(1.0, _finito(scores.get("bordes_nuevos")) / 0.004)
                    + 0.30 * continuidad_score - penalizacion))
        resolucion = 1000.0 / fps if fps else None
        tiempo = t0 + frame * resolucion if resolucion is not None else None
        intervalo = ([max(0.0, tiempo - resolucion / 2), tiempo + resolucion / 2]
                     if tiempo is not None and resolucion is not None else None)
        prev_inicio = max(inicio, frame - 4)
        previos_limpios = [k for k in range(prev_inicio, frame)
                           if not (_es_indicio(metricas[k]) and
                                   _misma_microzona(primera, metricas[k]))]
        candidatos.append({
            "frame": frame,
            "frame_confirmacion_sugerido": int(max(apoyos)),
            "frames_evidencia": sorted(set(apoyos)),
            "tiempo_local_ms": (round(tiempo, 6) if tiempo is not None else None),
            "intervalo_tiempo_local_ms": ([round(x, 6) for x in intervalo]
                                           if intervalo is not None else None),
            "resolucion_ms": round(resolucion, 6) if resolucion is not None else None,
            "origen_tiempo": "fps_adquisicion_local_no_sincronizado" if fps else "sin_fps_adquisicion_verificado",
            "score_candidato": round(score, 6),
            "score_es_probabilidad": False,
            "tipo_senales": señales,
            "bbox_norm": primera.get("bbox_componente_norm"),
            "microzona_centro_norm": list(centro) if centro else None,
            "pixeles_ruptura": int(primera.get("pixeles_ruptura") or 0),
            "continuidad_frames": continuidad,
            "frames_previos_limpios": len(previos_limpios),
            "razones_riesgo": riesgo,
            "limitaciones": ["Features correlacionadas del mismo video; no son votos independientes."],
            "version_candidatos": VERSION_CANDIDATOS,
        })

    candidatos.sort(key=lambda x: (-x["score_candidato"], x["frame"]))
    limite = max(1, min(10, int(max_candidatos or 3)))
    return candidatos[:limite]
