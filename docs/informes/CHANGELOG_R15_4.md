# CHANGELOG — V-Matrix V15.10.1 R15.4

- **Versión:** 15.10.1-r15.4 (`PATCH_BUILD` en `dashboard/backend/app.py`; caché frontend `?v=15.10.1-r15.4`; `VERSION.txt`; marker `PATCH_INSTALLED_V15_10_1_R15_4.json` — las cuatro fuentes reportan la MISMA versión)
- **Fecha:** 2026-10-15
- **Base:** V15.10.1 R15.3 sobre R15.2 sobre R15.1 sobre R15 sobre R14 sobre V15.9.10 (N17 aceptado). Acumulativo: `INSTALAR_R15_4` acepta bases `15.10.1-r14`, `15.10.1-r15`, `15.10.1-r15.1`, `15.10.1-r15.2`, `15.10.1-r15.3` y `15.10.1-r15.4` (VERSION.txt o marker **validado por contenido**) y aborta sobre cualquier otra carpeta ANTES de modificar nada.
- **Origen:** `AUDITORIA_INDEPENDIENTE_R15_3_20261015.md` — veredicto «instalable para pruebas, aún NO Production Ready; bloquea HIGH-01». 6 hallazgos (1 alto, 3 medios/medios-bajos, 1 bajo, 1 de campo). R15.4 cierra HIGH-01, MEDIUM-02, MEDIUM-03, MEDIUM/LOW-04 y LOW-05; FIELD-06 (instalador en Windows real) queda pendiente de campo, igual que en R15.1/R15.2/R15.3. **Sin funciones nuevas** — correctiva pequeña y enfocada, como pidió el auditor.
- **Suite final:** 990 passed / 0 failed (Python, árbol dev completo) · 38/38 verdes (Node `.cjs` activos en `pruebas/`) · simulaciones A (limpia), B (usada) y C (upgrade R15.3→R15.4): ver `evidencia/ejecucion/`.
- **Filosofía intacta:** no inventar certeza; la intervención humana es la excepción, no el flujo; «petición rechazada» = «petición sin efectos»; «petición fallida» = «almacenes coherentes» (nuevo en R15.4); nunca pérdida silenciosa; R16 (trigger eléctrico, volumen/presión) fuera de alcance.

## Hallazgos cerrados

