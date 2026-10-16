# INFORME R15.5 — Corrección por hallazgo

Fuente: `AUDITORIA_INDEPENDIENTE_R15_4_20261016.md` (veredicto: «adecuada para
pruebas controladas, NO Production Ready definitiva»). R15.5 = atomicidad
global + pruebas de fallo doble + cierre de evidencia, **sin funciones
nuevas**. Cada hallazgo se reprodujo primero en una prueba ROJA (RED) y se
cerró después (GREEN); los logs están en `evidencia/ejecucion/`.

## HIGH-01 — Una confirmación fallida puede entrenar el detector de todos modos

- **Repro del auditor:** `revisar_video` con estado `confirmado`, frame y
  microzona válidos, y fallo inyectado en la escritura del documento
  (`escribir_json_seguro`): la petición terminaba en 503 pero el ejemplo
  permanecía en el dataset de eventos con sus frames.
- **Corrección (P1: efectos autoritativos vs opcionales):** la confirmación
  humana es el efecto autoritativo y se commitea primero dentro de la
  transacción; `guardar_ejemplo_evento` y el entrenamiento pasan a ser
  efectos OPCIONALES post-commit. Si el aprendizaje falla, la respuesta es
  éxito + advertencia (`aprendizaje_evento.error`); jamás se revierte la
  confirmación. Si el commit falla, el dataset no llega a tocarse.
- **Verificación:** `test_v15_10_1_r155_aprendizaje_post_commit.py` — 4
  pruebas con rutas reales de dataset redirigidas a tmp (efecto observable):
  fallo de commit ⇒ dataset y frames sin cambios; fallo de aprendizaje ⇒
  éxito + advertencia; éxito ⇒ entrena tras commit; estado pendiente no
  entrena nunca. RED 1F → GREEN 4/4.
- **Estado:** CERRADO (commit F1, consolidado en `922e8b3`).

## P0 + MEDIUM-05 — Coordinador único; rollback fallido afirmaba algo falso

- **Repro del auditor:** `revertir_zona_video` con fallo del commit Y fallo
  de `restaurar_perfil_zona`: el mensaje afirmaba «zona revertida a su estado
  anterior» aunque la restauración había fallado; sin declaración de
  inconsistencia ni bloqueo; y la compensación estaba duplicada endpoint por
  endpoint (6 copias).
- **Corrección:** capa común `TransaccionMultiAlmacen` con contrato único:
  `capturar` (snapshot pendiente, NO registrado hasta la aplicación real —
  evita inconsistencias falsas cuando el propio efecto falla) → `aplicado`
  (registro) → `compensar` (orden inverso, restauración VERIFICADA) →
  `fallar` (traducción: doble fallo ⇒ 503 «ATENCIÓN: estado potencialmente
  inconsistente…» + efectos no restaurados + acción manual recomendada; fallo
  de escritura compensado ⇒ 503 «no se pudo guardar… no produjo efectos
  persistentes»; resto ⇒ re-lanza) → `exito` (limpia registro residual).
  Registro durable `estado_inconsistente.json` + bloqueo del recurso
  (`_assert_recurso_consistente` ⇒ 503) hasta resolución manual explícita
  (`_resolver_inconsistencias`). La excepción de compensación NUNCA se
  ignora. `revisar_video`, `aprender_zona_video` y `revertir_zona_video`
  migrados; el ancla «DESHIZO» del 500 de revertir se conserva.
- **Verificación:** `test_v15_10_1_r155_transaccion_coordinada.py` — 6
  pruebas: doble fallo en aprender/revertir/revisar ⇒ mensaje «inconsistente»
  y nunca «revertido»; bloqueo de operaciones incompatibles hasta resolución;
  fallo simple compensado ⇒ mensaje unificado sin bloqueo; registro que
  persiste en disco, sobrevive recarga, bloquea (503) y se resuelve.
  RED 6F → GREEN 6/6.
- **Estado:** CERRADO (commit F2 `03b4e8e`*, consolidado en `922e8b3`).

## HIGH-02 — Rotación: documento confirmado antes que el almacén

- **Repro del auditor:** `guardar_rotacion` (carpeta) con fallo inyectado en
  `GestorAprendizaje.actualizar_rotacion`: `validacion_resultados.json`
  quedaba con revisión 4, geometría rotada y `rotacion_manual_aplicada_grados=90`
  mientras el almacén de rotaciones no recibió nada.
- **Corrección:** orden transaccional nuevo bajo lock: CAS fresco → giro
  calculado en memoria (`_rotar_en_fresco` sobre el documento fresco) →
  snapshot del almacén (`snapshot_evidencias_imagen`, que ahora incluye
  `rotaciones_imagen` y gana `tipo_revision` carpeta/externa) → efectos
  externos (rotación + `rotar_evidencias_imagen` + estado de revisión) →
  commit documental AL FINAL. Fallo de almacén ⇒ 503 controlado con efectos
  restaurados; fallo de commit ⇒ restauración verificada; doble fallo ⇒
  inconsistencia + bloqueo del recurso. La rama externa comparte la política
  con `_guardar_json_atomico` como commit final.
