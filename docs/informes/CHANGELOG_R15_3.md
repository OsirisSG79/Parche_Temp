# CHANGELOG — V-Matrix V15.10.1 R15.3

- **Versión:** 15.10.1-r15.3 (`PATCH_BUILD` en `dashboard/backend/app.py`; caché frontend `?v=15.10.1-r15.3`; `VERSION.txt`; marker `PATCH_INSTALLED_V15_10_1_R15_3.json` — las cuatro fuentes reportan la MISMA versión)
- **Fecha:** 2026-10-15
- **Base:** V15.10.1 R15.2 sobre R15.1 sobre R15 sobre R14 sobre V15.9.10 (N17 aceptado). Acumulativo: `INSTALAR_R15_3` acepta bases `15.10.1-r14`, `15.10.1-r15`, `15.10.1-r15.1`, `15.10.1-r15.2` y `15.10.1-r15.3` (VERSION.txt o marker **validado por contenido**) y aborta sobre cualquier otra carpeta ANTES de modificar nada.
- **Origen:** `AUDITORIA_INDEPENDIENTE_R15_2_20261015.md` — veredicto «R15.2 no es Production Ready; la siguiente versión debe ser pequeña y enfocada, sin funciones nuevas». 7 hallazgos (1 crítico, 3 altos, 1 medio, 1 bajo, 1 de campo). R15.3 cierra CRÍTICO-01, ALTO-02, ALTO-03, ALTO-04, MEDIO-05 y BAJO-06; CAMPO-07 (instalador en Windows real) queda pendiente de campo, igual que en R15.1/R15.2.
- **Suite final:** 967 passed / 0 failed (Python, árbol dev completo) · 37/37 verdes (Node `.cjs` activos en `pruebas/`) · simulaciones A (limpia) y B (usada): ver `evidencia/ejecucion/`.
- **Filosofía intacta:** no inventar certeza; la intervención humana es la excepción, no el flujo; «petición rechazada» = «petición sin efectos»; nunca pérdida silenciosa; R16 (trigger eléctrico, volumen/presión) fuera de alcance.

## Hallazgos cerrados

