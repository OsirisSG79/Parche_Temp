# INFORME R15.6 POR HALLAZGO — cierre de la auditoría independiente R15.5

**Paquete auditado:** `R15_5_FINAL.zip` (SHA-256 `bc99b88e…cf6829`) ·
**Auditoría:** `AUDITORIA_INDEPENDIENTE_R15_5_20261016.md` ·
**Versión de cierre:** `15.10.1-r15.6` · **Fecha:** 2026-10-16

Regla de trabajo: cada hallazgo se reproduce PRIMERO en una prueba oficial
(RED), después se corrige (GREEN). Ninguna cifra de este informe es manual:
todas salen de los logs de `evidencia/ejecucion/`.

---

## CRÍTICO-01 — Corrección manual de campo persistía aunque la petición fallara

* **Repro del auditor:** documento en revisión 3, confirmación manual
  `test_number=2002`, commit documental correcto (revisión 4) y fallo FORZADO
  posterior de `gestor.actualizar_revision()` ⇒ petición en error con el
  documento modificado y el estado de revisión externo sin actualizar.
* **Causa:** `corregir_campo_caso` ejecutaba `mutar_documento(...)` y sólo
  DESPUÉS `actualizar_revision(...)`, fuera de `TransaccionMultiAlmacen`.
* **Corrección (F1, `218ea89`):** migración al helper único
  `_transaccion_efecto_humano`: el estado de revisión es efecto compensable
  que se aplica ANTES del commit documental (`commit_fn` al final). Fallo de
  revisión ⇒ documento intacto; fallo de commit ⇒ revisión restaurada.
* **Pruebas:** `test_corregir_campo_fallo_revision_no_toca_documento` (RED:
  documento avanzaba; GREEN: bytes idénticos + revisión `REV_INICIAL` +
  valor `1001`) y `test_corregir_campo_exito_documento_y_revision`.
* **Evidencia:** `RED_R15_6_F1_efectos_humanos.txt`,
  `GREEN_R15_6_F1_efectos_humanos.txt`.

## MEDIO-06 — Rutas multi-efecto fuera del coordinador

* **Repro del auditor:** `marcar_region_no_texto` persiste la marca y luego
  falla `actualizar_revision` ⇒ región `no_texto` activa con petición en
  error. Revisión estática: mismo patrón en `no-texto-lote`, anotaciones de
  región, correcciones externas y edición de zona; el lote además no era
  atómico (segunda marca fallida dejaba la primera aplicada).
* **Corrección (F1, `218ea89`):** TODAS las rutas migradas al helper único;
  lote reescrito como efecto único dentro de una transacción (falla cualquier
  marca ⇒ snapshot común restaura también las aplicadas); snapshot ampliado
  con `regiones_no_texto`, `anotaciones_regiones`, `orientaciones_region`.
  Aprendizaje automático movido a post-commit tolerante a fallo.
* **Pruebas:** 8 en `test_v15_10_1_r156_efectos_humanos.py` (no-texto fallo/
  éxito, lote segundo fallo, anotación región, externas corrección/región),
  verificando también filas SQLite y número de revisión.
* **Evidencia:** logs F1 (arriba).

## ALTO-02 — Doble fallo en `corregir_lectura` sin registro de inconsistencia

* **Repro del auditor:** fallo del commit/`actualizar_revision` + fallo de
  `restaurar_evidencias_imagen()` ⇒ 503 pero corrección SQLite persistida,
  `_inconsistencias_activas` vacío y recurso sin bloqueo (tras reinicio, el
  doble fallo desaparecía). Las ramas `ilegible`/`no_es_campo` ni capturaban
  snapshot.
* **Corrección (F2, `981453a`):** `corregir_lectura` migrada COMPLETA al
  coordinador (todas las ramas capturan snapshot de evidencias + revisión);
  rollback manual duplicado eliminado; `tx.fallar` registra la inconsistencia
  de forma durable y bloquea el recurso (`_assert_recurso_consistente` a la
  entrada); excepciones crudas traducidas a 503 controlado; aprendizaje
  post-commit opcional.
