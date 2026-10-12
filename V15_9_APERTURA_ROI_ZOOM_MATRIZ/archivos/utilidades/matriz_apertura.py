"""Definición única de la matriz de apertura y del semáforo de tiempos.

V15.9: el dashboard y el Excel dejan de duplicar reglas. Este módulo define:

- Las columnas de la matriz (HT/RT/NT × UGL/OGL/NOM) con su cantidad esperada.
- La evaluación del semáforo de apertura a partir de los límites confirmados
  (verde ≤ V, V < amarillo ≤ A, rojo > A) con valores por defecto 6/7 ms.
- La construcción de las celdas: ocupada (verde/amarillo/rojo/gris con motivo)
  o vacante (posición esperada sin caso asignado). Nunca se inventan IDs ni
  tiempos y nunca se sustituye la ausencia de medición por cero.

Los valores sólo se colorean cuando son finitos, no negativos y confiables
(``estado`` ni ``conflicto``/``pendiente_revision`` ni ``requiere_revision``).
"""
from __future__ import annotations

import math
import re
from typing import Iterable

from configuracion import evaluar_criterio

# Orden visual de la matriz resumen (izquierda -> derecha) y cupos esperados.
COLUMNAS_MATRIZ: list[dict] = [
    {"id": "HT_UGL", "col": "D", "temperature_condition": "HT", "inflator_type": "UGL",
     "temperatura": "+85°C", "generador": "UGL", "esperados": 5},
    {"id": "HT_OGL", "col": "E", "temperature_condition": "HT", "inflator_type": "OGL",
     "temperatura": "+85°C", "generador": "OGL", "esperados": 5},
    {"id": "HT_NOM", "col": "F", "temperature_condition": "HT", "inflator_type": "NOM",
     "temperatura": "+85°C", "generador": "nominal", "esperados": 10},
    {"id": "RT_NOM", "col": "G", "temperature_condition": "RT", "inflator_type": "NOM",
     "temperatura": "RT", "generador": "nominal", "esperados": 10},
    {"id": "NT_NOM", "col": "H", "temperature_condition": "NT", "inflator_type": "NOM",
     "temperatura": "-35°C", "generador": "nominal", "esperados": 10},
    {"id": "NT_OGL", "col": "I", "temperature_condition": "NT", "inflator_type": "OGL",
     "temperatura": "-35°C", "generador": "OGL", "esperados": 5},
    {"id": "NT_UGL", "col": "J", "temperature_condition": "NT", "inflator_type": "UGL",
     "temperatura": "-35°C", "generador": "UGL", "esperados": 5},
]

COMBINACIONES_MATRIZ = {(s["temperature_condition"], s["inflator_type"]) for s in COLUMNAS_MATRIZ}

# Valores iniciales del proyecto: 5.8 ms -> verde; 6.4 ms -> amarillo; 7.2 ms -> rojo.
VERDE_PREDETERMINADO_MS = 6.0
AMARILLO_PREDETERMINADO_MS = 7.0

_ESTADOS_NO_COLOR = {"conflicto", "pendiente_revision", "error", "descartado"}
_RE_VERDE = re.compile(r"^<=\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:ms)?$", re.IGNORECASE)
_RE_ROJO = re.compile(r"^>\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:ms)?$", re.IGNORECASE)


def limites_predefinidos() -> tuple[float, float]:
    """(verde hasta, amarillo hasta) predeterminados del proyecto: 6.0 / 7.0 ms."""
    return VERDE_PREDETERMINADO_MS, AMARILLO_PREDETERMINADO_MS


def criterio_desde_limites(verde_max: float, amarillo_max: float) -> dict:
    """Reglas legibles del semáforo a partir de los dos límites numéricos."""
    verde, amarillo = validar_limites(verde_max, amarillo_max)
    return {"verde": f"<= {verde:g}", "amarillo": f"{verde:g}-{amarillo:g}",
            "rojo": f"> {amarillo:g}"}


def validar_limites(verde_max, amarillo_max) -> tuple[float, float]:
    """Valida los límites: números finitos, no negativos y 0 ≤ verde < amarillo."""
    for valor in (verde_max, amarillo_max):
        if isinstance(valor, bool) or not isinstance(valor, (int, float)) \
                or not math.isfinite(valor):
            raise ValueError("Los límites deben ser números finitos (se admiten decimales en ms).")
    verde, amarillo = float(verde_max), float(amarillo_max)
    if verde < 0 or amarillo < 0:
        raise ValueError("Los límites no pueden ser negativos.")
    if not verde < amarillo:
        raise ValueError("Los límites deben cumplir: 0 ≤ verde < amarillo; el rojo queda por encima.")
    return verde, amarillo


def limites_desde_criterio(criterio: dict | None) -> tuple[float, float]:
    """Recupera (verde, amarillo) desde las reglas de texto del criterio."""
    criterio = criterio or {}
    m_v = _RE_VERDE.match(str(criterio.get("verde") or "").strip())
    m_r = _RE_ROJO.match(str(criterio.get("rojo") or "").strip())
    if m_v and m_r:
        try:
            return validar_limites(float(m_v.group(1).replace(",", ".")),
                                   float(m_r.group(1).replace(",", ".")))
        except ValueError:
            pass
    return limites_predefinidos()


