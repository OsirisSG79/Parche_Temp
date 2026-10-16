# CHANGELOG — V-Matrix V15.10.1 R15.2

- **Versión:** 15.10.1-r15.2 (`PATCH_BUILD` en `dashboard/backend/app.py`; caché frontend `?v=15.10.1-r15.2`; `VERSION.txt`; marker `PATCH_INSTALLED_V15_10_1_R15_2.json` — las cuatro fuentes reportan la MISMA versión)
- **Fecha:** 2026-10-15
- **Base:** V15.10.1 R15.1 sobre R15 sobre R14 sobre V15.9.10 (N17 aceptado). Acumulativo: `INSTALAR_R15_2` acepta bases `15.10.1-r14`, `15.10.1-r15`, `15.10.1-r15.1` y `15.10.1-r15.2` (VERSION.txt o marker **validado por contenido**) y aborta sobre cualquier otra carpeta ANTES de modificar nada.
- **Origen:** `AUDITORIA_INDEPENDIENTE_R15_1_20261015.md` — veredicto «no liberar R15.1; publicar R15.2 sin funciones nuevas»; 6 hallazgos (2 críticos, 2 altos, 1 medio, 1 medio/bajo). R15.2 cierra los 6 en código; el criterio 11 (instalador en Windows real) queda pendiente de campo, igual que en R15.1.
- **Suite final:** 935 passed / 0 failed (Python, árbol dev completo) · 37/37 verdes (Node `.cjs`) · simulaciones A (limpia) y B (usada): ver `evidencia/ejecucion/`.
- **Filosofía intacta:** no inventar certeza; la intervención humana es la excepción, no el flujo; nunca pérdida silenciosa (preservación por merge/versionado O rechazo explícito antes de efectos); R16 (trigger eléctrico, volumen/presión) fuera de alcance.

## Hallazgos cerrados