* **Pruebas:** `test_corregir_lectura_doble_fallo_registra_inconsistencia_durable`
  (registro en memoria + archivo + segunda llamada bloqueada 503
  «inconsistente»), `…_fallo_revision_cero_efectos`, `…_ilegible_fallo_revision_cero_efectos`,
  `…_exito_conserva_efectos`.
* **Evidencia:** `RED_R15_6_F2_lectura_zona.txt` (4F/2P),
  `GREEN_R15_6_F2_lectura_zona.txt` (batería 20/20 + suite 1024/0).

## ALTO-11 — Edición de zona persistía aunque fallara la actualización de revisión

* **Repro del auditor:** inserción en `ediciones_zona` correcta + fallo
  posterior de `actualizar_revision` ⇒ edición activa con petición fallida.
* **Corrección (F2, `981453a`):** `editar_zona` (`guardar`/`deshacer`/
  `guardar_bloque`) bajo `TransaccionMultiAlmacen` con snapshot de evidencias
  + revisión; `previsualizar`/`estado` siguen siendo lecturas sin tx.
* **Bug latente descubierto y corregido:** `snapshot/restaurar_evidencias_imagen`
  usaba `WHERE id IN` sobre `ediciones_zona_detalle`, cuya PK es `edicion_id`
  (`sqlite3.OperationalError: no such column: id`) ⇒ la compensación de zonas
  editadas SIEMPRE fallaba en silencio. Corregido en captura y restauración.
* **Pruebas:** `test_editar_zona_fallo_revision_cero_efectos` (503 + cero
  filas + registro vacío) y `test_editar_zona_exito_revision_y_edicion`;
  arnés AST `test_api_zonas_unittest.py` adaptado (documentado).
* **Evidencia:** logs F2 (arriba).

## ALTO-08 / ALTO-09 — Mutaciones aceptadas durante la reserva del pipeline

* **Repro del auditor:** `_pipeline_hilo=None` + `_pipeline_reserva` ocupada
  (ventana entre admisión y `Thread.start()`) ⇒ `editar_zona` devolvía
  `guardado=True` y `orientacion-region` devolvía `guardada=True`.
* **Corrección (F3, `51a2e58`):** guard uniforme `_assert_pipeline_inactivo`
  (estado de procesamiento + `_slot_pipeline_ocupado_locked()` = reserva o
  hilo vivo; opcionalmente reanálisis) sustituye los checks locales
  `is_alive()` en `editar_zona` (antes de tomar `_zona_lock`) y en
  `guardar_orientacion_region` (antes de cualquier lookup).
* **Pruebas:** `test_editar_zona_reserva_bloquea`,
  `test_orientacion_regional_reserva_bloquea` (+ no-regresiones: hilo vivo
  sigue bloqueando; sin pipeline, la orientación se guarda).
* **Evidencia:** `RED_R15_6_F3_guard_uniforme.txt` (5F/4P),
  `GREEN_R15_6_F3_guard_uniforme.txt` (13/13 + suite 1033/0 + node).

## ALTO-10 — Revisión cerrable como `completada` con el pipeline activo

* **Repro del auditor:** `_pipeline_estado={"estado":"procesando"}` + reserva
  ocupada ⇒ `POST /api/revisiones` con `estado="completada"` aceptado y
  persistido.
* **Corrección (F3, `51a2e58`):** para `tipo="carpeta"`, la transición a
  `completada` exige pipeline inactivo (hilo/reserva/estado) Y sin reanálisis
  de videos en curso (`incluir_reanalisis=True`); el resto de transiciones
  conserva el comportamiento heredado.
* **Pruebas:** `test_revision_completada_reserva_bloquea`,
  `…_procesando_bloquea`, `…_reanalisis_bloquea`,
  `test_revision_parcial_con_reserva_no_bloquea` (no-regresión).
* **Evidencia:** logs F3 (arriba).

## ALTO-03 — Registro de inconsistencias fail-open

