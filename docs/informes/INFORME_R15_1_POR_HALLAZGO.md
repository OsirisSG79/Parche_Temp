# INFORME R15.1 POR HALLAZGO — Auditoría independiente R15 (2026-10-15)

Respuesta a `AUDITORIA_INDEPENDIENTE_R15_20261015.md` (veredicto: «R15 corrige
una parte importante pero NO está lista para producción»). Metodología: cada
hallazgo se reproduce primero con una prueba en ROJO sobre el árbol R15, se
corrige y se verifica en VERDE con la suite completa. Evidencias crudas en
`evidencia/ejecucion/` del paquete y matriz de trazabilidad en
`MATRIZ_EVIDENCIA_R15_1.md`.

Versión resultante: **15.10.1-r15.1** (backend, caché frontend, `VERSION.txt`
y marker del instalador reportan la misma versión).

---

## CRÍTICO-01 — Writers legacy sin lock/CAS pierden actualizaciones

- **Reproducción del auditor:** revisión 6 → 5 con `VIDEO_NUEVO` perdido al
  concurrir un endpoint legacy (leer snapshot → modificar → reescribir TODO)
  con un commit R15.
- **Causa raíz:** 7 endpoints seguían con `_cargar_datos() → modificar →
  _guardar_json_atomico(RUTA_VALIDACION, datos)` sin lock, sin CAS y sin
  `_commit_documento`: campo manual, sin-datos, verificar imagen, corrección
  OCR, rotación, restaurar con-texto y consolidar.
- **Corrección:** primitiva única `mutar_documento(mutacion,
  expected_revision, *, permitir_ausente)` en `dashboard/backend/app.py`:
  lock `RLock` → lectura FRESCA de disco (`_leer_documento_disco`) → CAS
  (`_verificar_expected_revision`) → callback que re-localiza su objetivo en
  el documento fresco y aplica sólo su patch → defensa de monotonía (ninguna
  callback puede bajar `revision_documento`) → `_commit_documento`
  (`escribir_json_seguro(lanzar=True)`: nunca se devuelve éxito con guardado
  fallido) → invalidación de caché. Los 7 writers migrados; cero
  `_guardar_json_atomico(RUTA_VALIDACION…)` directos (guard estático en
  prueba). La migración de consensos y los endpoints R15 ya usaban el lock;
  ahora TODA escritura del documento pasa por la primitiva.
- **Detalles de paridad preservados:** `restaurar_imagen_con_texto` conserva
  la garantía V15.9.3 (DELETE sqlite preparado en transacción abierta;
  `con.commit()` sólo tras commit JSON exitoso; rollback en cualquier fallo);
  `guardar_rotacion` registra las evidencias del gestor tras el commit con el
  delta del documento fresco; `consolidar_resultados` fusiona sobre documento
  fresco y preserva la revisión previa (no reinicia el contador);
  `corregir_lectura` aborta sin commit si el campo destino es inválido (400).
- **Verificación:** `pruebas/test_v15_10_1_r15_1_documento_global.py` (9
  pruebas): escritura legacy lenta vs commit de video, sin-datos concurrente,
  consolidación con caché vieja válida, 3 mutaciones heterogéneas
  concurrentes (campo + imagen + video) con 0 pérdidas, monotonía, CAS
  estricto y guard estático. RED: 7 failed/2 passed → GREEN: 9/9.

## ALTO-02 — `expected_revision=None` bypasea el CAS

- **Corrección:** `_verificar_expected_revision(..., estricto=True)` en los 7
  call sites de video (revisar, confirmar, máximo, refinar, zona
  aprendizaje, zona revertir): documento YA versionado (rev > 0) rechaza con
  409 «recarga la pantalla» las peticiones sin `expected_revision`.
  Documentos legacy sin versionar aceptan la primera mutación, que los
  versiona (migración natural). Además `expected_revision: int | None =
  Field(default=None, ge=0)` en los 6 modelos legacy (campo manual,
  consolidación, corrección OCR, rotación, sin-datos, verificar).
- **Verificación:** prueba 7 del archivo anterior (409 con documento
  versionado, aceptación con documento legacy).

## ALTO-03 — Preflight del instalador fail-open con Python global + `.bat` sin `%*`

- **Causa raíz:** el fallback `Get-Process` contaba rutas «inspeccionadas»:
  ver `C:\Python311\python.exe` (ejecutando V-Matrix) marcaba
  `$verificado=$true` sin poder ver la línea de comando.