| # | Hallazgo | Corrección | Pruebas |
|---|---|---|---|
| CRÍTICO-01 | `_migrar_consensos_video` escribía el snapshot VIEJO bajo lock: leía antes del lock (vía `_cargar_datos`), mutaba fuera y escribía el documento completo — perdía commits concurrentes sin retroceder la revisión | La migración persiste vía la primitiva compartida con un patch POR FILA (`_migrar_fila_consensos`, idempotente) re-aplicado sobre el documento FRESCO leído dentro del lock; si el fresco ya está migrado por una ejecución concurrente devuelve `SIN_CAMBIOS` y no commitea. El stub que cegaba la prueba R15.1 fue retirado | `test_v15_10_1_r152_documento_unico.py` (carrera real con pausa dentro de la migración + commit concurrente: ambos cambios sobreviven, revisión monótona) |
| CRÍTICO-02 | `pipeline.py::_persistir_validacion` y 4 writers de `validacion.py` escribían el documento completo SIN lock, SIN CAS y SIN `revision_documento` (la revisión llegaba a DESAPARECER) | Autoridad ÚNICA de escritura: `utilidades/persistencia_documento.py` (lock por ruta → leer fresco → validar revisión → reemplazar/patch → revisión monotónica → escritura atómica verificada). Backend delega (envoltorios HTTP idénticos en mensajes), pipeline y validación usan `persistir_documento_completo` (carry-forward `max(rev_disco, rev_doc)`; documento corrupto en disco = fail-closed, no se sobrescribe). Guard estático: ninguna escritura directa fuera del módulo | Ídem (autoridad compartida + pipeline preserva revisión + pipeline bajo lock compartido + guard estático) |
| P0 temporal (parte de CRÍTICO-02) | Ediciones de UI y pipeline/reproceso podían correr a la vez sobre el documento | `_assert_documento_editable()`: 409 «Termina o detén el procesamiento antes de …» en las mutaciones de UI mientras el worker vive o su slot está reservado (lecturas permitidas). Colocado ANTES de cualquier lookup/efecto en campo manual, consolidar, OCR, rotación (carpeta), sin-datos (carpeta) y verificar; video/con-texto/zona ya tenían guard propio. `confirmar_maximo_video` alineado con `_slot_pipeline_ocupado_locked` | Ídem (11 endpoints × 409 con hilo vivo fake) |
| ALTO-03 | Tmax «confirmado» con 0 ms cuando el breakout ≠ frame 0: señal plana ⇒ meseta en índice 0 ⇒ `frame_max == frame_breakout` ⇒ `maximo_inflado_estimado` con duración 0 (repro del auditor: 100 frames planos, breakout 1/5/20) | Invariante física GLOBAL en `estandar_apertura.py`: `maximo_inflado_estimado ⇒ frame_max > frame_breakout ∧ duracion_expansion_ms > 0`. Señal plana/casi plana ⇒ `sin_maximo_defendible` + anomalías `maximo_coincide_con_breakout` y `sin_evidencia_de_expansion`; expansión en frames sin fps (duración no cuantificable) ⇒ `maximo_visible_observado_no_confirmado` + `sin_evidencia_de_expansion`. Las reglas R15.1 de frame 0 se conservan | `test_v15_10_1_r152_tmax_invariante.py` (8: breakout 1/5/20, casi plana, cerca del final, expansión real confirmada, sin fps, fuzz ×300 con invariante global) + batería video/apertura 211 verdes |
| ALTO-04 | CAS estricto no conectado a las 7 mutaciones UI legacy; la UI no enviaba `expected_revision`; efectos laterales (registro sqlite) antes de CAS en sin-datos y OCR | Backend: `estricto=True` en los 7 call sites; `_prechequeo_cas_documento()` ANTES de registrar evidencias en OCR y sin-datos; `/api/pruebas` expone `revision_documento`. Frontend: las 5 mutaciones de VistaDetalle envían `expected_revision: detalle?.revision_documento ?? null` (el detalle se recarga tras cada respuesta) y, ante 409, `refrescarTrasConflicto` recarga SIN descartar el borrador | `test_v15_10_1_r152_cas_ui.py` (21: 6 endpoints × 409 sin expected, 7 × 409 desfasado, éxitos con revisión correcta, sin-datos/OCR rechazados NO registran evidencia, con-texto rechazado conserva la marca, /api/pruebas expone revisión) |
| MEDIO-05 | `<strong>NO CONFIRMADO</strong>` como cadena interpolada en htm: React la renderizaba como TEXTO literal (defecto real de la Fase 2 de R15.1) | Helper `maximoNoConfirmadoBadge()` construye la insignia con `html`` anidado (elemento real); los 2 sitios rotos lo usan | `test_v15_10_1_r152_ui_cas_y_badges.cjs` (RENDER real con el vendor React+htm: textContent sin `<`/`>`, nodo `<strong>` de verdad, null para confirmado) |
| MEDIO/BAJO-06 | Instalador: marker de base aceptado por mera EXISTENCIA (uno vacío/corrupto colaba); la reinstalación sobrescribía el marker propio sin respaldo y el rollback lo eliminaba a ciegas | `Assert-BaseConocida` valida CONTENIDO (`ConvertFrom-Json` → `patch_build` ∈ bases aceptadas); el marker previo se respalda (`_MARKER_PREVIO.json` en el backup) ANTES de sobrescribirlo y el rollback lo RESTAURA (sólo elimina el marker cuando el run lo creó desde cero) | `test_v15_10_1_r15_4_instalador_base.py` (3 pruebas nuevas + identidad r15.2) — estáticas; ejecución Windows real pendiente de campo (criterio 11) |

## Fases y commits

| Fase | Contenido | Commit(s) |
|---|---|---|
| P0 | CRÍTICO-01 + CRÍTICO-02: `utilidades/persistencia_documento.py`, delegación del backend, migración por fila sobre fresco, pipeline/validación por la primitiva, `_assert_documento_editable` | RED+GREEN `a21f42e` |
| F3 | ALTO-03: invariante física global de Tmax | `7211c0c` |
| F4+F5 | ALTO-04 (CAS estricto UI backend+frontend, efectos tras CAS, `/api/pruebas` con revisión) + MEDIO-05 (badge real) | `050a71c` |
| F6 | MEDIO/BAJO-06: instalador `INSTALAR_R15_2` + identidad 15.10.1-r15.2 | `fc62307` |
| F7 | Docs (este changelog, informe por hallazgo, matriz de evidencia, README) + empaquetado y simulaciones | este commit |

## Cambios de contrato documentados (SUPERSEDE)

1. **Autoridad única de escritura:** toda escritura de `validacion_resultados.json` pasa por `utilidades/persistencia_documento.py`. Tests que inyectaban fallos de escritura parcheando `backend.escribir_json_seguro` se re-dirigen al módulo compartido (`test_v15_9_4_auditoria_regresiones.py`, `test_v15_9_4_ampliacion.py::test_n5…`, `test_v15_9_2_correcciones_c1_c7.py::test_c4…`, `test_restaurar_texto_unittest.py`). El lock del harness pasa de `backend._datos_mutacion_lock` a `backend._lock_documento()`.
2. **CAS estricto en mutaciones humanas:** documento ya versionado (rev > 0) + `expected_revision` ausente ⇒ 409 en las 7 mutaciones UI (antes sólo video). Las 4 pruebas de concurrencia R15.1 que asumían fusión silenciosa de escrituras sin `expected_revision` verifican ahora el rechazo explícito o el reintento con revisión vigente (criterio del auditor: 0 pérdida O rechazo explícito previo).
3. **Efectos laterales después de CAS:** OCR y sin-datos validan el CAS contra disco ANTES de registrar en la base de aprendizaje; con-texto conserva su transacción con rollback (V15.9.3).
4. **Pipeline/validación:** los persistidores heredan la revisión del disco (`max(rev_disco, rev_doc)`) y la escritura falla cerrada si el documento en disco está corrupto (advertencia en `advertencias_persistencia`, archivo anterior intacto) — antes lo sobrescribían.
5. **Tmax:** `maximo_inflado_estimado` exige evidencia de expansión posterior al breakout (frames Y milisegundos). Nuevas anomalías `maximo_coincide_con_breakout` y `sin_evidencia_de_expansion`.
6. **Instalador:** `INSTALAR_R15_1.*` → `INSTALAR_R15_2.*`; identidad manifiesto/marker/backup r15.1 → r15.2; `test_v15_10_1_r15_instalador.py`, `test_v15_10_1_r15_4_instalador_base.py` y `test_v15_10_1_r14_auditoria_preventiva.py` siguen el release.
7. **`/api/pruebas`** añade `revision_documento` a su respuesta (la UI lo reenvía en cada mutación).

## Limitaciones conocidas

- **Sin pwsh en CI/sandbox:** las pruebas del instalador son estáticas (código fuente), mismo criterio que R14/R15/R15.1. La ejecución real en Windows con fallo CIM inducido, `-Force` y rollback (criterio 11 del auditor) queda como validación de campo pendiente, igual que AVI reales, GPU Windows y navegador real (el render de la insignia se prueba a nivel de elemento con el vendor; el pintado final en navegador sigue siendo de campo).
- **Lock de proceso único:** la autoridad compartida serializa escritores DENTRO del proceso. Un segundo proceso escribiendo el mismo JSON sigue fuera del contrato; el instalador exige V-Matrix cerrado precisamente por esto.
- **Guard de pipeline (P0 temporal):** bloquea TODA edición de UI durante el procesamiento, aunque la edición no compita por el mismo recurso. Es el rechazo explícito que exige el auditor hasta que exista un merge fino por recurso (mejora futura, fuera de R15.2: sin funciones nuevas).
- **Documento corrupto en disco:** el pipeline ya no lo sobrescribe (fail-closed); requiere intervención explícita. La carga del backend responde 503 como antes.

## Criterios de aceptación R15.2 del auditor — estado

| # | Criterio | Estado |
|---|---|---|
| 1 | Migración + edición simultánea: 0 pérdida | CERRADO (carrera real con pausa dentro de la migración) |
| 2 | Pipeline + edición: 0 pérdida o rechazo explícito previo | CERRADO (rechazo 409 antes de efectos + writers por lock compartido) |
| 3 | `revision_documento` nunca desaparece ni retrocede | CERRADO (carry-forward en reemplazos completos + monotonía en la primitiva) |
| 4 | Todas las escrituras por única primitiva compartida | CERRADO (módulo + guard estático que falla si reaparece una escritura directa) |
| 5 | Toda mutación UI versionada lleva `expected_revision` | CERRADO (backend estricto + frontend lo envía y lo actualiza) |
| 6 | Pestaña desactualizada recibe 409 antes de sobrescribir | CERRADO (409 + refresco; efectos laterales sólo tras CAS) |
| 7 | `maximo_inflado_estimado ⇒ frame_max > frame_breakout ∧ duracion_expansion_ms > 0` | CERRADO (invariante global + fuzz ×300) |
| 8 | Frontend sin etiquetas HTML literales | CERRADO (render real del vendor; navegador real pendiente de campo) |
| 9 | Suite Python completa verde | CERRADO (935/0 dev; sims A/B) |
| 10 | Suite Node completa verde | CERRADO (37/37) |
| 11 | Instalador probado en Windows real (fallo CIM, `-Force`, rollback) | PENDIENTE DE CAMPO (imposible en sandbox; código + pruebas estáticas listas) |