* **Repro del auditor:** doble fallo real con `RUTA_INCONSISTENCIAS` no
  escribible ⇒ bloqueo sólo en memoria; reinicio simulado
  (`_cargar_inconsistencias()`) ⇒ recurso DESBLOQUEADO en silencio. Registro
  corrupto al arrancar ⇒ ignorado (`except: pass`).
* **Corrección (F4, `1f582e9`):**
  * `_escribir_json_verificado()`: temporal + `fsync` + replace + RELECTURA
    de verificación; nunca éxito sin verificar.
  * `_persistir_inconsistencias()` ya no traga `OSError`: si falla ⇒
    `_activar_modo_recuperacion()` (MODO RECUPERACIÓN global + centinela
    durable `recuperacion_requerida.json` que sobrevive reinicios).
  * `_cargar_inconsistencias()`: registro ilegible/corrupto o centinela
    presente ⇒ modo recuperación (fail-closed), jamás `pass`.
  * En modo recuperación, `_assert_documento_editable`,
    `_assert_pipeline_inactivo`, `_guard_mutacion_video` y
    `_assert_recurso_consistente` bloquean con 503 explicativo.
* **Pruebas:** `test_registro_no_escribible_bloquea_tambien_tras_reinicio`,
  `test_registro_corrupto_al_iniciar_activa_modo_recuperacion`,
  `test_modo_recuperacion_bloquea_mutaciones_gobernadas`,
  `test_persistencia_normal_es_verificada_y_durable`.
* **Evidencia:** `RED_R15_6_F4_recuperacion.txt` (9F/1P),
  `GREEN_R15_6_F4_recuperacion.txt` (10/10 + suite 1043/0).

## MEDIO-05 — Sin flujo público de recuperación; borrado manual ineficaz

* **Repro del auditor:** el mensaje pedía eliminar `estado_inconsistente.json`
  a mano; haciéndolo, el proceso en marcha seguía devolviendo 503 (memoria)
  y no existía flujo público/UI para resolver correctamente.
* **Corrección (F4 API `1f582e9` + F6 UI `40eb226`):**
  * `GET /api/recuperacion/inconsistencias` (listado + modo + auditoría).
  * `POST /api/recuperacion/inconsistencias/{recurso}/resolver` y
    `POST /api/recuperacion/modo-recuperacion/resolver`: exigen
    `confirmo_verificacion=true` (400 sin ella), escriben el registro de
    forma verificada (si falla, el bloqueo SE MANTIENE), limpian el centinela
    cuando no quedan entradas y registran auditoría durable de quién/cuándo
    (`inconsistencias_resueltas.json`).
  * Mensajes de bloqueo remit al flujo API; ya no piden borrado manual.
  * UI `EstadoRecuperacion` en el centro de notificaciones: lista bloqueos,
    anuncia el MODO RECUPERACIÓN (motivo/fecha) y resuelve con usuario +
    confirmación explícita.
* **Pruebas:** 6 API en `test_v15_10_1_r156_recuperacion.py` +
  `test_v15_10_1_r156_recuperacion_ui.cjs` (inventario node 39/39).
* **Evidencia:** logs F4 (arriba) + `RED/GREEN_R15_6_F6_recuperacion_ui.txt`.

## ALTO-04 — Lost update entre dos pestañas en `pruebas_externas.json`

* **Repro del auditor:** EXT1 y EXT2 cargan el mismo snapshot; ambas marcan
  su imagen sin datos; ambas peticiones terminan sin error; el documento
  final conserva sólo el cambio de EXT2 (`escribir_json_seguro` da atomicidad
  de archivo, no control de concurrencia).