def criterio_apertura_efectivo(reglas: dict | None = None,
                               criterios_usuario: dict | None = None,
                               instantanea: dict | None = None) -> tuple[dict, str]:
    """Criterio vigente y su origen: instantánea de ejecución > usuario > YAML/default.

    Devuelve (criterio_texto, origen) con origen en
    ``instantanea_ejecucion | criterios_usuario | predeterminado``.
    """
    if instantanea:
        try:
            verde, amarillo = validar_limites(instantanea.get("verde_max"),
                                              instantanea.get("amarillo_max"))
            return criterio_desde_limites(verde, amarillo), "instantanea_ejecucion"
        except (ValueError, TypeError):
            pass
    if criterios_usuario:
        try:
            verde, amarillo = validar_limites(criterios_usuario.get("verde_max"),
                                              criterios_usuario.get("amarillo_max"))
            return criterio_desde_limites(verde, amarillo), "criterios_usuario"
        except (ValueError, TypeError):
            pass
    reglas = reglas or {}
    criterio = (reglas.get("criterios") or {}).get("tiempo_apertura_ms")
    if criterio:
        try:
            return dict(criterio), "yaml"
        except (TypeError, ValueError):
            pass
    verde, amarillo = limites_predefinidos()
    return criterio_desde_limites(verde, amarillo), "predeterminado"


def _numero_ms(valor):
    if isinstance(valor, bool) or valor in {None, "", "--", "-"}:
        return None
    try:
        numero = float(str(valor).strip().lower().replace("ms", "").replace(",", "."))
    except (TypeError, ValueError):
        return None
    return numero if math.isfinite(numero) else None


def valor_confiable(dato) -> float | None:
    """Valor usable para colorear: finito, ≥ 0 y sin revisión/conflicto pendiente."""
    if dato is None:
        return None
    if isinstance(dato, dict):
        if dato.get("requiere_revision") or str(dato.get("estado") or "") in _ESTADOS_NO_COLOR:
            return None
        numero = _numero_ms(dato.get("valor"))
    else:
        numero = _numero_ms(dato)
    if numero is None or numero < 0:
        return None
    return numero


def evaluar_apertura(valor_ms, criterio: dict, dato=None) -> tuple[str, float | None, str]:
    """(estado, valor, motivo) de una celda de apertura.

    ``estado`` en verde/amarillo/rojo/gris. El motivo explica el gris:
    ``sin_tiempo``, ``valor_no_finito``, ``valor_negativo``, ``pendiente_revision``,
    ``conflicto`` o ``sin_caso`` (posición vacante) — o ``ok`` cuando hay color.
    """
    if dato is None and isinstance(valor_ms, dict):
        dato, valor_ms = valor_ms, valor_ms.get("valor")
    if dato is not None and (dato.get("requiere_revision")
                             or str(dato.get("estado") or "") in _ESTADOS_NO_COLOR):
        motivo = ("conflicto" if str(dato.get("estado") or "") == "conflicto"
                  else "pendiente_revision")
        return "gris", _numero_ms(dato.get("valor")), motivo
    numero = _numero_ms(valor_ms)
    if numero is None:
        return "gris", None, "sin_tiempo"
    if not math.isfinite(numero):
        return "gris", None, "valor_no_finito"
    if numero < 0:
        return "gris", None, "valor_negativo"
    estado = evaluar_criterio(criterio, numero) or "gris"
    return estado, numero, ("ok" if estado != "gris" else "sin_regla")


def regla_publica(criterio: dict, origen: str | None = None, nota_gris: str | None = None) -> dict:
    """Texto de leyenda común para el dashboard y el Excel.

    Los límites numéricos se muestran con la unidad «ms» (p. ej. ``<= 6 ms``),
    como publica la API del dashboard desde V15.8.
    """
    def _con_unidad(valor) -> str:
        texto = str(valor or "—")
        return texto if "ms" in texto.lower() or texto == "—" else f"{texto} ms"

    regla = {
        "verde": _con_unidad(criterio.get("verde")),
        "amarillo": _con_unidad(criterio.get("amarillo")),
        "rojo": _con_unidad(criterio.get("rojo")),
        "gris": nota_gris or "sin tiempo confiable, pendiente/conflicto o sin caso",
    }
    if origen:
        regla["origen_criterio"] = origen
    return regla


def _campo_resultado(fila: dict, clave: str):
    dato = (fila.get("campos") or {}).get(clave)
    if isinstance(dato, dict):
        return dato
    if dato not in {None, ""}:
        return {"valor": dato}
    return None


def _test_number(fila: dict):
    dato = _campo_resultado(fila, "test_number")
    if isinstance(dato, dict) and dato.get("valor") not in {None, ""}:
        return dato.get("valor")
    return fila.get("test_number") or fila.get("identificador") or fila.get("nombre")


def _clave_orden(fila: dict):
    valor = _test_number(fila)
    try:
        return (0, int(str(valor).strip()))
    except (TypeError, ValueError):
        return (1, str(valor or ""))