- **Corrección (`INSTALAR_R15_1.ps1`):** fail-closed — 0 intérpretes
  `python/pythonw/uvicorn/node` ⇒ seguro (V-Matrix no corre); ≥1 candidato ⇒
  NO VERIFICADO (aborto salvo `-Force`) porque `Get-Process` no expone la
  línea de comando y no puede demostrarse que sea ajeno. Los procesos cuyo
  ejecutable está bajo `$Target` siguen abortando directamente.
  `INSTALAR_R15_1.bat` reenvía argumentos con `%*`.
- **Verificación:** `pruebas/test_v15_10_1_r15_4_instalador_base.py`
  (estática de código fuente; sin pwsh en CI — ejecución Windows real queda
  como validación de campo, igual que R14/R15).

## ALTO-04 — Instalador no verifica que la base sea R14

- **Corrección:** `Assert-BaseConocida` antes de leer manifiesto y antes de
  cualquier copia: acepta sólo `VERSION.txt` ∈ {`15.10.1-r14`,
  `15.10.1-r15`, `15.10.1-r15.1`} o marker
  `PATCH_INSTALLED_V15_10_1_R14/R15/R15_1.json`. Cualquier otra carpeta
  (V15.9.x sin R14, otro proyecto, ruta equivocada) ⇒ throw sin modificar
  nada. Base declarada: V15.9.10 + INSTALAR_R14 (el paquete R15.1 es
  acumulativo desde R14, como R15).
- **Verificación:** misma prueba estática (función + orden de llamada antes
  de `Read-Manifest` y de la primera copia).

## ALTO-05 — `VERSION.txt` queda en r14 tras instalar

- **Corrección:** `VERSION.txt` = `15.10.1-r15.1` en el árbol, INCLUIDO en
  `MANIFEST_SHA256_R15_1.txt` (se copia y verifica hash en destino) y
  postflight explícito de contenido junto a `index.html`
  (`15.10.1-r15.1` ×5) y `PATCH_BUILD`. Las cuatro fuentes de identidad
  (VERSION.txt, backend, frontend, marker) reportan la misma versión;
  `utilidades/benchmark_detector.py` (que lee VERSION.txt) ya no puede
  etiquetar como r14/r15.
- **Verificación:** `test_v15_10_1_r15_4_instalador_base.py` (identidad
  coherente + postflight) y `test_v15_10_1_r14_auditoria_preventiva.py`
  actualizada (SUPERSEDE documentado).

## ALTO-06 — Tmax 0 ms «confirmado» con evento al inicio

- **Reproducción del auditor:** `[100,100,100,100,100]`,
  `[100,99,100,100,100]`, `[100,100,99,100,99]` con breakout frame 0 ⇒
  `maximo_inflado_estimado`, duración 0.0 ms, CERO anomalías.
- **Corrección (`utilidades/estandar_apertura.py`):** censura explícita —
  `frame_breakout == 0` ⇒ anomalía `evento_censurado_al_inicio` y confianza
  −0.20; si además el máximo cae en el frame 0 (duración 0) ⇒
  `sin_maximo_defendible` + `sin_evidencia_previa_del_crecimiento` (nunca
  estimado con 0 ms); si hay crecimiento observado pero el frame 0 ya ocupa
  > 50 % del área pico ⇒ el estimado se degrada a
  `maximo_visible_observado_no_confirmado` (la duración es cota inferior: el
  despliegue pudo empezar antes de la grabación). Guarda de sobre-corrección:
  crecimiento pleno observado desde frame 0 pequeño (p. ej.
  `[10,60,100,95,40,10]`) mantiene `maximo_inflado_estimado`.
- **Verificación:** `pruebas/test_v15_10_1_r15_2_maximo_censurado.py` (11) —
  las 3 reproducciones del auditor, degradación, guardas y regresiones R13/R15
  intactas.

## MEDIO-07 — Carrera de pantalla no cerrada del todo

- **Causa raíz:** al montar, `refrescar()`/`refrescarReanalisisVideos()`
  (sin guarda) corrían en paralelo al primer ciclo del sondeo serial; en
  `VistaTabla`, `useApi(rutaFilas)` + sondeo. Respuesta inicial vieja podía
  sobrescribir el poll nuevo.
- **Corrección (`dashboard/frontend/app.js`):** fuente única por recurso — el
  sondeo serial ejecuta TAMBIÉN la primera consulta (`iniciar()` dispara la
  tarea de inmediato) y se eliminan las peticiones iniciales paralelas; las
  guardas de secuencia son únicas por recurso (refs) y compartidas entre
  refrescos manuales y sondeo, de modo que toda escritura de estado pasa por
  la misma guarda. `VistaTabla` sin `useApi` inicial: sondeo con guarda +
  gestión de error/carga.