| # | Hallazgo | Corrección | Pruebas |
|---|---|---|---|
| HIGH-01 | Efecto persistente sobrevivía al fallo del commit documental final: CAS validado → efecto externo (SQLite / revisión de video) → `escribir_json_seguro` falla (disco, permisos, antivirus, archivo bloqueado) → la petición termina en error pero el efecto ya quedó. `validacion_resultados.json` y SQLite/revisiones podían decir cosas distintas (repros del auditor en `marcar_imagen_sin_datos`, `corregir_lectura`, `revisar_video`) | Transacción compensable en las 6 rutas con efectos externos (`marcar_imagen_sin_datos`, `corregir_lectura`, `restaurar_imagen_con_texto`, `revisar_video`, `aprender_zona_video`, `revertir_zona_video`): snapshot del estado anterior ANTES del efecto → efecto → commit documental → si el commit falla, **restauración del estado anterior** (registro SQLite, estrategia, revisión de video vía nueva primitiva `restaurar_revisiones` en `video_airbag.py`, perfil de zona vía `restaurar_perfil_zona`/`eliminar_zona_aprendida` en `aprendizaje.py`). `EscrituraFallida` (directa o como `__cause__`) se traduce a **503 controlado** con `_MSG_GUARDADO_FALLO`: mensaje claro, sin afirmar que el cambio se guardó. Invariante: fallo de commit ⇒ CERO desacuerdo entre almacenes y NUNCA «guardado» afirmado | `test_v15_10_1_r154_compensacion_multialmacen.py` (8: repro del auditor ×3 rutas con fallo inyectado en `escribir_json_seguro`, compensación de revisión de video, compensación de zona aprendida con restauración y con eliminación, 503 con mensaje que no afirma guardado, éxito sin efectos de compensación) |
| MEDIUM-02 | `_lock_documento()` sostenido durante el análisis de video completo en `aprender_zona_video` (decodificación + estimación de apertura, segundos): cualquier otra mutación quedaba bloqueada; riesgo de timeout/deadlock percibido como cuelgue | Flujo de 3 fases: (1) lock CORTO — CAS + snapshot + aplicación de ROI; (2) `analizar_video` FUERA del lock (422 por análisis inválido conserva la ROI, contrato previo); (3) lock CORTO de reentrada — CAS FRESCO sobre la revisión leída del disco + commit, con compensación de ROI en `except BaseException` (restaurar snapshot o eliminar). Además, **reserva de operación por recurso**: `_operaciones_lock`/`_operaciones_activas`/`_reservar_operacion` → segunda edición incompatible sobre el MISMO video recibe **423 inmediato y visible** («Otra operación sobre este video está en curso…»), no espera indefinida; `_liberar_operacion` en `finally`. `revertir_zona_video` comparte la reserva | `test_v15_10_1_r154_lock_corto.py` (5: lock no sostenido durante el análisis — evento dentro del análisis demuestra que el lock está libre; 423 en concurrencia aprender/aprender y aprender/revertir; CAS fresco en reentrada detecta mutación externa ⇒ 409 sin commit; reserva liberada tras éxito y tras fallo) |
| MEDIUM-03 | `/api/pruebas` recurría a `resultados_parciales` del checkpoint cuando faltaba `validacion_resultados.json`: instalación usada con checkpoint `completado` presentaba resultados VIEJOS como actuales (repro del auditor) | Backend: `_ESTADOS_CHECKPOINT_VIGENTE` = {procesando, pausando, pausado, cancelando, reanudando, detenido_con_avance}. El fallback a parciales sólo aplica con pipeline realmente en curso/recuperable; checkpoint histórico ⇒ **503 con estado claro de recuperación** (estado, ejecución, progreso y qué hacer: reprocesar o restaurar el documento oficial) — los parciales NUNCA se muestran como actuales. La respuesta declara `fuente` ∈ {`documento`, `checkpoint_recuperacion`} y cada fila de recuperación lleva su `fuente`. Con documento presente, los parciales de corrida finalizada ya no pisan filas. Frontend: componente `AvisoCheckpointRecuperacion` (role=status, aria-live) montado en el listado + `EstadoError` ahora muestra el mensaje del backend (el 503 llega al usuario) + i18n EN/DE | `test_v15_10_1_r154_checkpoint_seguro.py` (8: completado/inactivo sin documento ⇒ 503 que NO contiene filas viejas, 4 estados vigentes ⇒ parciales con fuente, documento ⇒ fuente documento, parciales no tapan documento, 404 limpio sin nada) · `test_v15_10_1_r154_aviso_checkpoint.cjs` (render REAL con vendor React+htm: aviso sólo con fuente de recuperación, sin etiquetas literales; cableado en VistaGeneral/EstadoError; i18n EN/DE) |
| MEDIUM/LOW-04 | Anomalía de rendimiento dependiente del orden en `test_v15_7_detector_apertura.py` (entorno del auditor; también en R15.2 ⇒ no es regresión R15.3): riesgo de acumulación de recursos OpenCV/handles/caché | Diagnóstico documentado: en el sandbox, duraciones AISLADAS ≈ duraciones EN ARCHIVO (19.98 s vs 20.02 s; última 1.56 s vs 1.43 s) ⇒ sin degradación por orden aquí; el costo (~56 s) es inherente. Monitorización permanente: soak test de **100 análisis consecutivos reales** (`analizar_video`, `usar_cache=False`) midiendo tiempo por iteración (mediana últimas 10 ≤ 2.5× primeras 10), RSS (+≤60 MB), descriptores abiertos (+≤5 ⇒ `VideoCapture` liberado) y cota de caché interna (`_cache_reloj ≤ _CACHE_RELOJ_MAX`); + ciclo explícito open/read/release ×50 | `test_v15_10_1_r154_soak_analisis_video.py` (2) — 100 análisis en ~10 s sin degradación ni fugas |
| LOW-05 | Inventario Node: el paquete declaraba 37 y el árbol del auditor contenía 38 (38/38 verdes) | Fix documental con el desglose exacto que pidió el auditor (ver sección «Inventario de pruebas» abajo). En R15.4 el activo real es 38 (se añade `test_v15_10_1_r154_aviso_checkpoint.cjs`) y las tres magnitudes quedan declaradas y reproducibles | Este changelog + `MATRIZ_EVIDENCIA_R15_4.md` (comandos reproducibles) |

