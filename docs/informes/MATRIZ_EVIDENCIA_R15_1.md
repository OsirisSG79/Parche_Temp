# MATRIZ DE EVIDENCIA — R15.1 (auditoría independiente R15)

Trazabilidad hallazgo → prueba → evidencia cruda. Metodología RED-first: cada
corrección se reproduce en ROJO antes del fix (archivos `RED_*`) y se verifica
en VERDE (`GREEN_*`) con suite completa. Ejecutadas en el sandbox de
desarrollo (Linux, Python 3.13.16, pytest 9.0.3, Node 20.20.2) el 2026-10-15.

| Hallazgo | Prueba(s) | RED | GREEN | Resultado |
|---|---|---|---|---|
| CRÍTICO-01 + ALTO-02 | `pruebas/test_v15_10_1_r15_1_documento_global.py` (9) | `ejecucion/RED_R15_1_FASE1_documento_global.txt` (7 failed/2 passed) | `ejecucion/GREEN_R15_1_FASE1_documento_global.txt` (9/9 + guard estático 0 writers directos + suite 869) | CERRADO |
| ALTO-06 + MEDIO-09 | `pruebas/test_v15_10_1_r15_2_maximo_censurado.py` (11) + `test_v15_10_1_r15_2_ui_maximo_no_confirmado.cjs` | `ejecucion/RED_R15_1_FASE2_maximo_censurado.txt` (10 failed/1 passed + node rojo) | `ejecucion/GREEN_R15_1_FASES2_3_maximo_censurado_carrera_ui.txt` (26/26 con regresiones R13/R15 + node 36/36 + suite 880) | CERRADO |
| MEDIO-07 | `pruebas/test_v15_10_1_r15_3_carrera_ui.cjs` | mismo archivo RED Fase 2 (node rojo: sin guarda compartida) | mismo archivo GREEN Fases 2+3 (conductual: inicial lenta no sobrescribe poll) | CERRADO |
| ALTO-03 + ALTO-04 + ALTO-05 + MEDIO-08 | `pruebas/test_v15_10_1_r15_4_instalador_base.py` (7) | ROJO implícito: 7/7 failed sobre `INSTALAR_R15_1.*` recién renombrado (contenido R15) — salida en el log de commit `67e47ce` | suite tras Fase 4: 887 passed / 0 failed (`ejecucion/GREEN_R15_1_FASE5_empaquetado.txt` incluye recorte) | CERRADO (estático; ejecución Windows = campo) |
| BAJO-10 | `pruebas/test_documentacion_organizada.py` (enlaces) | n/a (documentación) | suite 887 | CERRADO |
| BAJO-11 | `pruebas/test_v15_10_1_r15_concurrencia.py::test_fallo_thread_start_deja_estado_seguro_y_slot_libre` | n/a (falso rojo sólo en instalación usada) | suite 887 + simulación de instalación USADA con checkpoint `completado` sembrado | CERRADO |

## Suite completa

| Corrida | Árbol | Resultado |
|---|---|---|
| Tras Fase 1 | desarrollo (`5d58657`) | 869 passed / 0 failed |
| Tras Fases 2+3 | desarrollo (`6356ef4`) | 880 passed / 0 failed · node 36/36 |
| Tras Fase 4 | desarrollo (`67e47ce`) | 887 passed / 0 failed |
| Empaquetado | desarrollo (`d67a499` + docs) | ver `GREEN_R15_1_FASE5_empaquetado.txt` |
| Simulación limpia | base R14 (`69b1900`) + payload manifiesto | ver `GREEN_R15_1_FASE5_empaquetado.txt` |
| Simulación usada | ídem + `.cache_ocr/estado_pipeline.json` (`completado`) + `validacion_resultados.json` versionado | ver `GREEN_R15_1_FASE5_empaquetado.txt` |

## Identidad de versión (ALTO-05)

| Fuente | Valor |
|---|---|
| `VERSION.txt` | `15.10.1-r15.1` |
| `dashboard/backend/app.py` (`PATCH_BUILD` / FastAPI version) | `15.10.1-r15.1` |
| `dashboard/frontend/index.html` (cache busting ×5) | `?v=15.10.1-r15.1` |
| Marker instalador | `PATCH_INSTALLED_V15_10_1_R15_1.json` (`patch_build=15.10.1-r15.1`) |
| Manifiesto | `MANIFEST_SHA256_R15_1.txt` (incluye `VERSION.txt`) |

## Cambios de contrato (SUPERSEDE documentado)

Ver sección «Cambios de contrato documentados» en `CHANGELOG_R15_1.md`:
CAS estricto (409 sin `expected_revision` sobre documento versionado),
`revision_documento` en respuestas legacy, fin del 500 genérico en
`corregir_lectura`, evidencias de rotación post-commit, mediana confirmada de
Tmax sólo con `estado` explícito, fixtures R13 con `estado`, instalador
renombrado `INSTALAR_R15_1.*`.

## Pendiente de validación de campo (fuera de alcance del sandbox)

1. Ejecución real del instalador en Windows con fallo inducido (rollback
   verificado en disco, criterio del auditor).
2. Navegador real para la carrera de pantalla (MEDIO-07) y el badge
   «NO CONFIRMADO».
3. AVI reales + GPU Windows para precisión temporal (doctrina N17: no
   declarar producción ni precisión 0.1 ms sin pruebas de campo).
