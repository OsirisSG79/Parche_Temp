# Matriz de evidencia — V-Matrix V15.10.1 R15

Ejecutado en el árbol completo exacto `/home/user/r15-repo`, rama
`codex/ocr-v15-10-1-r15`, HEAD `b8c8bca`.

Comando Python: `PYTHONPATH=. python -m pytest pruebas/ -q`
Comando Node: `for f in pruebas/*.cjs; do node "$f"; done`

| Suite | Base R14 (Fase 0) | Final R15 (Fase 8b) |
|---|---|---|
| Python | 792 passed / 14 failed / 1 skipped | **860 passed / 0 failed / 0 skipped** |
| Node (`.cjs`) | 33/34 (`test_editor_zonas.cjs` fallaba en la propia base) | **34/34** |

Los 14 fallos base: 13 eran contratos V15.9 reemplazados por doctrina R9–R13
(alineados en Fase 8a con docstring SUPERSEDE) y 1 (`test_instalador_r14`) estaba
en skip porque el instalador no existía en el árbol; el usuario lo subió a
Parche_Temp (`bd8ae8b`) y ahora pasa sin edición.

## Pruebas obligatorias de la auditoría (§6)

| # | Requisito del auditor | Prueba R15 | Estado |
|---|---|---|---|
| 1 | Dos `/api/pipeline` simultáneos → 1×202 + 1×409 + 1 worker | `r15_concurrencia::test_pipelines_simultaneos_un_solo_worker` | ✅ |
| 2 | `/api/pipeline` + `reprocesar` simultáneos → un solo worker | `r15_concurrencia::test_pipeline_y_reproceso_simultaneos_un_solo_worker` | ✅ |
| 3 | Dos reprocesos simultáneos → un solo worker | `r15_concurrencia::test_dos_reprocesos_simultaneos_un_solo_worker` | ✅ |
| 4 | Falla `Thread.start()` → estado seguro, sin checkpoint fantasma | `r15_concurrencia::test_fallo_thread_start_deja_estado_seguro_y_slot_libre` | ✅ |
| 5 | Reanálisis + corrección manual → no se pierde | `r15_revisiones::test_edicion_manual_durante_reanalisis_sobrevive` | ✅ |
| 6 | Reanálisis + revisión/ROI → 409 o merge versionado | `r15_revisiones::test_revision_bloqueada_con_reanalisis_activo` | ✅ |
| 7 | Revisión completada + pestaña vieja → 409 | `r15_revisiones::test_revision_completada_bloquea_ediciones_de_video` | ✅ |
| 8 | Pipeline activo + revisión/ROI → 409 sin efectos laterales | `r15_revisiones::test_revision_bloqueada_con_pipeline_activo` · `test_zonas_bloqueadas_con_reserva_de_pipeline` | ✅ |
| 9 | Persistencia en fallo → error, nunca éxito | `r15_persistencia::test_endpoint_revision_reporta_error_y_no_exito_si_falla_el_durable` | ✅ |
| 10 | ROI candidato→sin_evento → sin `frame_evento/tiempo_ms` viejos | `r15_estados_obsoletos::test_zona_aprendizaje_limpia_estados_obsoletos` · `test_zona_revertir_limpia_estados_obsoletos` | ✅ |
| 11 | `[1,100,100,100]` → Tmax posterior o no confirmado; fases en orden | `r15_tmax_causal::test_variante_1_99_100_mantiene_orden_de_fases` · `test_salto_inmediato_no_coloca_maximo_en_breakout` | ✅ |
| 12 | Máximo al final de clip creciente → no publicado como confirmado | `r15_tmax_causal::test_clip_creciente_hasta_el_final_no_es_maximo_confirmado` | ✅ |
| 13 | Poll A lento + poll B rápido → A no sobrescribe B | `test_v15_10_1_r15_red_segura.cjs` (guarda de secuencias) | ✅ |
| 14 | Scrubbing rápido → máx. 1 solicitud de frame activa por tarjeta | `test_v15_10_1_r15_red_segura.cjs` (AbortController) | ✅ |
| 15 | `NUL.data.xlsx`, `CON.foo.xlsx`, `COM1.log.xlsx`, espacio/punto final | `r15_entradas::test_dispositivos_reservados_con_extensiones_adicionales` · `test_espacio_final_crudo_se_rechaza` · `test_punto_final_se_rechaza` | ✅ |
| 16 | Padre que contiene V-Matrix → rechazo con mensaje específico | `r15_entradas::test_raiz_exacta_y_ancestros_del_programa_se_bloquean` · `test_mensaje_del_endpoint_cubre_ancestros` | ✅ |
| 17 | CIM falla en instalación → fallback o abortar, nunca continuar | `r15_instalador::test_preflight_procesos_falla_cerrado_si_cim_falla` | ⚠️ código fuente (sin `pwsh` en CI) |
| 18 | Detalle con `expected_revision` antigua → 409 + recarga | `r15_revisiones::test_expected_revision_antigua_devuelve_409` + `.cjs` (recarga cliente) | ✅ |

