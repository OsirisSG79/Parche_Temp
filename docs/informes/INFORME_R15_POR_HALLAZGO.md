# Informe por hallazgo — V-Matrix V15.10.1 R15

Referencia: `AUDITORIA_EXHAUSTIVA_V_MATRIX_R14_20261015.md` (17 hallazgos) + plan
«V-Matrix R15» del usuario. Cada hallazgo se corrigió con prueba RED previa
(reproducción del defecto sobre el árbol anterior) y verificación GREEN.

Estado global: **17/17 hallazgos corregidos** · **18/18 pruebas obligatorias implementadas**
(la 17 a nivel de código fuente; ejecución Windows real pendiente de campo).

---

## CRIT-01 — Dos pipelines pueden arrancar simultáneamente
- **Fase 1** · RED `5d7ea54` → fix `737e146`
- **Corrección:** reserva atómica `_pipeline_reserva` bajo lock global; la comprobación `is_alive()` y la ocupación del slot son ahora una sola operación atómica. 409 con mensaje diferenciado (hilo vivo vs reserva) para no romper los contratos V14.
- **Pruebas:** `test_v15_10_1_r15_concurrencia.py::test_pipelines_simultaneos_un_solo_worker` (obligatoria 1) y 7 tests más del archivo.

## ALTA-02 — El reproceso selectivo tiene la misma carrera de doble arranque
- **Fase 1** · mismo fix.
- **Corrección:** `reprocesar_caso` pasa por la misma reserva atómica; efectos persistentes (ROI) sólo post-admisión, con rollback + 503 si se rechaza.
- **Pruebas:** `test_pipeline_y_reproceso_simultaneos_un_solo_worker` (obligatoria 2), `test_dos_reprocesos_simultaneos_un_solo_worker` (3), `test_reproceso_rechazado_no_guarda_roi`.

## ALTA-03 — Reanálisis de vídeo puede sobrescribir cambios humanos hechos durante su ejecución
- **Fase 2** · RED `26f849e` → fix `72b77b7`
- **Corrección:** `_reanalizar_videos_fondo` reescrito: cada video produce un patch que se fusiona bajo `_datos_mutacion_lock` sobre el documento fresco (nunca `dict.update()` sobre una copia vieja); `revision_manual` y `ultima_zona_nacimiento` sobreviven; patch huérfano = error visible.
- **Pruebas:** `test_v15_10_1_r15_revisiones.py::test_edicion_manual_durante_reanalisis_sobrevive` (obligatoria 5).

## ALTA-04 — Revisión manual puede reportar éxito aunque su archivo durable no se haya guardado
- **Fase 3** · `737abad`
- **Corrección:** `ErrorPersistenciaRevisiones` + `_guardar_json_verificado` (temp→flush→fsync→replace→releer) en `video_airbag.py`; el endpoint captura y responde 503 «La revisión no se guardó», nunca éxito falso.
- **Pruebas:** `test_v15_10_1_r15_persistencia.py` (3 tests; obligatoria 9).

## ALTA-05 — El cálculo de máximo puede devolver 0 ms de expansión incorrectamente
- **Fase 4** · RED `44a5173` → fix `e1ef0f6`
- **Corrección:** mediana móvil estrictamente causal `bruto[max(0,i-2):i+1]` (sin contaminación futura); invariante `idx_max > 0` si `idx_pico > 0`; imposible `t_max < t_breakout`.
- **Pruebas:** `test_v15_10_1_r15_tmax_causal.py` (7 tests; obligatoria 11: secuencia `[1,100,100,100]`).

## ALTA-06 — Cambiar/revertir ROI puede dejar campos viejos de una detección anterior
- **Fase 5** · `be6e96e`
- **Corrección:** `clear()` del estado de detección conservando explícitamente identidad (`id`, `ruta_relativa`, `carpeta_video`) y datos humanos (`revision_manual`, `ultima_zona_nacimiento`) en zona-aprendizaje y zona-revertir.
- **Pruebas:** `test_v15_10_1_r15_estados_obsoletos.py` (2 tests; obligatoria 10).

## ALTA-07 — Ediciones de video no protegidas con revisión completada o procesamiento global
- **Fase 2** · mismo fix que ALTA-03.
- **Corrección:** guards `_verificar_revision_no_completada` y de pipeline/reanálisis activo ANTES de cualquier efecto persistente; 409 sin efectos laterales.
- **Pruebas:** `test_revision_completada_bloquea_ediciones_de_video` (obligatoria 7), `test_revision_bloqueada_con_pipeline_activo` (8), `test_zonas_bloqueadas_con_reserva_de_pipeline`, `test_revision_bloqueada_con_reanalisis_activo` (6).

## MEDIA-08 — Polling de proceso/listado puede solaparse y pintar estados atrasados
- **Fase 6** · `43acc3b`
- **Corrección:** `red_segura.js::crearSondeoSerial` (una petición en vuelo por sondeo) + `crearGuardaSecuencia` (respuesta vieja nunca sobrescribe nueva); polling de proceso y listado serializado en `app.js`.
- **Pruebas:** `test_v15_10_1_r15_red_segura.cjs` (obligatoria 13).

## MEDIA-09 — Scrubbing de frames puede saturar backend (lupa F±2)
- **Fase 6** · mismo commit.
- **Corrección:** fetch de frame con AbortController (cancela el anterior) + Blob + debounce 60 ms + `URL.revokeObjectURL`; máximo 1 solicitud activa de frame por tarjeta.
- **Pruebas:** `test_v15_10_1_r15_red_segura.cjs` (obligatoria 14).

