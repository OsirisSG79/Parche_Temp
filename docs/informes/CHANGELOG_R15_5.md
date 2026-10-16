# CHANGELOG — V-Matrix V15.10.1 R15.5

- **Versión:** 15.10.1-r15.5 (`PATCH_BUILD` en `dashboard/backend/app.py`; caché frontend `?v=15.10.1-r15.5`; `VERSION.txt`; marker `PATCH_INSTALLED_V15_10_1_R15_5.json` — las cuatro fuentes reportan la MISMA versión)
- **Fecha:** 2026-10-16
- **Base:** V15.10.1 R15.4 sobre R15.3 sobre R15.2 sobre R15.1 sobre R15 sobre R14 sobre V15.9.10 (N17 aceptado). Acumulativo: `INSTALAR_R15_5` acepta bases `15.10.1-r14` … `15.10.1-r15.5` (VERSION.txt o marker **validado por contenido**) y aborta sobre cualquier otra carpeta ANTES de modificar nada.
- **Origen:** `AUDITORIA_INDEPENDIENTE_R15_4_20261016.md` — veredicto «la versión más sólida de la serie R15; adecuada para pruebas controladas, aún NO Production Ready definitiva». R15.5 cierra HIGH-01, HIGH-02, HIGH-03, MEDIUM-04, MEDIUM-05, LOW-06 y LOW-07 e implementa el plan P0/P1/P2 del auditor (coordinador único, efectos autoritativos vs opcionales, pruebas adversariales, soak e inventarios). Quedan pendientes de campo: instalación/rollback en Windows real y calibración Tmax con videos reales (como en R15.1–R15.4). **Sin funciones nuevas** — versión de cierre transaccional, pequeña y enfocada, como pidió el auditor.
- **Suite final:** 1010 passed / 0 failed (Python, árbol dev completo, ×2 pasadas) · 38/38 verdes (Node `.cjs` activos en `pruebas/`) · simulaciones A (instalación limpia), B (instalación usada) y C (upgrade R15.4→R15.5): ver `evidencia/ejecucion/`.
- **Filosofía intacta:** no inventar certeza; la intervención humana es la excepción, no el flujo; «petición rechazada» = «petición sin efectos»; «petición fallida» = «almacenes coherentes o inconsistencia DECLARADA y bloqueada» (reforzado en R15.5); nunca pérdida silenciosa; R16 (trigger eléctrico, volumen/presión) fuera de alcance.

## Hallazgos cerrados