| # | Hallazgo | Corrección | Pruebas |
|---|---|---|---|
| CRÍTICO-01 | Carrera de admisión: `reanalizar_videos` comprobaba el pipeline bajo `_pipeline_lock`, lo liberaba y tomaba `_video_reanalisis_lock` después — en esa ventana `iniciar_pipeline` podía admitirse, y ambos procesos quedaban aceptados a la vez | UNA sola región atómica en `reanalizar_videos` con el mismo orden de locks que `iniciar_pipeline` (`_pipeline_lock → _video_reanalisis_lock`): validación, reserva de estado, creación del hilo y arranque sin liberar locks en medio | `test_v15_10_1_r153_admision_atomica.py` (interleaving forzado determinista del auditor + 100 carreras concurrentes con UN solo ganador) |
| MEDIO-05 | Fallo de `Thread.start()` en el reanálisis dejaba `_video_reanalisis_hilo` asignado y estado `preparando` fantasma (sin hilo vivo) | Rollback completo ante fallo de arranque: hilo=None, estado anterior restaurado + `estado='error'` + `ultimo_error` visible, y 500 explícito — mismo criterio que `_rollback_admision_pipeline`. Nunca `preparando` sin hilo vivo | Ídem (`test_fallo_thread_start_reanalisis_estado_seguro`) |
| ALTO-02 | TOCTOU CAS: el patrón «prechequeo → efecto durable (SQLite/ROI/revisión) → CAS final» permitía terminar en 409 dejando efectos persistentes de la petición rechazada | La autoridad de mutación cubre CAS autoritativo + efectos + commit en la MISMA región de exclusión del documento (RLock reentrante por ruta) en las 4 rutas afectadas: `marcar_imagen_sin_datos` y `corregir_lectura` (registros sqlite/estrategia/revisión dentro del lock), `revisar_video` (dataset de eventos tras CAS y revalidación sobre el fresco), `aprender_zona_video` (snapshot+ROI+análisis+commit bajo lock; fallo de commit ⇒ compensación de la ROI vía `restaurar_perfil_zona`/`eliminar_zona_aprendida`). Invariante: 409 ⇒ CERO efectos persistentes; éxito ⇒ efectos coherentes con lo commiteado | `test_v15_10_1_r153_cas_efectos.py` (17: mutación concurrente inyectada DENTRO del efecto en las 4 rutas, compensación con escritura fallida, 12 endpoints × reserva de pipeline) |
| ALTO-03 | `restaurar_imagen_con_texto` ignoraba la reserva previa al arranque del pipeline (única mutación humana fuera de la guarda uniforme) | Pasa por `_assert_documento_editable()` como el resto: 409 mientras el worker vive o su slot está reservado | Ídem (bloque de 12 endpoints × reserva sin hilo vivo) |
| ALTO-04 (+P2 confianza) | Tmax: 10000→10001 px (+0.01 %) confirmaba «máximo inflado estimado» con confianza 1.0 (repro del auditor con breakout en frames 1/5/20) — la invariante temporal R15.2 era necesaria pero no suficiente | Invariante de magnitud/persistencia en `estandar_apertura.py` con constantes documentadas (no un porcentaje arbitrario único): `EXPANSION_MINIMA_RELATIVA=2 %` (escala con resolución/ROI), `EXPANSION_MINIMA_ABSOLUTA_PX=25` (ruido de segmentación), `PERSISTENCIA_EXPANSION_FRAMES=3` (sobre mediana causal) — parametrizables por llamada para calibración de campo. Sin magnitud ⇒ `sin_maximo_defendible`; magnitud sin persistencia (glitch) ⇒ `maximo_visible_observado_no_confirmado`; anomalía nueva `expansion_post_breakout_insuficiente`. P2: penalización −0.40 por esa anomalía y tope 0.35 de confianza para TODO estado no confirmado | `test_v15_10_1_r153_tmax_magnitud.py` (11: repro del auditor ×3, umbral relativo, absoluto, persistencia, no-regresión de expansión real confirmada con 1.0, coherencia de confianza, contrato de umbrales, fuzz ×300 con invariante global) |
| BAJO-06 | Evidencia Node desactualizada: el paquete declaraba 37/37 y el árbol auditado contenía 38 `.cjs` (38/38) | Fix documental: este paquete declara conteos EXACTOS por ámbito — `pruebas/*.cjs` activos = 37 (árbol dev y simulaciones A/B; 37/37 verdes), copias históricas de archivo fuera de `pruebas/` = 8 (`codigo_final_referencia/`, `V15_9_APERTURA_ROI_ZOOM_MATRIZ/archivos/`, `V-Matrix-V15.10.1_CORRECCION_ACUMULADA_R8_20261014/`), total repo = 45. El conteo de 38 del auditor no es reproducible en el árbol dev ni en las simulaciones; la diferencia depende del ámbito del buscador y por eso el ámbito se declara explícitamente | `MATRIZ_EVIDENCIA_R15_3.md` (sección BAJO-06) + `GREEN_R15_3_F5_empaquetado.txt` |

## Fases y commits

| Fase | Contenido | Commit(s) |
|---|---|---|
| F1 | CRÍTICO-01 + MEDIO-05: admisión atómica pipeline/reanálisis + rollback de `Thread.start()` | `005beb6` |
| F2 | ALTO-02 + ALTO-03: atomicidad CAS+efectos en las 4 rutas + guarda uniforme en `restaurar_imagen_con_texto` | `70762d4` |
| F3 | ALTO-04 + P2: invariante de magnitud/persistencia de expansión + confianza coherente | `be93c68` |
| F4 | Identidad del paquete 15.10.1-r15.3: `INSTALAR_R15_3.*`, bases acumulativas r14→r15.3 | `0b00b07` |
| F5 | Docs (este changelog, informe por hallazgo, matriz de evidencia, README) + empaquetado y simulaciones | este commit |

## Cambios de contrato documentados (SUPERSEDE)

