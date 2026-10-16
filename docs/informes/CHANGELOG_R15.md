# CHANGELOG — V-Matrix V15.10.1 R15

- **Versión:** 15.10.1-r15 (`PATCH_BUILD` en `dashboard/backend/app.py`; caché frontend `?v=15.10.1-r15`)
- **Fecha:** 2026-10-15
- **Base:** V15.10.1 R14 (árbol auditado en `AUDITORIA_EXHAUSTIVA_V_MATRIX_R14_20261015.md`) sobre V15.9.10 (N17 aceptado)
- **Rama:** `codex/ocr-v15-10-1-r15`
- **Suite final:** 860 passed / 0 failed / 0 skipped (Python) · 34/34 verdes (Node `.cjs`)
- **Suite base R14:** 792 passed / 14 failed / 1 skipped — los 14 fallos quedaron resueltos o alineados con doctrina documentada (ver Fase 8a)

## Fases y commits

| Fase | Contenido | Commit(s) |
|---|---|---|
| 0 | Baseline R14 reconstruida (V15.9.10 `1222be6` + overlay Parche_Temp `8a1608e`) | `6f72828` (reconstruida) |
| 1 | CRIT-01 + ALTA-02 + MEDIA-15: reserva atómica del slot de worker, efectos persistentes sólo post-admisión, `Thread.start()` verificado con rollback | RED `5d7ea54` + fix `737e146` |
| 2 | ALTA-03 + ALTA-07 + MEDIA-14: `revision_documento` CAS, merge por video sobre documento fresco, guards de revisión completada/reanálisis | RED `26f849e` + fix `72b77b7` |
| 3 | ALTA-04: persistencia verificada (`_guardar_json_verificado`, `ErrorPersistenciaRevisiones`, 503 en fallo) | `737abad` |
| 4 | ALTA-05 + MEDIA-16: mediana causal de despliegue, invariantes `frame_max ≥ frame_breakout`, taxonomía de estados de máximo | RED `44a5173` + fix `e1ef0f6` |
| 5 | ALTA-06: limpieza de estados obsoletos en zona aprendizaje/revertir conservando datos humanos | `be6e96e` |
| 6 | MEDIA-08/09/13 + BAJA-17 + MEDIA-14 (cliente): `red_segura.js` (sondeo serial, secuencias, AbortController+Blob, 404 explícito), `expected_revision` en mutaciones con recarga en 409 | `43acc3b` |
| 7 | MEDIA-10/11: nombres reservados Windows con extensiones adicionales, espacio/punto final crudo, ancestros de la raíz del programa | `9d08baf` |
| 7b | MEDIA-12 + prueba obligatoria 17: instaladores R14 incorporados al árbol; `INSTALAR_R15.ps1/.bat` con preflight fail-closed | `5d25e67` |
| 8a | Alineación documentada (SUPERSEDE) de las 13 pruebas obsoletas V15.9 | `4b5b132` |
| 8b | Bump de versión 15.10.1-r15 (backend, caché frontend, pins de prueba) | `b8c8bca` |

> **Nota de transparencia:** el sandbox eliminó `.git` entre turnos y se perdió la
> cadena original `3d82a75..9d08baf`. El árbol de trabajo sobrevivió íntegro
> (verificado por marcadores de cada fase) y la historia se reconstruyó como
> `6f72828` (base R14) → `5d25e67` (Fases 1–7b consolidadas). Las evidencias
> RED/GREEN originales se conservan en `r15-evidencia/`.

## Cambios por área

### Backend (`dashboard/backend/app.py`)
- **Concurrencia (CRIT-01/ALTA-02):** reserva atómica `_pipeline_reserva` con lock global; `iniciar_pipeline`, `reprocesar_caso` y `reanalizar_videos` admiten UNA sola ejecución; 409 con mensaje diferenciado por causa (hilo vivo vs reserva); rollback completo si algo falla tras reservar (registro de proyecto, ROI, checkpoint, `Thread.start()`).
- **Versionado de documento (ALTA-03/ALTA-07/MEDIA-14):** `_datos_mutacion_lock` + `revision_documento` monotónico; mutaciones por compare-and-swap (`expected_revision` → 409 si es antigua); reanálisis fusiona parches por video sobre el documento fresco (los datos humanos `revision_manual`/`ultima_zona_nacimiento` sobreviven); patch huérfano = error visible, nunca pérdida silenciosa.
- **Persistencia (ALTA-04):** revisión de video sólo responde éxito tras escritura durable verificada; fallo → 503 «La revisión no se guardó».
- **Entradas (MEDIA-10/11):** `CON.foo.xlsx`/`NUL.data.xlsx`/`COM1.log.xlsx`/superíndices Unicode rechazados; espacio final en crudo rechazado antes de strip; carpeta padre que contiene la raíz del programa bloqueada con mensaje específico.

