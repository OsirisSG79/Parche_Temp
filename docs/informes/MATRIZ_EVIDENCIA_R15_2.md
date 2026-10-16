# MATRIZ DE EVIDENCIA — R15.2 (auditoría independiente R15.1)

Trazabilidad hallazgo → prueba → evidencia cruda. Metodología RED-first: cada
corrección se reproduce en ROJO antes del fix (archivos `RED_*`) y se verifica
en VERDE (`GREEN_*`) con suite completa. Ejecutadas en el sandbox de
desarrollo (Linux, Python 3.13.16, pytest 9.0.3, Node 20.20.2) el 2026-10-15.
Commits: P0 `a21f42e` · F3 `7211c0c` · F4+F5 `050a71c` · F6 `fc62307` · F7
(docs+empaquetado) este commit. Base auditada: `17f830d` (R15.1).

| Hallazgo | Prueba(s) | RED | GREEN | Resultado |
|---|---|---|---|---|
| CRÍTICO-01 + CRÍTICO-02 (+P0 pipeline/UI) | `pruebas/test_v15_10_1_r152_documento_unico.py` (16) | `ejecucion/RED_R15_2_P0_documento_unico.txt` (11 failed/14 passed sobre `17f830d`, stub de migración retirado) | `ejecucion/GREEN_R15_2_P0_documento_unico.txt` (suite dev 903/0 tras P0) | CERRADO |
| ALTO-03 | `pruebas/test_v15_10_1_r152_tmax_invariante.py` (8, incluye fuzz ×300) | `ejecucion/RED_R15_2_F3_tmax_invariante.txt` (7 failed/1 passed) | `ejecucion/GREEN_R15_2_F3_tmax_invariante.txt` (8/8 + batería video/apertura 211) | CERRADO |
| ALTO-04 (backend) | `pruebas/test_v15_10_1_r152_cas_ui.py` (21) | `ejecucion/RED_R15_2_F4_cas_ui.txt` (10 failed/11 passed) | `ejecucion/GREEN_R15_2_F4_F5_cas_ui_badges.txt` (21/21 + r15_1 9/9 + restaurar 3/3) | CERRADO |
| MEDIO-05 + ALTO-04 (frontend) | `pruebas/test_v15_10_1_r152_ui_cas_y_badges.cjs` (render real del vendor) | `ejecucion/RED_R15_2_F5_badge_literal.txt` (helper inexistente; cadena con etiquetas en 2 sitios) | `ejecucion/GREEN_R15_2_F4_F5_cas_ui_badges.txt` (OK + loop node 37/37) | CERRADO (navegador real = campo) |
| MEDIO/BAJO-06 | `pruebas/test_v15_10_1_r15_4_instalador_base.py` (10, 3 nuevas) + `test_v15_10_1_r15_instalador.py` + `test_v15_10_1_r14_auditoria_preventiva.py` | `ejecucion/RED_R15_2_F6_instalador.txt` (2 failed + 15 skipped pre-rename; defectos citados del fuente R15.1) | `ejecucion/GREEN_R15_2_F6_instalador.txt` (22/22) | CERRADO (estático; Windows real = criterio 11, campo) |
| Regresión global | suite completa `pruebas/` | — | `ejecucion/GREEN_R15_2_F7_suite_completa.txt` (935/0 + node 37/37) y `ejecucion/GREEN_R15_2_F7_empaquetado.txt` (build, verificación interna, simulaciones A/B) | VERDE |

## Criterios de aceptación R15.2 del auditor