| # | Hallazgo | Corrección | Pruebas |
|---|---|---|---|
| HIGH-01 | Una confirmación fallida podía entrenar el detector de todos modos: `revisar_video` con estado `confirmado` escribía el dataset de eventos + frames ANTES del commit documental; si el commit fallaba, el ejemplo de aprendizaje sobrevivía a una petición fallida | **P1 del auditor (efectos autoritativos vs opcionales):** la confirmación humana es autoritativa y se commitea primero, transaccional; el aprendizaje (`guardar_ejemplo_evento`, entrenamiento) es OPCIONAL y ocurre DESPUÉS del commit — si falla, la respuesta es éxito + advertencia visible (`aprendizaje_evento` con `error`), nunca revierte la confirmación. Commit fallido ⇒ dataset y frames sin cambios (por construcción y por prueba) | `test_v15_10_1_r155_aprendizaje_post_commit.py` (4: fallo de commit ⇒ dataset intacto; fallo de aprendizaje ⇒ éxito + advertencia; éxito ⇒ entrena tras commit; estado pendiente no entrena nunca) |
| P0 + MEDIUM-05 | Compensación endpoint por endpoint (6 copias de la misma lógica en R15.4); y si el rollback de ROI también fallaba, el mensaje afirmaba algo falso («revertido») sin declaración de inconsistencia ni bloqueo | **Coordinador transversal único** `TransaccionMultiAlmacen` (`dashboard/backend/app.py`): `capturar` (snapshot pendiente) → `aplicado` (registro tras aplicación real) → `compensar` (orden inverso, restauración VERIFICADA) → `fallar` (traducción única) → `exito`. Doble fallo ⇒ 503 «ATENCIÓN: estado potencialmente inconsistente…» (NUNCA «revertido»), registro durable en `estado_inconsistente.json` y **bloqueo del recurso** (`_assert_recurso_consistente` ⇒ 503 en operaciones incompatibles) hasta resolución manual explícita (`_resolver_inconsistencias`). La excepción de compensación jamás se ignora: se agrega al mensaje y al registro. `revisar_video`, `aprender_zona_video` y `revertir_zona_video` migrados al coordinador; el mensaje 500 de revertir conserva el ancla «DESHIZO» con la semántica nueva (compensación verificada) | `test_v15_10_1_r155_transaccion_coordinada.py` (6: doble fallo aprender/revisar/revertir ⇒ «inconsistente» sin «revertido»; bloqueo hasta resolución; fallo simple ⇒ mensaje unificado; registro durable que sobrevive recarga y se resuelve) |
| HIGH-02 | Rotación: `mutar_documento` confirmaba el giro (revisión nueva, `rotacion_manual_aplicada_grados`) ANTES de `actualizar_rotacion`; con fallo del almacén, documento rotado y almacén sin el cambio (repro del auditor) | `guardar_rotacion` en una sola transacción: lock + CAS fresco → giro calculado en memoria → snapshot del almacén → efectos externos (rotación + `rotar_evidencias_imagen` + estado de revisión) → **commit documental AL FINAL**. Fallo de almacén ⇒ 503 controlado con efectos restaurados; fallo de commit ⇒ restauración verificada; doble fallo ⇒ inconsistencia + bloqueo. Rama externa: mismos efectos compensables con `_guardar_json_atomico` como commit final. `rotaciones_imagen` entra en `_TABLAS_EVIDENCIA_IMAGEN`; `snapshot_evidencias_imagen` gana `tipo_revision` (carpeta/externa) | `test_v15_10_1_r155_rotacion_transaccional.py` (4: repro del auditor con documento byte a byte intacto + revisión + almacén; fallo de commit restaura rotación/evidencias; doble fallo ⇒ inconsistente + bloqueo + resolución; éxito coherente documento/almacén) |
| HIGH-03 | `verificar_imagen` commiteaba el documento y DESPUÉS actualizaba la revisión durable; si el almacén fallaba, el documento quedaba «verificada» y el estado de revisión humano pendiente (UI y documento divergen) | El estado de revisión es efecto compensable aplicado ANTES del commit documental, vía coordinador (helpers `_capturar_revision_estado`/`_restaurar_revision_estado`; fila ausente ⇒ DELETE en la restauración). Fallo ⇒ 503 controlado, documento intacto | `test_v15_10_1_r155_verificacion_externa.py` (3 de verificar: repro del auditor; fallo de commit restaura estado de revisión; éxito coherente) |
| MEDIUM-04 | Rama externa de `marcar_imagen_sin_datos` sin compensar: `registrar_imagen_sin_datos` (SQLite) y sólo después `_guardar_json_atomico`; fallo JSON ⇒ marca «sin datos» huérfana | Ambas ramas (carpeta y externa) de `marcar_imagen_sin_datos` y `restaurar_imagen_con_texto` comparten la MISMA política vía coordinador: marca + estado de revisión compensables antes del commit (documento oficial o JSON externo). La garantía V15.9.3 de `restaurar_imagen_con_texto` (transacción sqlite abierta hasta confirmar JSON) se conserva y se le suma el estado de revisión compensable | `test_v15_10_1_r155_verificacion_externa.py` (3: repro externa fallo JSON ⇒ SQLite restaurado; éxito externa coherente JSON+SQLite+revisión; restaurar con-texto con fallo de revisión ⇒ documento y marca intactos) + `test_restaurar_texto_unittest.py` (3, arnés legacy adaptado, contrato intacto) |
| LOW-06 | El soak de memoria medía `rss0` ANTES del warm-up: la primera invocación carga OpenCV/codec (salto 113→278 MB en el entorno del auditor) y el test daba falso fallo de fuga | Warm-up de 2 análisis antes de la línea base (corrección pedida por el auditor); el umbral de crecimiento (60 MB) mide sobre el proceso ya inicializado | `test_v15_10_1_r154_soak_analisis_video.py` (2, actualizado) |
| LOW-07 | Discrepancias documentales: changelog hablaba de 114 entradas vs 123 del manifiesto; 38 vs 39 `.cjs`; README llamaba «instalación vigente» a `INSTALAR_R15_3` | Manifiesto, SHA256SUMS y conteos del paquete R15.5 **generados automáticamente** por el script de empaquetado (doble pasada: primero payload + manifiesto, después sums que lo incluyen); README corregido (`INSTALAR_R15_5` vigente); inventario Node verificado del árbol: 38 `.cjs` activos en `pruebas/` (ver sección abajo) | Este changelog + `MATRIZ_EVIDENCIA_R15_5.md` (comandos reproducibles) |

## Inventario de almacenes secundarios (P0 del auditor)