def celda_caso(fila: dict, criterio: dict) -> dict:
    """Celda ocupada por un caso, con estado y motivo trazables.

    Acepta tanto resultados crudos (``campos.opening_time_ms``) como filas ya
    publicadas por el backend (``semaforo_apertura`` + ``opening_time_ms``), en
    cuyo caso se respeta el estado publicado para no evaluar dos veces.
    """
    if "campos" in fila:
        dato = _campo_resultado(fila, "opening_time_ms")
        estado, valor, motivo = evaluar_apertura(dato, criterio)
    else:
        valor = _numero_ms(fila.get("opening_time_ms"))
        pendiente = _numero_ms(fila.get("opening_time_pendiente_ms"))
        estado = str(fila.get("semaforo_apertura") or "gris")
        motivo = fila.get("apertura_motivo")
        if estado != "gris" and valor is not None:
            motivo = "ok"
        elif not motivo:
            motivo = ("sin_tiempo" if pendiente is None else "pendiente_revision")
        if estado == "gris" and valor is None and pendiente is not None:
            valor = pendiente
    es_gris = estado == "gris"
    return {
        "tipo": "caso",
        "id": fila.get("id"),
        "test_number": _test_number(fila),
        "estado": estado,
        "motivo_estado": motivo,
        "opening_time_ms": (None if valor is None or es_gris else round(float(valor), 3)),
        "tiempo_pendiente_ms": (round(float(valor), 3) if es_gris and valor is not None else None),
        "enlace": fila.get("enlace"),
    }


def celda_vacante(indice: int) -> dict:
    """Posición esperada sin caso asignado: nunca lleva ID ni tiempo."""
    return {"tipo": "vacante", "id": None, "test_number": None,
            "estado": "vacante", "motivo_estado": "sin_caso",
            "opening_time_ms": None, "enlace": None, "posicion": indice}


def agrupar_casos(filas: Iterable[dict]) -> tuple[dict[tuple[str, str], list[dict]], list[dict]]:
    """Separa los casos por columna de matriz y los que quedan sin clasificar."""
    por_columna: dict[tuple[str, str], list[dict]] = {c: [] for c in COMBINACIONES_MATRIZ}
    sin_clasificar: list[dict] = []
    for fila in filas:
        temp = str(fila.get("temperature_condition") or "").upper()
        gen = str(fila.get("inflator_type") or "").upper()
        etapa = str(fila.get("tipo_st") or "").upper()
        clave = (temp, gen)
        if etapa in {"1ST", "2ST"} and clave in COMBINACIONES_MATRIZ:
            por_columna[clave].append(fila)
        else:
            sin_clasificar.append(fila)
    for grupo in por_columna.values():
        grupo.sort(key=_clave_orden, reverse=True)
    sin_clasificar.sort(key=_clave_orden)
    return por_columna, sin_clasificar


def construir_columnas(filas_etapa: list[dict], criterio: dict) -> list[dict]:
    """Columnas con TODAS sus posiciones: cupos ``esperados`` y expansión si hay más."""
    por_columna, _ = agrupar_casos(filas_etapa)
    columnas = []
    for spec in COLUMNAS_MATRIZ:
        grupo = por_columna[(spec["temperature_condition"], spec["inflator_type"])]
        cupos = max(int(spec["esperados"]), len(grupo))
        celdas = [celda_vacante(i + 1) for i in range(cupos - len(grupo))]
        celdas.extend(celda_caso(f, criterio) for f in grupo)
        columnas.append({**spec, "celdas": celdas, "ocupados": len(grupo),
                         "cupos": cupos, "esperados": int(spec["esperados"])})
    return columnas


def construir_sin_clasificar(filas_fuera: list[dict], criterio: dict) -> list[dict]:
    """Casos visibles fuera de las columnas: sin etapa/temperatura/generador verificable."""
    salida = []
    for fila in filas_fuera:
        celda = celda_caso(fila, criterio)
        celda.update({
            "tipo_st": fila.get("tipo_st"),
            "temperature_condition": fila.get("temperature_condition"),
            "inflator_type": fila.get("inflator_type"),
        })
        salida.append(celda)
    return salida


def construir_matriz_dashboard(filas: list[dict], criterio: dict,
                               origen: str | None = None) -> dict | None:
    """Matriz completa para el dashboard (todas las posiciones, nunca invisibles)."""
    if not filas:
        return None
    etapas = []
    for tipo_st in ("1ST", "2ST"):
        etapa = [f for f in filas if str(f.get("tipo_st") or "").upper() == tipo_st]
        if not etapa:
            continue
        etapas.append({"tipo_st": tipo_st, "columnas": construir_columnas(etapa, criterio)})
    _, fuera = agrupar_casos(filas)
    sin_clasificar = construir_sin_clasificar(fuera, criterio)
    if not etapas and not sin_clasificar:
        return None
    return {
        "etapas": etapas,
        "sin_clasificar": sin_clasificar,
        "regla": regla_publica(criterio, origen),
        "criterio": dict(criterio),
        "origen_criterio": origen,
    }