## Fases y commits

| Fase | Contenido | Commit(s) |
|---|---|---|
| F1 | HIGH-01: compensación multi-almacén + 503 controlado (`_MSG_GUARDADO_FALLO`, `restaurar_revisiones`, snapshots) | `49d761b` |
| F2 | MEDIUM-02: lock corto de 3 fases + reserva de operación (423) | `62b394e` |
| F3 | MEDIUM-03: checkpoint seguro en `/api/pruebas` + aviso frontend + i18n | `c5af614` |
| F4 | MEDIUM/LOW-04: soak test + diagnóstico de la anomalía de orden | `83ce235` |
| F5 | Identidad del paquete 15.10.1-r15.4: `INSTALAR_R15_4.*`, bases acumulativas r14→r15.4 | `7848bff` |
| F6 | LOW-05 + docs (este changelog, informe por hallazgo, matriz de evidencia, README) + empaquetado y simulaciones | este commit |

## Inventario de pruebas (LOW-05)

Ámbito declarado explícitamente, con comandos reproducibles desde la raíz del producto instalado:

| Magnitud | Valor | Cómo verificarla |
|---|---|---|
| `.cjs` activos ejecutados (`pruebas/*.cjs`) | **38** (38/38 verdes en dev y en las 3 simulaciones) | `ls pruebas/*.cjs \| wc -l` |
| — incluidos/actualizados por el parche acumulado R14→R15.4 | **13** (5 nuevos: `r15_red_segura`, `r15_2_ui_maximo_no_confirmado`, `r15_3_carrera_ui`, `r152_ui_cas_y_badges`, `r154_aviso_checkpoint`; 8 heredados actualizados — todos en `MANIFEST_SHA256_R15_4.txt`) | `grep -c "\.cjs" MANIFEST_SHA256_R15_4.txt` |
| — heredados de la base sin tocar | **25** (33 activos en base 69b1900 − 8 actualizados) | diferencia de listas |
| Copias históricas de archivo (NO ejecutadas; dentro de subcarpetas de archivo en `pruebas/`) | **8** (`codigo_final_referencia/` 4, `V15_9_APERTURA_ROI_ZOOM_MATRIZ/archivos/` 1, `V-Matrix-V15.10.1_CORRECCION_ACUMULADA_R8_20261014/` 3) | `find pruebas -name "*.cjs" \| grep -v "^pruebas/[^/]*\.cjs$" \| wc -l` |
| Total `.cjs` en el repo | **46** | `find . -name "*.cjs" -not -path "./.git/*" \| wc -l` |
| Suite Python | 990 passed / 0 failed (dev; simulaciones: 974 passed + 16 skipped esperados — 15 de instalador por diseño + 1 de plataforma) | `PYTHONPATH=pruebas:. python -m pytest pruebas/ -q` |

Nota sobre la discrepancia R15.3 (37 declarados vs 38 del auditor): en R15.4 el conteo activo es 38 en CUALQUIER ámbito del árbol dev/simulaciones y el desglose anterior explica cada archivo; ya no hay cifra ambigua que declarar.

## Cambios de contrato documentados (SUPERSEDE)