| Almacén | Escritores | Política R15.5 |
|---|---|---|
| `validacion_resultados.json` (documento oficial) | todos los writers de carpeta | commit transaccional AL FINAL (lock + CAS fresco); fallo ⇒ 503 sin afirmar guardado |
| SQLite aprendizaje/revisión (`correcciones*`, `muestras_visuales`, `estrategias_ocr`, `ediciones_zona`, `revisiones`) | corregir, rotar, verificar, sin-datos, video | snapshot/restauración genérica (`snapshot_evidencias_imagen`/`restaurar_evidencias_imagen`, 7 tablas + revisión) vía coordinador |
| `rotaciones_imagen` (SQLite) | `guardar_rotacion` | incluido en `_TABLAS_EVIDENCIA_IMAGEN` (nuevo en R15.5) |
| `revisiones_video.json` | `revisar_video` | snapshot + `restaurar_revisiones` bajo coordinador (migrado en R15.5 F2) |
| Perfiles ROI / zonas aprendidas | `aprender_zona_video`, `revertir_zona_video` | `_restaurar_zona_aprendida` (restaurar perfil o eliminar) bajo coordinador |
| Dataset de eventos + directorio de frames | `revisar_video` (confirmado) | efecto OPCIONAL post-commit (HIGH-01): jamás precede al commit; fallo ⇒ éxito + advertencia |
| Evidencias geométricas (`editar_zona`, uniones) | `corregir_lectura`, `verificar_imagen` (uniones históricas) | snapshot R15.2/R15.4 conservado; uniones históricas post-commit tolerantes a fallo |
| JSON de pruebas externas | rotación externa, sin-datos externa, corregir externa, restaurar externa | commit final `_guardar_json_atomico` con efectos SQLite compensables antes (MEDIUM-04) |

## Fases y commits

| Fase | Contenido | Commit(s) |
|---|---|---|
| F1 | HIGH-01: aprendizaje post-commit en `revisar_video` | `532fc81`* |
| F2 | P0 + MEDIUM-05: coordinador `TransaccionMultiAlmacen` + registro de inconsistencias + bloqueo; video migrado | `03b4e8e`* |
| F3 | HIGH-02: `guardar_rotacion` transaccional (ambas ramas) | `b465151`* |
| F1–F4 | Reaplicación consolidada tras borrado de `.git` en el sandbox de desarrollo (el árbol conservó todos los cambios; suite 1010/0 ×2 antes de re-confirmar) | `922e8b3` |
| F4 | HIGH-03 + MEDIUM-04: verificar/sin-datos/restaurar bajo la misma política | (en `922e8b3`) |
| F5+F6 | LOW-06 (soak warm-up) + identidad 15.10.1-r15.5 + `INSTALAR_R15_5` + README | `9a50dc7` |
| F7 | LOW-07 + docs (este changelog, informe por hallazgo, matriz de evidencia) + empaquetado y simulaciones | este commit |

\* Los commits originales de F1–F3 se perdieron cuando el sandbox borró `.git` entre turnos; su contenido es idéntico al reaplicado en `922e8b3` (los logs RED/GREEN de cada fase se conservan en `evidencia/ejecucion/`).

## Inventario de pruebas (LOW-05/LOW-07) — cifras generadas del árbol

| Magnitud | Valor | Cómo verificarla |
|---|---|---|
| Suite Python (árbol dev completo) | **1010 passed / 0 failed** (×2 pasadas; ~150 s c/u) | `PYTHONPATH=pruebas:. python -m pytest pruebas/ -q` |
| Pruebas nuevas R15.5 | **20** en 4 archivos (`r155_aprendizaje_post_commit` 4, `r155_transaccion_coordinada` 6, `r155_rotacion_transaccional` 4, `r155_verificacion_externa` 6) | `PYTHONPATH=pruebas:. python -m pytest pruebas/ -q -k r155` |
| `.cjs` activos (`pruebas/*.cjs`) | **38** (38/38 verdes; sin cambios respecto a R15.4) | `ls pruebas/*.cjs \| wc -l` |
| — incluidos/actualizados por el parche acumulado R14→R15.5 | **13** (todos en `MANIFEST_SHA256_R15_5.txt`) | `grep -c "\.cjs" MANIFEST_SHA256_R15_5.txt` |
| Copias históricas de archivo (NO ejecutadas) | **8** (subcarpetas de archivo en `pruebas/`) | `find pruebas -name "*.cjs" \| grep -v "^pruebas/[^/]*\.cjs$" \| wc -l` |
| Manifiesto del paquete | ver `MANIFEST_SHA256_R15_5.txt` (generado automáticamente; todas las entradas verificables con `verificar_sha256.sh` / `VERIFICAR_SHA256.ps1` desde dentro del ZIP) | doble pasada del build |