## MEDIA-10 — Validación de nombre Excel no cubre todos los nombres inválidos de Windows
- **Fase 7** · RED+fix `9d08baf`
- **Corrección:** primer componente `split(".",1)[0]` contra reservados (CON/PRN/AUX/NUL/COM1-9/LPT1-9) + superíndices Unicode de Windows; espacio final evaluado en CRUDO antes de strip; punto final rechazado.
- **Pruebas:** `test_v15_10_1_r15_entradas.py::test_dispositivos_reservados_con_extensiones_adicionales`, `test_espacio_final_crudo_se_rechaza`, `test_punto_final_se_rechaza` (obligatoria 15) + 16 tests más.

## MEDIA-11 — Se bloquea la raíz exacta del programa, pero no una carpeta padre que la contiene
- **Fase 7** · mismo commit.
- **Corrección:** `es_raiz_codigo_seleccionada` bloquea la raíz y sus ancestros (`programa.is_relative_to(objetivo)`); mensaje 400 actualizado («…o una carpeta que la contiene...»).
- **Pruebas:** `test_raiz_exacta_y_ancestros_del_programa_se_bloquean`, `test_mensaje_del_endpoint_cubre_ancestros` (obligatoria 16).

## MEDIA-12 — Preflight del instalador falla abierto si CIM/WMI no funciona
- **Fase 7b** · `5d25e67` (RED reproducido sobre copia R14 con defecto intacto)
- **Corrección:** `INSTALAR_R15.ps1::Assert-VMatrixStopped` — fallo de CIM ⇒ `Write-Warning` visible + fallback `Get-Process` (rutas por proceso; procesos no inspeccionables ⇒ NO verificado); no verificado ⇒ `throw` (fail-closed) salvo `-Force` explícito con warning. `INSTALAR_R14.ps1` se conserva sin modificar como referencia.
- **Pruebas:** `test_v15_10_1_r15_instalador.py` (5 tests; obligatoria 17 — código fuente; sin `pwsh` en CI, ejecución Windows real pendiente).

## MEDIA-13 — `pedirJSON` convierte cualquier 404 en `null`
- **Fase 6** · `43acc3b`
- **Corrección:** `lanzar404` en `red_segura.js`; 13 sitios de `pedirJSON` con `permitir404:false`; 404 = error explícito en UI.
- **Pruebas:** `test_v15_10_1_r15_red_segura.cjs`.

## MEDIA-14 — Pantalla de detalle sin control de versión frente a cambios de otra pestaña
- **Fases 2+6** · `72b77b7` (backend) + `43acc3b` (cliente)
- **Corrección:** `revision_documento` expuesto en detalle; `expected_revision` en 4 modelos de request y 5 POSTs del cliente (flujo combinado encadena la revisión de cada respuesta); 409 ⇒ `falloMutacion` con recarga automática.
- **Pruebas:** `test_expected_revision_antigua_devuelve_409`, `test_detalle_expone_revision_documento` (obligatoria 18 backend) + `.cjs` (cliente).

## MEDIA-15 — Efectos persistentes ocurren antes de saber si una ejecución será admitida
- **Fase 1** · `737e146`
- **Corrección:** registro de proyecto y checkpoint ocurren sólo post-admisión; `Thread.start()` verificado con rollback + 500; checkpoint corrupto no se ignora en silencio.
- **Pruebas:** `test_inicio_rechazado_no_registra_proyecto`, `test_fallo_thread_start_deja_estado_seguro_y_slot_libre` (obligatoria 4).

## MEDIA-16 — «Máximo inflado» se publica aun cuando sólo existe un pico no confirmado al borde
- **Fase 4** · `e1ef0f6`
- **Corrección:** taxonomía de estados: meseta/caída tras pico ⇒ `maximo_inflado_estimado`; clip creciente hasta el final ⇒ `maximo_visible_observado_no_confirmado`; señal insuficiente ⇒ `sin_maximo_defendible`.
- **Pruebas:** `test_clip_creciente_hasta_el_final_no_es_maximo_confirmado` (obligatoria 12), `test_senal_insuficiente_es_sin_maximo_defendible`, `test_meseta_confirmada_sigue_publicando_maximo_estimado`, `test_caida_clara_tras_pico_es_maximo_estimado`.

## BAJA-17 — Tooltip de evento censurado sobrescrito por un `title` duplicado
- **Fase 6** · `43acc3b`
- **Corrección:** eliminado el `title` duplicado en la tarjeta de video; prevalece el tooltip censurado.
- **Pruebas:** `test_v15_10_1_r15_red_segura.cjs` (sección tooltip).

---

## Trabajo adicional R15 (no hallazgos)
- **Fase 8a (`4b5b132`):** alineación SUPERSEDE documentada de las 13 pruebas obsoletas V15.9 (contratos reemplazados por doctrina R9–R13; cero cambios de código de producto). La suite pasa de 847/13 a 860/0.
- **Fase 8b (`b8c8bca`):** bump de versión 15.10.1-r15 (backend + caché frontend + pins de prueba con SUPERSEDE).
- **Incidente de entorno:** pérdida de `.git` en el sandbox entre turnos; historia reconstruida (`6f72828` → `5d25e67`) con verificación de integridad del árbol por marcadores de fase. Detalles en `GREEN_R15_FASE7b_instalador.txt`.