1. **Autoridad de mutación extendida:** en `marcar_imagen_sin_datos`, `corregir_lectura`, `revisar_video` y `aprender_zona_video` el CAS autoritativo, los efectos durables y el commit ocurren en la misma región de lock del documento. Tests que ejercitaban interleavings entre prechequeo y CAS final verifican ahora los dos órdenes deterministas posibles (`test_sin_datos_concurrente`); 3 unittests AST amplían su entorno con `contextlib` y 1 con el stub de `_assert_documento_editable` (`test_restaurar_texto_unittest`).
2. **Guarda uniforme completa:** las 12 mutaciones humanas (incluida `restaurar_imagen_con_texto`) responden 409 mientras hay reserva o worker de pipeline.
3. **Tmax:** confirmado exige crecimiento post-breakout ≥ umbral (relativo O absoluto) Y persistencia ≥ 3 frames. Nueva anomalía `expansion_post_breakout_insuficiente`. Todo estado no confirmado queda con confianza ≤ 0.35 (antes una señal plana podía reportar 1.0). Las reglas R15.1/R15.2 se conservan.
4. **Instalador:** `INSTALAR_R15_2.*` → `INSTALAR_R15_3.*`; identidad manifiesto/marker/backup r15.2 → r15.3; bases aceptadas ACUMULATIVAS (se añade r15.2 a las ya existentes); `test_v15_10_1_r15_instalador.py`, `test_v15_10_1_r15_4_instalador_base.py` y `test_v15_10_1_r14_auditoria_preventiva.py` siguen el release. Corrección de bug histórico de documentación: el párrafo R15.1 del docstring decía «PatchBuild 15.10.1-r15.2» por un reemplazo global indebido en R15.2.

## Limitaciones conocidas

- **Sin pwsh en CI/sandbox:** las pruebas del instalador son estáticas (código fuente), mismo criterio que R14/R15/R15.1/R15.2. CAMPO-07 (matriz real en Windows: proceso activo, CIM/WMI caído, fallback, `-Force`, archivo bloqueado, error a mitad, rollback, reinstalación) queda como validación de campo pendiente, igual que AVI reales, GPU Windows y navegador real.
- **Lock de proceso único:** la autoridad compartida serializa escritores DENTRO del proceso; un segundo proceso sobre el mismo JSON sigue fuera del contrato (el instalador exige V-Matrix cerrado precisamente por esto).
- **Umbrales de expansión (ALTO-04):** 2 % / 25 px / 3 frames es una calibración inicial DOCUMENTADA contra ruido de segmentación, parametrizable por llamada; la calibración con AVI reales de campo sigue pendiente (no se declara precisión sin campo).
- **422 de análisis en `aprender_zona_video`:** conserva la ROI (contrato existente anterior a R15.3, sin cambio); la compensación aplica sólo a fallo de commit.

## Criterios de aprobación R15.3 del auditor — estado

| # | Criterio | Estado |
|---|---|---|
| 1 | Pipeline vs reanálisis: 1 solo ganador en 100+ carreras concurrentes | CERRADO (100 carreras, un solo ganador, + interleaving forzado) |
| 2 | 409 CAS: 0 efectos persistentes de la petición rechazada | CERRADO (4 rutas con mutación concurrente inyectada en el efecto) |
| 3 | Reserva pipeline: todas las mutaciones incompatibles bloqueadas | CERRADO (12 endpoints × 409 con reserva sin hilo) |
| 4 | Tmax confirmado: requiere crecimiento post-breakout significativo y defendible | CERRADO (magnitud + persistencia; repro del auditor ⇒ `sin_maximo_defendible`) |
| 5 | Señal plana/ruido: Tmax no confirmado, confianza baja/coherente | CERRADO (tope 0.35 para todo estado no confirmado) |
| 6 | `Thread.start()` fallido: estado final seguro, nunca `preparando` fantasma | CERRADO (rollback + `estado='error'` + 500) |
| 7 | Regresión Python/Node completa sin nuevos fallos | CERRADO (967/0 dev + node 37/37 + sims A/B) |
| 8 | Instalador validado en Windows real | PENDIENTE DE CAMPO (CAMPO-07; imposible en sandbox, código + pruebas estáticas listas) |