* **Corrección (F5, `a50512f`):** autoridad equivalente a
  `persistencia_documento` para el documento externo:
  * Lock por ruta (`_pdoc.lock_documento(salida)`) cubriendo
    lectura→patch→commit en las ramas externas de `guardar_rotacion`,
    `marcar_imagen_sin_datos` y `restaurar_imagen_con_texto` (wrappers
    públicos + `_impl`).
  * Lectura fresca DENTRO del lock + CAS `expected_revision` (409 sin
    efectos) + `_commit_documento_externo` con `revision_documento`
    monotónica y escritura verificada.
  * `pruebas_externas._commit_documento_completo` para `evaluar`
    (regeneración completa bajo el mismo lock; la revisión nunca retrocede).
* **Pruebas:** `test_dos_pestanas_preservan_ambos_cambios` (carrera real con
  dos hilos y espera acotada: AMBOS cambios sobreviven),
  `test_commit_externo_versiona_revision`,
  `test_expected_revision_desfasada_409_sin_efectos`,
  `test_expected_revision_correcta_confirma`,
  `test_restaurar_con_texto_versiona_y_cas`,
  `test_commit_completo_monotonico`, `test_commit_completo_sin_documento_previo`.
* **Evidencia:** `RED_R15_6_F5_documento_externo.txt` (7F),
  `GREEN_R15_6_F5_documento_externo.txt` (10/10 + suite 1050/0 + node).

## BAJO-07 — Inventario Node/documentación inconsistente con el árbol

* **Hallazgo:** la documentación declaraba 38 `.cjs` mientras el árbol
  acumulativo auditado tenía 39 activos (39/39 verdes).
* **Corrección (F6 `40eb226` + build R15.6):** el inventario se GENERA desde
  el árbol real: `ls pruebas/*.cjs` en el repo/payload da **39 activos**
  (38 heredados + `test_v15_10_1_r156_recuperacion_ui.cjs`), ejecutados con
  cwd = raíz del árbol; el build del paquete escribe
  `evidencia/INVENTARIO_PAYLOAD_R15_6.txt` desde el staging (categorias,
  listas y conteos calculados, nunca manuales); la MATRIZ cita las cifras de
  los logs de simulación, no cifras escritas a mano.
* **Evidencia:** `GREEN_R15_6_F6_recuperacion_ui.txt` (39/39 + inventario),
  logs SIM_R15_6_*.

## Plan P1 ítem 9 — Inventario automático de writers

* `test_inventario_writers_revision_bajo_coordinador`: escaneo AST de
  `app.py` — toda función que llame `gestor.actualizar_revision` debe usar
  `_transaccion_efecto_humano`/`TransaccionMultiAlmacen`, con whitelist
  documentada (el endpoint de revisión —writer de un único almacén— y la
  primitiva de compensación). Una regresión de la Causa A rompe la suite.

## Adaptaciones documentadas de pruebas heredadas

Contratos sustituidos (no «edición para verdear»):

1. `_GestorStub` de `test_v15_10_1_r15_1_documento_global.py`: añade
   `_conectar()` efímera (el helper R15.6 captura/restaura revisión vía
   sqlite; el stub no tiene efectos reales que compensar).
2. 4 arneses AST (`test_api_zonas_unittest.py`,
   `test_reconfirmacion_unittest.py`, `test_reconfirmacion_simbolos_unittest.py`,
   `test_sobrescritura_publica_unittest.py`, `test_restaurar_texto_unittest.py`):
   stubs de los nombres nuevos del handler migrado
   (`TransaccionMultiAlmacen`/`_TxStub`, `_assert_recurso_consistente`,
   `_assert_pipeline_inactivo`, primitivas de snapshot, `_impl`).
3. `test_v15_10_1_r14_auditoria_preventiva.py`: el pin de identidad sigue el
   release (r15.5 → r15.6), SUPERSEDE ya documentado en R15.5.
4. Retirada de `INSTALAR_R15_5.*` + su test de identidad (precedente exacto:
   commit `9a50dc7` hizo lo mismo con R15.4).

## Pendiente de campo (sin cambios respecto a R15.5)

Instalador/rollback en Windows real, calibración Tmax con AVI reales, soak
100–200 en máquina objetivo. **No se declara Production Ready**: el veredicto
corresponde a la siguiente auditoría independiente con estas pruebas de campo.