### Motor de video (`utilidades/estandar_apertura.py`, `video_airbag.py`)
- **Tmax causal (ALTA-05/MEDIA-16):** mediana móvil estrictamente causal (`bruto[max(0,i-2):i+1]`); invariante `idx_max > 0` si hay pico; fases no decrecientes; estados `maximo_inflado_estimado` / `maximo_visible_observado_no_confirmado` / `sin_maximo_defendible`; pico al borde del clip sin meseta/caída ⇒ NO se publica como máximo confirmado.
- **Persistencia verificada:** `ErrorPersistenciaRevisiones` + `_guardar_json_verificado` (temp→flush→fsync→replace→releer).

### Frontend (`dashboard/frontend/`)
- **`red_segura.js` (nuevo, UMD `VMatrixRedSegura`):** sondeo serial con `requestId`, guarda de secuencias (respuesta vieja nunca sobrescribe nueva), `lanzar404` explícito (un 404 ya no es `null` silencioso).
- **`app.js`:** polling de proceso/listado serializado; frames con fetch + AbortController + Blob + debounce (máx. 1 solicitud activa por tarjeta); `expected_revision` en 5 POSTs de mutación con recarga automática en 409; tooltip de evento censurado sin `title` duplicado.
- **`index.html`:** carga `red_segura.js` antes de `app.js`; caché busteada a r15.

### Instalador
- **`INSTALAR_R15.ps1/.bat` (nuevos):** mismo patrón transaccional R14 (manifiesto SHA-256, copia verificada temp→hash→move→hash, backup `_BACKUP_PRE_R15_<timestamp>`, rollback automático, marker `PATCH_INSTALLED_V15_10_1_R15.json`) + **corrección MEDIA-12**: `Assert-VMatrixStopped` fail-closed — si CIM/WMI falla, aviso visible + fallback `Get-Process`; si nada puede verificarse, ABORTA salvo `-Force` explícito.
- **`INSTALAR_R14.bat/.ps1`:** incorporados al árbol sin modificar (referencia histórica; los subió el usuario a Parche_Temp `bd8ae8b`).

### Pruebas
- 7 archivos nuevos de pruebas R15 (55 tests Python + 1 arnés Node) que reprodujeron cada defecto en RED antes del fix.
- 13 pruebas obsoletas V15.9 alineadas con docstring SUPERSEDE citando `PLAN_CORRECCION_R10/R13`, `RESULTADOS_PRUEBAS_V15_9` y el plan R15 («no inventar certeza», cero pérdida de datos manuales). Cero cambios de código de producto en esa fase.
- `test_editor_zonas.cjs`: reparación de arnés (falla preexistente reproducida en baseline `3d82a75`: cargaba `app.js` sin `visor_precision.js` en el vm).

## Limitaciones conocidas / validación de campo pendiente
1. **Instalador:** sin `pwsh` en CI, la verificación de `INSTALAR_R15.ps1` es a nivel de código fuente (mismo criterio que la prueba preventiva R14). Ejecución real en Windows pendiente.
2. **Videos reales:** no hay videos AVI de ensayo en el repositorio; las pruebas de breakout/Tmax usan señales sintéticas (plan R15: validación real 20–30 videos sigue pendiente de campo).
3. **Estrés concurrente:** las pruebas de concurrencia llaman a las funciones de endpoint con hilos y barreras (TestClient concurrente es inestable en este entorno); equivalen a 2/5 solicitudes simultáneas a nivel de lógica de admisión.
4. Cifras de suite del proveedor R14 no reproducibles en este entorno (documentado en Fase 0).

## Criterios de liberación del plan R15 — estado
- 0 pipelines duplicados: ✅ pruebas obligatorias 1–4 verdes.
- 0 pérdidas de datos manuales: ✅ pruebas 5–6 + merge versionado.
- 0 Tmax < breakout: ✅ invariantes + pruebas 11–12.
- 0 estados obsoletos tras reanálisis/ROI: ✅ prueba 10.
- 0 respuestas antiguas sobrescribiendo: ✅ pruebas 13–14 + 18.
- Rollback del instalador probado: ⚠️ verificado a nivel de código fuente + prueba transaccional; ejecución real en Windows pendiente (limitación 1).