Nota LOW-07 (39 `.cjs` del auditor vs 38 declarados): la diferencia observada por el auditor provenía de archivos heredados/sueltos fuera de `pruebas/*.cjs` en su árbol acumulativo; en el árbol R15.5 el conteo activo es 38 en cualquier ámbito y el desglose anterior explica cada archivo.

## Cambios de contrato documentados (SUPERSEDE)

1. **Mensaje de doble fallo (MEDIUM-05):** fallo + rollback fallido ⇒ 503 «ATENCIÓN: estado potencialmente inconsistente…bloqueadas hasta que se resuelva» + registro durable + bloqueo del recurso. Antes (R15.4) el mensaje de `revertir_zona_video` afirmaba restauración sin verificación. El ancla «DESHIZO» del 500 de revertir se conserva con semántica verificada.
2. **Rotación externa:** el commit del JSON externo pasa al final con efectos SQLite compensables antes; fallo de escritura externa ⇒ 503 controlado (antes la marca/rotación podía quedar huérfana).
3. **Soak (LOW-06):** protocolo de medición con warm-up de 2 análisis antes de `rss0`; umbrales sin cambio. Corrección pedida explícitamente por la auditoría — no es edición para verdear.
4. **Identidad:** pins de versión en `test_v15_10_1_r14_auditoria_preventiva.py`, `test_v15_10_1_r15_instalador.py` y `test_v15_10_1_r15_5_instalador_base.py` (renombrado desde `r15_4`) siguen el release, con párrafos SUPERSEDE por versión; bases del instalador acumulativas (r14→r15.5).
5. **Arnés legacy `test_restaurar_texto_unittest.py`:** inyecta stub mínimo del coordinador (contrato local capturar/aplicado/fallar/exito) y extrae los helpers reales `_capturar_revision_estado`/`_restaurar_revision_estado`; la garantía V15.9.3 probada (fallo de escritura ⇒ marca NO eliminada) no cambia.

## Limitaciones conocidas

- **Sin pwsh en CI/sandbox:** las pruebas del instalador son estáticas (código fuente), mismo criterio que R14→R15.4. La instalación/rollback en Windows real sigue siendo validación de campo pendiente (criterio de liberación del auditor).
- **Lock de proceso único:** el coordinador y la reserva de operación serializan escritores DENTRO del proceso; un segundo proceso sobre el mismo JSON sigue fuera del contrato (el instalador exige V-Matrix cerrado por esto).
- **Dataset de eventos:** tras HIGH-01 es efecto opcional post-commit; un fallo de aprendizaje deja advertencia visible pero NO se reintenta automáticamente (intervención humana = excepción).
- **Umbrales Tmax:** 2 % / 25 px / 3 frames sigue siendo calibración inicial DOCUMENTADA; la calibración con AVI reales de campo sigue pendiente — no se declara precisión sin campo (regla Tmax: sin evidencia suficiente ⇒ NO CONFIRMADO).
- **Conteo de descriptores del soak:** específico de Linux (`/proc/self/fd`); en otras plataformas se omite esa cota.
- **Bloqueo por inconsistencia:** es deliberadamente conservador — mientras `estado_inconsistente.json` liste el recurso, las operaciones incompatibles responden 503 con instrucción de verificación manual; la resolución es explícita (`_resolver_inconsistencias`), nunca automática.

## Criterios de liberación del auditor — estado

| # | Criterio (AUDITORIA_INDEPENDIENTE_R15_4) | Estado |
|---|---|---|
| 1 | Una petición fallida no modifica ningún almacén autoritativo | **CERRADO en código** (coordinador + pruebas adversariales 1–6 del plan P1, todas verdes) |
| 2 | Si un rollback falla, se declara explícitamente y bloquea acciones incompatibles hasta resolverlo | **CERRADO en código** (503 «estado potencialmente inconsistente» + registro durable + bloqueo + resolución manual probada) |
| 3 | Rotación, verificación, video, ROI, sin-datos y externas comparten la MISMA política transaccional | **CERRADO en código** (capa común `TransaccionMultiAlmacen`; ver inventario de almacenes) |
| 4 | El soak mide memoria después del warm-up y no detecta crecimiento sostenido | **CERRADO en código** (warm-up de 2 análisis; soak verde en dev y simulaciones) |
| 5 | Instalación/rollback probados físicamente en Windows real | **PENDIENTE DE CAMPO** (sin pwsh en sandbox; mismo criterio que R15.1–R15.4) |
| 6 | Conjunto real de videos para calibrar Tmax y semáforo | **PENDIENTE DE CAMPO** (umbrales = calibración inicial documentada) |

**No se declara producción:** faltan los criterios 5 y 6 (campo). R15.5 es candidata a pruebas controladas con la garantía transaccional completa en código.
