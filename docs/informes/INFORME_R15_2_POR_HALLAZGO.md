# INFORME R15.2 POR HALLAZGO — Auditoría independiente R15.1 (2026-10-15)

Respuesta a `AUDITORIA_INDEPENDIENTE_R15_1_20261015.md` (veredicto: «no
liberar R15.1; publicar R15.2 sin funciones nuevas»). Metodología: cada
hallazgo se reproduce primero con una prueba en ROJO sobre el árbol R15.1
(`17f830d`), se corrige y se verifica en VERDE con la suite completa.
Evidencias crudas en `evidencia/ejecucion/` del paquete y trazabilidad en
`MATRIZ_EVIDENCIA_R15_2.md`.

Versión resultante: **15.10.1-r15.2** (backend, caché frontend, `VERSION.txt`
y marker del instalador reportan la misma versión).

---

## CRÍTICO-01 — La migración de consensos confirma un snapshot viejo

- **Reproducción del auditor:** `_migrar_consensos_video(datos)` recibe el
  snapshot cacheado, lo modifica FUERA del lock y luego escribe ESE snapshot
  completo bajo `_datos_mutacion_lock`: un commit concurrente realizado entre
  la lectura y la escritura se pierde (el contador no retrocede, pero la
  actualización desaparece). La prueba R15.1 no lo veía porque sustituía la
  migración por un stub (`lambda: 0`): la ruta problemática quedaba fuera.
- **Causa raíz:** serializar la escritura no basta si el documento que se
  escribe se leyó antes de tomar el lock. Toda escritura de documento exige
  re-lectura fresca DENTRO del lock.
- **Corrección:**
  1. La lógica por fila se extrae a `_migrar_fila_consensos(fila, …)`:
     idempotente, sin persistir, utilizable sobre cualquier documento.
  2. `_migrar_consensos_video` aplica el patch a la vista en memoria
     (degradación fail-closed para mostrar, igual que antes) y, si hay filas
     migradas, persiste vía la primitiva compartida con una callback que
     RE-APLICA el patch por fila sobre el documento fresco leído bajo lock.
     Si el fresco ya quedó migrado por una ejecución concurrente, devuelve
     `SIN_CAMBIOS` y no commitea (la revisión no se infla).
  3. Fallo de escritura ⇒ mismo contrato V15.9.4 (ALTA-N5): no se declara
     migración, caché invalidada, advertencia visible en `/api/estado`,
     archivo anterior intacto.
  4. El stub `_migrar_consensos_video` se RETIRA de
     `test_v15_10_1_r15_1_documento_global.py` (punto ciego señalado por el
     auditor); sus 9 pruebas siguen verdes con la migración real.
- **Verificación:** `test_v15_10_1_r152_documento_unico.py::test_migracion_consensos_no_pierde_commit_concurrente`
  — carrera REAL: hilo A dispara `_cargar_datos()` (migración pausada dentro
  de `_degradar_campos_consenso_legacy`, antes del lock), el hilo principal
  commitea `CAMBIO_NUEVO` (rev 5→6), se libera la migración. Resultado: ambos
  cambios existen en disco y la revisión final es 7 (monótona). RED: fallo
  con pérdida del commit → GREEN.

## CRÍTICO-02 — Pipeline y validación escriben el documento sin lock ni revisión

- **Reproducción del auditor:** `pipeline.py::_persistir_validacion` (línea
  78) y los persistidores de `validacion.py` (282, 323, 533, 1068) escriben
  el documento completo con `escribir_json_seguro(destino, …)` sin lock, sin
  CAS y sin `revision_documento`: la revisión llega a DESAPARECER del
  documento tras un reproceso. (`validacion.py:544` escribe `ruta_avances`,
  que NO es el documento: se conserva fuera de la primitiva, como señala el
  propio auditor.)