- **Verificación:** `pruebas/test_v15_10_1_r15_3_carrera_ui.cjs` — parte
  conductual (respuesta inicial lenta a 80 ms NO sobrescribe el poll a
  10 ms con guarda compartida) + cableado en fuente.

## MEDIO-08 — Rollback no transaccional para documentos reubicados

- **Corrección (`Relocate-LegacyRootDocs` + `Rollback-Transaction`):** toda
  mutación se registra ANTES de ejecutarse: el dedup de `README_R14.md` de
  raíz hace backup en `_ROOT_DOCS` + `RootDocsMoved` antes del `Remove-Item`
  (rollback lo restaura); cada copia creada en
  `docs\historial\parches\acumulados` se registra en `$RelocatedDests` con su
  destino previo (`.dest_previo`) si existía — el rollback retira las creadas
  y restaura las sobreescritas.
- **Verificación:** `test_v15_10_1_r15_4_instalador_base.py` (registro antes
  de eliminación + rollback consume `$RelocatedDests`).

## MEDIO-09 — Estado «no confirmado» de Tmax se degrada al agregarse/exportarse

- **Corrección:** `utilidades/resultado_caso.py` etiqueta cada evidencia por
  video (`estado_secuencia`) y separa agregados: la mediana confirmada
  (`tiempo_max_inflado_estimado_ms`) sólo usa `estado ==
  maximo_inflado_estimado`; los no confirmados viajan en
  `tiempo_max_inflado_no_confirmado_ms` con soporte propio;
  `max_inflado_estado` publica el estado del caso
  (confirmado > no confirmado > sin máximo defendible > None); la censura
  0 ms se recoge como evidencia etiquetada pero no alimenta métricas.
  `matriz_apertura.py` propaga estado y tiempo no confirmado a la celda.
  Excel (`reporte_bmg.py`): columnas NUEVAS al final — «Estado máximo
  inflado» (etiqueta es/en/de, «NO CONFIRMADO (máximo visible observado)») y
  «Máximo visible NO CONFIRMADO ms» — sin mover las posiciones legacy 1–23.
  UI (`app.js` + `i18n.js`): badge «NO CONFIRMADO» por video
  (`estado_max_inflado`, expuesto por `video_airbag.py`) y por caso
  (`max_inflado_estado`); «Sin anomalías automáticas» sólo con máximo
  confirmado.
- **Verificación:** `test_v15_10_1_r15_2_maximo_censurado.py` (casos
  agregados + Excel real con openpyxl) y
  `test_v15_10_1_r15_2_ui_maximo_no_confirmado.cjs`. Fixtures R13 actualizadas
  (SUPERSEDE documentado: la mediana confirmada exige `estado` explícito).

## BAJO-10 — README raíz declaraba V15.8.1

- **Corrección:** bloque de versión reescrito (V15.10.1 · R15.1 · 2026-10-15),
  instalación vigente `INSTALAR_R15_1`, enlace a este changelog/informe.
- **Verificación:** `test_documentacion_organizada.py` (enlaces locales
  resuelven).

## BAJO-11 — Prueba de concurrencia no hermética

- **Causa raíz:** la fixture copiaba el estado global del backend; en
  instalación usada, `_recuperar_checkpoint_pipeline()` deja
  `estado="completado"` y el rollback del fallo `Thread.start()` restauraba
  «completado» contra un assert literal «inactivo».
- **Corrección:** la fixture fija un estado inicial SEGURO conocido
  (`inactivo`, sin `ejecucion_id`) conservando la estructura de claves —
  independiente del checkpoint previo. Complemento Fase 5.3: la suite se
  repite sobre una instalación USADA simulada (checkpoint `completado`
  sembrado) además del árbol limpio.
- **Verificación:** `test_v15_10_1_r15_concurrencia.py` + simulación de
  instalación usada (registro en `evidencia/ejecucion/`).

---

## Resultado global

- Suite Python: **887 passed / 0 failed** (árbol de desarrollo, Python 3.13).
- Suite Node: **36/36** (`.cjs`).
- Simulación de instalación R14 → R15.1 (árbol limpio + árbol usado): ver
  `evidencia/ejecucion/GREEN_R15_1_FASE5_empaquetado.txt`.
- Pendiente de campo (sin entorno Windows/pwsh/GPU/AVI reales en CI):
  ejecución real del instalador con fallo inducido y rollback verificado,
  navegador real para MEDIO-07, y precisión temporal con AVI de producción.