- **Verificación:** `test_v15_10_1_r155_rotacion_transaccional.py` — 4
  pruebas (ítem 2 del plan P1): repro con documento byte a byte intacto +
  revisión + almacén vacío; fallo de commit restaura rotación/evidencias;
  doble fallo ⇒ inconsistente + bloqueo + resolución + operación sana; éxito
  coherente documento/almacén. RED 2F → GREEN 4/4.
- **Estado:** CERRADO (commit F3 `b465151`*, consolidado en `922e8b3`).

## HIGH-03 — Verificar imagen aplicado aunque falle la revisión durable

- **Repro del auditor:** `verificar_imagen` commiteaba el documento
  («verificada», revisión nueva) y DESPUÉS llamaba `actualizar_revision`;
  fallo del almacén ⇒ UI de revisión y documento divergen.
- **Corrección:** el estado de revisión es efecto compensable aplicado ANTES
  del commit, vía coordinador (helpers `_capturar_revision_estado` /
  `_restaurar_revision_estado`; fila ausente ⇒ DELETE en la restauración).
  El recurso queda registrado/bloqueable por ruta de imagen.
- **Verificación:** `test_v15_10_1_r155_verificacion_externa.py` — ítem 3
  del plan P1: repro del auditor (documento byte a byte intacto + revisión +
  `estado_imagen` sin cambiar); fallo de commit ⇒ estado de revisión
  restaurado (fila ausente); éxito coherente. RED → GREEN 6/6 del archivo.
- **Estado:** CERRADO (en `922e8b3`).

## MEDIUM-04 — Rama externa `sin-datos` sin compensar

- **Repro del auditor:** `marcar_imagen_sin_datos` externa escribía SQLite
  (`registrar_imagen_sin_datos`) y sólo después el JSON externo; fallo de
  escritura ⇒ marca «sin datos» huérfana en SQLite.
- **Corrección:** ambas ramas de `marcar_imagen_sin_datos` y
  `restaurar_imagen_con_texto` bajo la MISMA política: marca sin-datos y
  estado de revisión como efectos compensables antes del commit (documento
  oficial o JSON externo). La garantía V15.9.3 de `restaurar_imagen_con_texto`
  (transacción sqlite abierta hasta confirmar el JSON) se conserva.
- **Verificación:** ítem 4 del plan P1: fallo JSON externo ⇒ marca SQLite
  restaurada y JSON ausente; éxito externo coherente (JSON + SQLite +
  revisión); restaurar con-texto con fallo de revisión ⇒ documento y marca
  intactos. `test_restaurar_texto_unittest.py` (arnés legacy adaptado) sigue
  probando el contrato V15.9.3 original.
- **Estado:** CERRADO (en `922e8b3`).

## LOW-06 — Soak mide antes del warm-up (falso fallo)

- **Repro del auditor:** RSS 113–146 MB → ~278 MB tras el PRIMER análisis
  (carga perezosa de OpenCV/codec) → estable 281–311 MB; el umbral de +60 MB
  sobre `rss0` prematura daba falso fallo de fuga.
- **Corrección:** warm-up de 2 análisis antes de capturar `fds0`/`rss0`
  (corrección recomendada textualmente por el auditor). Umbrales sin cambio.
- **Verificación:** `test_v15_10_1_r154_soak_analisis_video.py` verde en dev
  y en las simulaciones (100 análisis sin degradación ni fugas).
- **Estado:** CERRADO (commit `9a50dc7`).

## LOW-07 — Discrepancias documentales de inventario

- **Hallazgo:** changelog R15.4 hablaba de 114 entradas vs 123 del
  manifiesto; árbol del auditor con 39 `.cjs` vs 38 declarados; README con
  «instalación vigente `INSTALAR_R15_3`».
- **Corrección:** manifiesto, SHA256SUMS y conteos del paquete generados
  automáticamente por el build de doble pasada (ninguna cifra manual);
  README actualizado a `INSTALAR_R15_5`; inventario Node verificado del árbol
  (38 activos = 13 del parche + 25 heredados; 8 históricos de archivo; ver
  `MATRIZ_EVIDENCIA_R15_5.md` §3 con comandos reproducibles).
- **Estado:** CERRADO (este release; los docs R15.4 históricos no se reescriben).

## Pendientes de campo (sin cambio respecto a R15.4)

- **FIELD — Instalador en Windows real:** sin pwsh en sandbox; pruebas
  estáticas de código fuente. Matriz real pendiente (proceso activo, CIM/WMI
  caído, `-Force`, archivo bloqueado, error a mitad, rollback, reinstalación).
- **FIELD — Calibración Tmax con videos reales:** umbrales 2 % / 25 px /
  3 frames = calibración inicial documentada. Regla Tmax intacta: sin
  evidencia suficiente ⇒ NO CONFIRMADO.

## Regresión y evidencia global

- Suite completa: **1010 passed / 0 failed** (×2 pasadas) · Node **38/38**.
- Regresiones dirigidas por fase: 31 (F2), 41 (F2+r153), 14 (F3 rotación/
  externas), 76 (F4 R15.2–R15.5), 24 (F5/F6 identidad+instalador+soak).
- Logs RED/GREEN por fase + simulaciones A/B/C: `evidencia/ejecucion/`.
- \* Commits originales F1–F3 perdidos por borrado de `.git` en el sandbox;
  contenido reaplicado íntegro en `922e8b3` (ver CHANGELOG «Fases y commits»).