| # | Criterio | Evidencia | Estado |
|---|---|---|---|
| 1 | Migración + edición simultánea: 0 pérdida | `test_migracion_consensos_no_pierde_commit_concurrente` (carrera real con pausa dentro de la migración) | CERRADO |
| 2 | Pipeline + edición: 0 pérdida o rechazo explícito previo | `test_mutaciones_rechazadas_durante_pipeline` (11 endpoints × 409) + `test_pipeline_escribe_bajo_lock_compartido` + `test_pipeline_preserva_revision_documento` | CERRADO |
| 3 | `revision_documento` nunca desaparece ni retrocede | carry-forward `max(rev_disco, rev_doc)` en `persistir_documento_completo` + monotonía en la primitiva + tests P0 | CERRADO |
| 4 | Todas las escrituras por única primitiva compartida | `utilidades/persistencia_documento.py` + `test_guard_estatico_escritura_unica_del_documento` | CERRADO |
| 5 | Toda mutación UI versionada lleva `expected_revision` | `test_v15_10_1_r152_cas_ui.py` + `test_v15_10_1_r152_ui_cas_y_badges.cjs` (cableado en VistaDetalle) | CERRADO |
| 6 | Pestaña desactualizada recibe 409 antes de sobrescribir | 6×409 sin expected + 7×409 desfasado + efectos laterales tras CAS (`test_sin_datos_rechazado_no_registra_evidencia`, `test_ocr_rechazado_no_registra_correccion`) | CERRADO |
| 7 | `maximo_inflado_estimado ⇒ frame_max > frame_breakout ∧ dur > 0` | `test_v15_10_1_r152_tmax_invariante.py` (incluye fuzz ×300) | CERRADO |
| 8 | Frontend sin etiquetas HTML literales | render real del vendor (textContent sin `<`/`>`, `<strong>` de verdad) | CERRADO en código; navegador real pendiente de campo |
| 9 | Suite Python completa verde | 935 passed / 0 failed (dev) + simulaciones A/B del paquete | CERRADO |
| 10 | Suite Node completa verde | 37/37 `.cjs` | CERRADO |
| 11 | Instalador en Windows real (fallo CIM, `-Force`, rollback) | imposible en sandbox (sin pwsh/Windows); código + pruebas estáticas listas | PENDIENTE DE CAMPO (documentado, igual que R15.1) |

## Suite completa

| Corrida | Árbol | Resultado |
|---|---|---|
| Tras P0 | desarrollo (`a21f42e`) | 903 passed / 0 failed |
| Tras F3 | desarrollo (`7211c0c`) | batería video/apertura 211 + tmax 8/8 |
| Tras F4+F5 | desarrollo (`050a71c`) | 932 passed / 0 failed · node 37/37 |
| Tras F6 | desarrollo (`fc62307`) | 935 passed / 0 failed · node 37/37 (`GREEN_R15_2_F7_suite_completa.txt`) |
| Simulación A (limpia) | checkout del payload del ZIP | ver `GREEN_R15_2_F7_empaquetado.txt` |
| Simulación B (usada) | ídem + checkpoint `completado` + documento rev 7 sembrados | ver `GREEN_R15_2_F7_empaquetado.txt` |

## Identidad de versión (coherencia exigida por el auditor)

| Fuente | Valor |
|---|---|
| `VERSION.txt` | `15.10.1-r15.2` |
| `dashboard/backend/app.py` (`PATCH_BUILD` + FastAPI version) | `15.10.1-r15.2` |
| `dashboard/frontend/index.html` (5 assets `?v=`) | `15.10.1-r15.2` |
| `INSTALAR_R15_2.ps1` (`$PatchBuild`, marker, manifiesto, backups) | `15.10.1-r15.2` / `PATCH_INSTALLED_V15_10_1_R15_2.json` / `MANIFEST_SHA256_R15_2.txt` / `_BACKUP_PRE_R15_2_` |

## Volteos de pruebas documentados (SUPERSEDE — no «verdear» ediciones viejas)

| Archivo | Cambio | Motivo |
|---|---|---|
| `test_v15_10_1_r15_1_documento_global.py` | stub de migración RETIRADO; 4 pruebas de concurrencia legacy esperan ahora 409/reintento; harness usa `_lock_documento()` | CRÍTICO-01 (punto ciego) + contrato CAS estricto (ALTO-04) |
| `test_v15_9_4_auditoria_regresiones.py`, `test_v15_9_4_ampliacion.py`, `test_v15_9_2_correcciones_c1_c7.py`, `test_restaurar_texto_unittest.py` | writer parcheable re-dirigido a `utilidades.persistencia_documento`; `llamar()` envía revisión vigente | CRÍTICO-02 (la escritura vive en la autoridad compartida) + ALTO-04 |
| `test_reconfirmacion_simbolos_unittest.py`, `test_reconfirmacion_unittest.py`, `test_sobrescritura_publica_unittest.py` | env AST añade `_assert_documento_editable` stub / `_pdoc` real | P0 temporal (guard de pipeline) — probado por separado en r152 |
| `test_v15_10_1_r15_instalador.py`, `test_v15_10_1_r15_4_instalador_base.py`, `test_v15_10_1_r14_auditoria_preventiva.py` | pins de identidad r15.1 → r15.2 | MEDIO/BAJO-06 (release nuevo) |