- **Corrección (plan P0 del auditor, textual):**
  1. **Autoridad única** `utilidades/persistencia_documento.py` con el
     contrato exigido: lock por ruta (`lock_documento`) → leer fresco
     (`leer_fresco`, fail-closed ante corrupto) → validar generación/revisión
     (`verificar_expected_revision`, con modo estricto) → aplicar patch/merge
     → incrementar revisión (`commit_documento`, monótona + sello
     `generado_en`) → escritura atómica verificada (`escribir_json_seguro`;
     fallo ⇒ `EscrituraFallida`, nunca éxito falso). Centinela `SIN_CAMBIOS`.
     Excepciones propias (framework-agnostic) que cada capa traduce.
  2. **Backend delega:** `mutar_documento`, `_leer_documento_disco`,
     `_commit_documento` y `_verificar_expected_revision` son envoltorios que
     traducen a HTTP (409/404/503) conservando los mensajes vigentes; los
     flujos de video (revisión, máximo, zona, revertir, reanálisis) usan el
     MISMO lock por ruta (`_lock_documento()`).
  3. **Pipeline/validación:** `persistir_documento_completo(destino,
     documento, al_error=…)`: reemplazo completo bajo el lock compartido con
     carry-forward `revision_documento = max(rev_disco, rev_doc)` (la revisión
     nunca desaparece ni retrocede) y sincronización del artefacto en memoria
     con lo persistido. Documento corrupto en disco ⇒ NO se sobrescribe
     (fail-closed V15.9.2): `al_error` + `advertencias_persistencia`.
  4. **Guard estático:** `test_guard_estatico_escritura_unica_del_documento`
     falla si reaparece `escribir_json_seguro(RUTA_VALIDACION…)`/`(destino…)`
     fuera del módulo autorizado o si `pipeline.py`/`validacion.py` dejan de
     usar la autoridad compartida.
  5. **Protección pipeline vs UI (P0 temporal del auditor):**
     `_assert_documento_editable()` ⇒ 409 «Termina o detén el procesamiento
     antes de …» mientras el worker vive o su slot está reservado
     (`_slot_pipeline_ocupado_locked`), colocado ANTES de cualquier lookup o
     efecto en: campo manual, consolidar, corrección OCR, rotación (carpeta),
     sin-datos (carpeta) y verificar imagen. Video/con-texto/zona ya tenían
     guard propio (ALTA-07/V14); el reproceso de caso usa el mismo slot del
     worker, así que queda cubierto. Lecturas permitidas sin cambio.
- **Verificación:** `test_v15_10_1_r152_documento_unico.py` — autoridad
  compartida existe y backend delega (lock idéntico, wrappers), pipeline
  preserva `revision_documento` (rev previa 7 → tras persistir ≥ 7 y campo
  nuevo presente), pipeline escribe bajo el lock compartido (la mutación UI
  concurrente entra antes o después, nunca se pierde), guard estático, y 11
  endpoints mutantes × 409 con `_pipeline_hilo` vivo. RED: 11 fallos → GREEN.

## ALTO-03 — Tmax 0 ms «confirmado» con breakout ≠ frame 0

- **Reproducción del auditor:** señal plana posterior al breakout ⇒
  `idx_pico = 0` ⇒ meseta en índice 0 ⇒ `frame_max == frame_breakout` ⇒
  `maximo_inflado_estimado` con `duracion_expansion_ms = 0`. Las reglas R15.1
  sólo censuraban el frame 0 del clip; con breakout en 1/5/20 el defecto
  reaparece (100 frames × valor constante).
- **Corrección:** invariante física GLOBAL al final del cálculo de tiempos en
  `analizar_secuencia_despliegue` (`utilidades/estandar_apertura.py`):

      estado == "maximo_inflado_estimado" ⇒ frame_max > frame_breakout
                                            ∧ duracion_expansion_ms > 0

  - `frame_max <= inicio` ⇒ `sin_maximo_defendible` + anomalías
    `maximo_coincide_con_breakout` y `sin_evidencia_de_expansion` (nunca
    confirmado sin evidencia de expansión posterior).
  - Expansión en frames observada pero `fps` no disponible (duración no
    cuantificable) ⇒ `maximo_visible_observado_no_confirmado` +
    `sin_evidencia_de_expansion`.
  - Las anulaciones R15.1 por censura en frame 0 se conservan intactas
    (actúan antes y producen sus propios estados).
- **Verificación:** `test_v15_10_1_r152_tmax_invariante.py` (8 pruebas):
  breakout 1/5/20 con señal plana (repro exacta del auditor), casi plana con
  ruido de 1 px, breakout cerca del final, expansión real confirmada
  (no-regresión: sigue `maximo_inflado_estimado` con dur > 0), expansión real
  sin fps (degradado) y fuzz ×300 (señales/breakouts/fps aleatorios) que
  comprueba la invariante global + orden de fases en CADA caso. RED: 7
  fallos → GREEN 8/8; batería video/apertura/reportes 211 verdes.

## ALTO-04 — CAS estricto no conectado a las mutaciones UI + efectos antes de CAS

- **Reproducción del auditor:** las 7 mutaciones legacy aceptaban
  `expected_revision=None` contra documento versionado (el CAS estricto R15.1
  sólo cubría video); la UI no enviaba `expected_revision` en esas pantallas;
  `marcar_imagen_sin_datos` registraba en la base de aprendizaje ANTES de
  mutar (efecto lateral irreversible con petición rechazable).
- **Corrección:**
  - Backend: `estricto=True` en los 7 call sites de `mutar_documento`
    (corrección OCR, rotación, sin-datos, con-texto, verificar, consolidar,
    campo manual). `_prechequeo_cas_documento()` valida el CAS contra disco
    ANTES de los registros sqlite en OCR y sin-datos (el CAS definitivo se
    repite bajo lock en la primitiva). `/api/pruebas` expone
    `revision_documento`.
  - Frontend (`dashboard/frontend/app.js`, VistaDetalle): las 5 mutaciones
    envían `expected_revision: detalle?.revision_documento ?? null`; tras
    cada respuesta el detalle se recarga (revisión actualizada); ante 409,
    `refrescarTrasConflicto` (vía `esConflictoRevision`) recarga el detalle
    SIN descartar el borrador del usuario. `TarjetaExterna` no toca el
    documento global (documento propio de externas): fuera de alcance, como
    en R15.1.