1. **Compensación de efectos (HIGH-01):** fallo del commit documental ⇒ los almacenes externos (SQLite, revisiones de video, zonas aprendidas) se restauran a su estado anterior. Los tests que stubbean el gestor documental amplían sus stubs con las primitivas nuevas (`restaurar_revisiones`, `restaurar_perfil_zona`) — volteo documentado, no edición para verdear.
2. **Reserva de operación (MEDIUM-02):** dos ediciones incompatibles sobre el MISMO video: la segunda recibe 423 inmediato (antes quedaba en espera del lock). `aprender_zona_video` ya no sostiene el lock documental durante el análisis: ventana en la que otra mutación puede commitear ⇒ el CAS fresco de la fase 3 la detecta y responde 409 sin commit.
3. **Listado `/api/pruebas` (MEDIUM-03):** respuesta con campo `fuente`; sin documento oficial y con checkpoint histórico ⇒ 503 (antes devolvía filas viejas). Los consumidores del listado (resumen live, dashboard) ya toleraban el error y ahora muestran el mensaje del servidor. Volteo de prueba documentado: `test_documento_ausente_no_inventa_revision` (R15.2) esperaba 404 ante documento ausente; sobre una instalación usada con checkpoint histórico sembrado (simulación B) el contrato nuevo responde 503 de recuperación — la prueba aísla ahora explícitamente el caso SIN checkpoint (404 intacto) y el caso CON checkpoint lo cubre `test_v15_10_1_r154_checkpoint_seguro.py`. No se editó ninguna prueba para verdear un defecto: el contrato fue reemplazado a propósito por la auditoría.
4. **Instalador:** `INSTALAR_R15_3.*` → `INSTALAR_R15_4.*`; identidad manifiesto/marker/backup r15.3 → r15.4; bases aceptadas ACUMULATIVAS (se añade r15.3 a las ya existentes); `test_v15_10_1_r15_instalador.py`, `test_v15_10_1_r15_4_instalador_base.py` y `test_v15_10_1_r14_auditoria_preventiva.py` siguen el release (RED fiel 8F/14P antes de tocar contenido).

## Limitaciones conocidas

- **Dataset de eventos no compensado:** `guardar_ejemplo_evento` en la rama «confirmado» de `revisar_video` queda fuera de la compensación (limitación documentada desde R15.4 F1; el dataset es append-only de ejemplos y no afecta decisiones).
- **Sin pwsh en CI/sandbox:** las pruebas del instalador son estáticas (código fuente), mismo criterio que R14/R15/R15.1/R15.2/R15.3. FIELD-06 (matriz real en Windows: proceso activo, CIM/WMI caído, fallback, `-Force`, archivo bloqueado, error a mitad, rollback, reinstalación) queda como validación de campo pendiente, igual que AVI reales, GPU Windows y navegador real.
- **Lock de proceso único:** la autoridad compartida y la reserva de operación serializan escritores DENTRO del proceso; un segundo proceso sobre el mismo JSON sigue fuera del contrato (el instalador exige V-Matrix cerrado precisamente por esto).
- **Umbrales de expansión Tmax:** 2 % / 25 px / 3 frames sigue siendo calibración inicial DOCUMENTADA y parametrizable; el auditor reafirma que no es verdad física definitiva — la calibración con AVI reales de campo sigue pendiente (plan R15.4 punto 9; no se declara precisión sin campo).
- **Soak test (MEDIUM/LOW-04):** acota fugas/degradación en el entorno de pruebas con video sintético pequeño; no reproduce el entorno exacto del auditor (Windows). El diagnóstico de orden queda documentado con las duraciones medidas.
- **Conteo de descriptores:** la verificación de fds del soak es específica de Linux (`/proc/self/fd`); en otras plataformas se omite esa cota (el resto del soak aplica).

## Criterios del plan R15.4 del auditor — estado

| # | Criterio (plan recomendado del auditor) | Estado |
|---|---|---|
| 1 | Rollback/compensación de SQLite y revisiones de video si falla el commit documental | CERRADO (F1, HIGH-01) |
| 2 | `EscrituraFallida` → respuesta controlada y visible (503) sin afirmar que se guardó | CERRADO (F1, `_MSG_GUARDADO_FALLO`) |
| 3 | Acortar `_lock_documento()`: no sostenerlo durante análisis pesado | CERRADO (F2, 3 fases) |
| 4 | Reserva de operación / busy explícito (409/423 inmediato) para edición incompatible | CERRADO (F2, 423) |
| 5 | `/api/pruebas` consciente del estado del checkpoint | CERRADO (F3, 503 + fuente + aviso UI) |
| 6 | Soak test de análisis de video repetido (50–100 iteraciones) | CERRADO (F4, 100 iteraciones) |
| 7 | Inventario real de pruebas Node sincronizado con la evidencia | CERRADO (F6, tabla anterior) |
| 8 | Matriz final del instalador en Windows (campo) | PENDIENTE DE CAMPO (FIELD-06) |
| 9 | Calibrar umbrales Tmax con videos reales (campo) | PENDIENTE DE CAMPO (regla intacta: sin evidencia suficiente ⇒ NO CONFIRMADO y caso a revisión/azul) |
