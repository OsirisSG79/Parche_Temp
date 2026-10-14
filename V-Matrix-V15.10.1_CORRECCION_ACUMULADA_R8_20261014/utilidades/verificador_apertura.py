"""Verificador conservador de candidatos de apertura (modo sombra).

Busca señales a favor y en contra del candidato usando las mismas métricas del
video. No se anuncia como fuente independiente ni autoconfirma resultados.
"""
from __future__ import annotations

import math
from typing import Any

VERSION_VERIFICADOR = "verificador-apertura-v1"


def _finito(valor: Any, defecto: float = 0.0) -> float:
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return defecto
    return numero if math.isfinite(numero) else defecto


def _es_indicio(metrica: dict | None) -> bool:
    if not isinstance(metrica, dict):
        return False
    return bool(
        metrica.get("evidencia_debil") or metrica.get("detectado")
        or int(metrica.get("pixeles_ruptura") or 0) > 0
        or int(metrica.get("pixeles_blanco_nuevo") or 0) > 0
        or int(metrica.get("pixeles_grieta_nueva") or 0) > 0
    )


def _centro(metrica: dict | None) -> tuple[float, float] | None:
    if not isinstance(metrica, dict):
        return None
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


def _misma_microzona(a: dict | None, b: dict | None, tolerancia: float = 0.12) -> bool:
    ca, cb = _centro(a), _centro(b)
    if ca is None or cb is None:
        return True
    return math.hypot(ca[0] - cb[0], ca[1] - cb[1]) <= tolerancia


def verificar_candidato(candidato: dict | None,
                        metricas: list[dict] | None,
                        *,
                        nbase: int = 0,
                        calidad_video: dict | None = None,
                        calidad_roi: dict | None = None,
                        advertencias: list[str] | None = None) -> dict:
    """Evalúa un candidato sin autoconfirmarlo.

    Devuelve razones a favor/en contra y un estado conservador. La salida es
    apta para UI, auditoría y política de abstención.
    """
    candidato = candidato if isinstance(candidato, dict) else {}
    metricas = metricas if isinstance(metricas, list) else []
    calidad_video = calidad_video if isinstance(calidad_video, dict) else {}
    calidad_roi = calidad_roi if isinstance(calidad_roi, dict) else {}
    advertencias = [a for a in (advertencias or []) if a]

    frame = candidato.get("frame")
    try:
        frame = int(frame)
    except (TypeError, ValueError, OverflowError):
        frame = None

    razones_a_favor: list[str] = []
    razones_en_contra: list[str] = []
    fotogramas_evidencia: list[int] = []

    if frame is None or frame < 0 or frame >= len(metricas):
        razones_en_contra.append("candidato_fuera_de_rango")
        return {
            "estado_revision": "no_evaluable",
            "razones_a_favor": razones_a_favor,
            "razones_en_contra": razones_en_contra,
            "fotogramas_evidencia": fotogramas_evidencia,
            "calidad_registro": "desconocida",
            "es_independiente_del_detector": False,
            "auto_confirmable": False,
            "probabilidad_calibrada": None,
            "version_verificador": VERSION_VERIFICADOR,
        }

    primera = metricas[frame]
    previos = range(max(int(nbase or 0), frame - 4), frame)
    posteriores = range(frame + 1, min(len(metricas), frame + 5))

    evidencia_previa = [k for k in previos if _es_indicio(metricas[k]) and _misma_microzona(primera, metricas[k])]
    continuidad = [k for k in posteriores if _es_indicio(metricas[k]) and _misma_microzona(primera, metricas[k])]
    fotogramas_evidencia = [frame] + continuidad[:]

    if not evidencia_previa:
        razones_a_favor.append("previos_limpios")
    else:
        razones_en_contra.append("evidencia_previa_en_misma_microzona")

    if continuidad:
        razones_a_favor.append("continuidad_espacial_posterior")
    else:
        razones_en_contra.append("sin_continuidad_posterior")

    scores = primera.get("scores_fuentes") or {}
    if _finito(scores.get("reflejo")) > max(0.01, _finito(scores.get("fisura")) * 1.5):
        razones_en_contra.append("posible_reflejo")
    if _finito(scores.get("abombamiento")) > max(0.01, _finito(scores.get("fisura")) * 1.5):
        razones_en_contra.append("posible_abombamiento")
    if primera.get("cambio_global_sospechoso"):
        razones_en_contra.append("cambio_global_sospechoso")

    if calidad_roi.get("alineacion_confiable") is False:
        razones_en_contra.append("alineacion_roi_no_confiable")
    if calidad_roi.get("ocluida") is True:
        razones_en_contra.append("roi_ocluida")
    if calidad_video.get("overlay_contradictorio"):
        razones_en_contra.append("overlay_contradictorio")
    if advertencias:
        razones_en_contra.extend([f"advertencia:{str(a)}" for a in advertencias])

    if "candidato_fuera_de_rango" in razones_en_contra:
        estado = "no_evaluable"
    elif evidencia_previa:
        estado = "revisar_conflicto"
    elif continuidad and not [r for r in razones_en_contra if not r.startswith("advertencia:")]:
        estado = "propuesta_alta_confianza"
    elif continuidad:
        estado = "evidencia_corrobora"
    else:
        estado = "propuesta_revisar"

    return {
        "estado_revision": estado,
        "razones_a_favor": razones_a_favor,
        "razones_en_contra": razones_en_contra,
        "fotogramas_evidencia": fotogramas_evidencia,
        "calidad_registro": "suficiente" if "alineacion_roi_no_confiable" not in razones_en_contra else "limitada",
        "es_independiente_del_detector": False,
        "auto_confirmable": False,
        "probabilidad_calibrada": None,
        "version_verificador": VERSION_VERIFICADOR,
    }