- **Verificación:** `test_v15_10_1_r152_cas_ui.py` (21 pruebas): 6 endpoints
  × 409 sin `expected_revision` sobre documento versionado (revisión en disco
  intacta), 7 × 409 con revisión desfasada («recarga antes de guardar»),
  éxitos con revisión correcta (verificar, campo manual, con-texto: commit y
  rev+1 en respuesta y disco), sin-datos rechazado NO registra marca sqlite,
  OCR rechazada NO registra corrección, con-texto rechazado CONSERVA la
  marca, `/api/pruebas` expone la revisión y sin documento no la inventa.
  RED: 10 fallos → GREEN 21/21. Cableado frontend:
  `test_v15_10_1_r152_ui_cas_y_badges.cjs`.

## MEDIO-05 — `<strong>NO CONFIRMADO</strong>` renderizado como texto literal

- **Reproducción del auditor (defecto REAL de la Fase 2 de R15.1):** los dos
  sitios del badge interpolaban la cadena `` ` · <strong>${t("NO
  CONFIRMADO")}</strong> (…)` `` dentro de un template `html```: React pinta
  la cadena como texto y el usuario ve las etiquetas.
- **Corrección:** helper `maximoNoConfirmadoBadge(estado, t)` construye la
  insignia con `html`` anidado (elemento real `<strong>`); los dos sitios
  (subtítulo de video y `<dd>` de la tabla de evidencias) lo consumen. Para
  estado confirmado o ausente devuelve `null` (nada se pinta).
- **Verificación:** `test_v15_10_1_r152_ui_cas_y_badges.cjs` con RENDER real
  del vendor (`react.production.min.js` + `htm.umd.js`): se extrae la
  función REAL del fuente, se renderiza para los dos estados no confirmados
  y se recorre el árbol de elementos — `textContent` sin `<` ni `>`,
  contiene «NO CONFIRMADO» y existe un nodo de tipo `strong`; guard de
  fuente: la construcción con `<strong>` sólo existe dentro del `html`` del
  helper. El pintado final en navegador real sigue pendiente de campo
  (criterio 8: satisfecho a nivel de elemento/React).

## MEDIO/BAJO-06 — Instalador: marker por existencia + reinstall sin respaldo

- **Reproducción del auditor:** `Assert-BaseConocida` aceptaba CUALQUIER
  archivo en la ruta del marker (uno vacío, corrupto o de otro proyecto
  colaba como base conocida); en reinstalación, el marker propio se
  sobrescribía sin respaldo y el rollback lo eliminaba a ciegas (la carpeta
  perdía la evidencia de su instalación anterior).
- **Corrección (`INSTALAR_R15_2.ps1`):**
  - Marker de base validado por CONTENIDO: `ConvertFrom-Json` →
    `patch_build` ∈ {r14, r15, r15.1, r15.2}; marker ilegible o de versión
    desconocida NO acepta la base (sigue el throw sin modificar nada).
  - Reinstalación: el marker previo se copia a `_MARKER_PREVIO.json` dentro
    del backup ANTES de `Set-Content`; `Rollback-Transaction` lo RESTAURA
    (y sólo elimina el marker cuando el run lo creó desde cero).
  - Identidad completa r15.2: manifiesto `MANIFEST_SHA256_R15_2.txt`,
    `PatchBuild 15.10.1-r15.2`, marker `PATCH_INSTALLED_V15_10_1_R15_2.json`,
    backups `_BACKUP_PRE_R15_2_`, sufijo de colisión `_root_pre_R15_2`,
    postflight (index/app/VERSION) y echoes de éxito/verificación.
- **Verificación:** `test_v15_10_1_r15_4_instalador_base.py` (3 pruebas
  nuevas: contenido de marker, respaldo antes de sobrescribir, rollback que
  restaura) + identidad actualizada en `test_v15_10_1_r15_instalador.py` y
  `test_v15_10_1_r14_auditoria_preventiva.py`. Estáticas (sin pwsh en
  sandbox): la ejecución real en Windows con fallo CIM inducido, `-Force` y
  rollback (criterio 11) queda PENDIENTE DE CAMPO, igual que en R15.1.

---

## Lo que la auditoría dio por bueno (no tocado)

Integridad ZIP/manifiesto R15.1, identidad/versionado coherente, CAS de video
(61/61 del auditor), tests frontend `.cjs` (37 archivos, 0 fallos) y la ruta
de actualización base→R14→R15.1 se conservan sin cambios de contrato.

## Pendientes de campo (heredados + criterio 11)

AVI reales, GPU Windows, navegador real (pintado del badge), e instalador en
Windows real con fallo CIM/`-Force`/rollback. R15.2 NO declara producción ni
precisión 0.1 ms: la referencia temporal sigue siendo relativa al inicio del
video sin trigger eléctrico (R16 fuera de alcance).