## Archivos de evidencia (directorio `r15-evidencia/`, fuera del árbol)

| Archivo | Contenido |
|---|---|
| `SHA256_R14_BASE.txt` | Huellas del overlay R14 (`8a1608e`) usado como base |
| `SUITE_R14_BASE_result.txt` | Suite Fase 0: 792/14/1 sobre la base exacta |
| `RED_R15_FASE1_sobre_R14.txt` | 9 fallos / 1 paso reproduciendo CRIT-01, ALTA-02, MEDIA-15 |
| `RED_R15_FASE2_sobre_fase1.txt` | 7/7 fallos reproduciendo ALTA-03, ALTA-07, MEDIA-14 |
| `RED_R15_FASE4_sobre_fase3.txt` | 4 fallos / 3 pasos reproduciendo ALTA-05, MEDIA-16 |
| `GREEN_R15_FASE1_resumen.txt` · `_concurrencia.txt` · `_suite_completa.txt` | Fase 1 verde + suite 803/13/1 |
| `GREEN_R15_FASE2_resumen.txt` … `GREEN_R15_FASE7_resumen.txt` | Verdes por fase (810 → 841 passed) |
| `GREEN_R15_FASE7b_instalador.txt` | MEDIA-12: RED (2 fallos) → GREEN (5/5) + incidente de `.git` |
| `GREEN_R15_FASE8a_alineacion.txt` | 860/0/0 + justificación SUPERSEDE de las 13 pruebas |
| `GREEN_R15_FASE8b_version.txt` | Bump r15 + suite 860/0/0 + Node 34/34 |

Fases 3, 5 y 6 no generaron archivo RED independiente: el resumen GREEN de cada
una registra la reproducción previa y el resultado posterior.

## Empaquetado y simulación de instalación (Fase 9)

Paquete: `V-Matrix-V15.10.1-R15_20261015.zip` — 132 entradas:

- **Payload instalable** (83 archivos en rutas relativas, cubiertos por
  `MANIFEST_SHA256_R15.txt`): 64 archivos del payload R14 con contenido R15
  + 19 archivos nuevos/cambiados de R15 (pruebas R15, `red_segura.js`,
  documentación, tests alineados en Fase 8a).
- **Raíz del ZIP:** `INSTALAR_R15.bat/.ps1`, `MANIFEST_SHA256_R15.txt`,
  `CHANGELOG_R15.md`, `V-MATRIX_R15.patch` (diff unificado base R14 → R15,
  verificado con `git apply --check` sobre `6f72828`), `SHA256SUMS.txt` +
  verificadores (`verificar_sha256.sh`, `VERIFICAR_SHA256.ps1`).
- **`evidencia/`:** matriz, informe por hallazgo y `ejecucion/` con los
  archivos RED/GREEN de cada fase.
- **`skills/`:** las 6 skills (`v-matrix-safe-change`, `airbag-onset`,
  `matrix-excel`, `roi-supervision`, `evaluation-lab`, `video-zoom-ux`).

**Simulación de instalación verificada:** clon de la base R14 (`6f72828`) +
copia de los 83 archivos del manifiesto (hash por hash) + deduplicación de
`README_R14.md` de raíz (mismo efecto que `Relocate-LegacyRootDocs` del
instalador) → suite completa en el árbol simulado:
**854 passed / 0 failed / 6 skipped** (los 6 skips son las pruebas de
instalador, que sólo aplican en el paquete distribuible) y **34/34** `.cjs`.
`SHA256SUMS.txt` y `MANIFEST_SHA256_R15.txt` verificados desde dentro del
ZIP extraído (0 discrepancias).

## Verificación independiente pendiente (criterio de liberación)

Conforme al cierre de N17 y al plan R15, quedan pendientes y **no** se declaran
resueltas aquí:

1. Validación con 20–30 videos AVI reales (ground truth sólo para evaluación).
2. Ejecución real del instalador en Windows (`pwsh`/PowerShell 5.1) incluyendo un
   rollback inducido.
3. Navegador real + GPU Windows para el frontend.
4. Repetición independiente de las cifras de suite por parte del auditor.

No se declara producción ni precisión de 0.1 ms hasta completar esos puntos.
