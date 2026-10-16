# MATRIZ DE EVIDENCIA R15.6 — V-Matrix V15.10.1-r15.6

Todos los logs citados están en `evidencia/ejecucion/` del paquete. Las
cifras de esta matriz se transcriben de esos logs (generados al ejecutar),
nunca escritas a mano (LOW-07 de R15.5 / BAJO-07 de la auditoría R15.5).

## 1. Hallazgo → prueba → evidencia

| Hallazgo auditoría R15.5 | Prueba oficial (RED→GREEN) | Log RED | Log GREEN | Commit | Estado |
|---|---|---|---|---|---|
| CRÍTICO-01 campo manual | `r156_efectos_humanos::test_corregir_campo_fallo_revision_no_toca_documento` (+éxito) | `RED_R15_6_F1` (6F/2P) | `GREEN_R15_6_F1` (18P) | `218ea89` | CERRADO en código |
| MEDIO-06 rutas fuera del coordinador | `r156_efectos_humanos` (8 pruebas: no-texto, lote atómico, anotación, externas) | idem | idem | `218ea89` | CERRADO en código |
| ALTO-02 doble fallo `corregir_lectura` | `r156_lectura_zona::test_corregir_lectura_doble_fallo_registra_inconsistencia_durable` (+3) | `RED_R15_6_F2` (4F/2P) | `GREEN_R15_6_F2` (suite 1024/0) | `981453a` | CERRADO en código |
| ALTO-11 edición de zona | `r156_lectura_zona::test_editar_zona_fallo_revision_cero_efectos` (+éxito) | idem | idem | `981453a` | CERRADO en código |
| Bug latente `edicion_id` | cobertura vía ALTO-11 (restauración de zonas) | idem | idem | `981453a` | CORREGIDO |
| ALTO-08 zona durante reserva | `r156_guard_uniforme::test_editar_zona_reserva_bloquea` (+hilo vivo) | `RED_R15_6_F3` (5F/4P) | `GREEN_R15_6_F3` (suite 1033/0, node) | `51a2e58` | CERRADO en código |
| ALTO-09 orientación durante reserva | `r156_guard_uniforme::test_orientacion_regional_reserva_bloquea` (+inactiva guarda) | idem | idem | `51a2e58` | CERRADO en código |
| ALTO-10 completada con pipeline | `r156_guard_uniforme` (3 bloqueos + parcial no-regresión) | idem | idem | `51a2e58` | CERRADO en código |
| ALTO-03 registro fail-open | `r156_recuperacion` (no escribible tras reinicio, corrupto al arrancar, modo bloquea, persistencia verificada) | `RED_R15_6_F4` (9F/1P) | `GREEN_R15_6_F4` (suite 1043/0) | `1f582e9` | CERRADO en código |
| MEDIO-05 flujo de recuperación | `r156_recuperacion` (mensaje, listar, resolver ±confirmación, 404, modo+centinela) + UI `.cjs` | idem + `RED_R15_6_F6` | idem + `GREEN_R15_6_F6` (node 39/39) | `1f582e9`, `40eb226` | CERRADO en código |
| ALTO-04 lost update externo | `r156_documento_externo` (7 pruebas: carrera 2 pestañas, revisión monotónica, CAS ±, restaurar, regeneración) | `RED_R15_6_F5` (7F) | `GREEN_R15_6_F5` (suite 1050/0, node) | `a50512f` | CERRADO en código |
| BAJO-07 inventarios | inventario generado desde el árbol (node 39/39; `INVENTARIO_PAYLOAD_R15_6.txt` del build) | — | `GREEN_R15_6_F6` | `40eb226` + build | CERRADO |
| Plan P1 ítem 9 (inventario writers) | `r156_guard_uniforme::test_inventario_writers_revision_bajo_coordinador` | — | `GREEN_R15_6_F3` | `51a2e58` | CERRADO |

## 2. Criterios de aprobación del auditor (§11) → dónde se cumplen

| Criterio | Cobertura |
|---|---|
| Los 96 tests críticos heredados siguen verdes | Suite completa en cada GREEN de fase (R15.2→R15.6 sin regresión): logs F2–F5 |
| Frontend completo verde | node **39/39** en HEAD de desarrollo y en las 3 simulaciones (`GREEN_R15_6_F3/F6`, `SIM_R15_6_*`) |
| Pruebas adversariales nuevas de rojo a verde | 40 pruebas nuevas (5 archivos `r156_*`) + 1 `.cjs`; RED→GREEN por fase (§1) |
| Dos pestañas sobre `pruebas_externas.json` preservan ambos cambios | `test_dos_pestanas_preservan_ambos_cambios` (carrera real, 2 hilos) |
| Petición fallida ⇒ cero efectos O bloqueo durable verificable | F1/F2 (rutas humanas), F4 (bloqueo durable + centinela que sobrevive reinicio) |
| Reserva del pipeline bloquea uniformemente mutaciones incompatibles | F3 (`_assert_pipeline_inactivo` en zonas, orientación, cierre completada; `_assert_documento_editable`/`_guard_mutacion_video` heredados) |

## 3. Regresión heredada (R15 → R15.5)

* Suite de desarrollo completa en HEAD final (3 pasadas consecutivas):
  **1045 passed / 0 failed / 5 skipped** cada una + **node 39/39** — ver
  `SUITE_R15_6_final.txt`. Incluye las baterías R15/R15.1/R15.2/R15.3/
  R15.4/R15.5 sin modificación de contrato, salvo SUPERSEDE documentados en
  el INFORME §«Adaptaciones».
* Sin contaminación: `.cache_ocr/estado_inconsistente.json` y
  `recuperacion_requerida.json` NO existen tras la suite completa.

## 4. Inventario del paquete (generado por el build, no manual)

* `MANIFEST_SHA256_R15_6.txt`: payload instalable (hashes calculados en
  staging; categorías en `evidencia/INVENTARIO_PAYLOAD_R15_6.txt`).
* `SHA256SUMS.txt`: todo el paquete salvo él mismo y los verificadores.
* Patch `V-MATRIX_R15_6.patch`: `git diff --no-renames 69b1900..HEAD`.
* Node: inventario del árbol = 39 `.cjs` activos (log F6 + SIM_*).

## 5. Simulaciones de instalación (suite completa sobre árbol simulado)

Ejecutadas por `sim_r15_6.py` (clon git en la base + payload copiado con
verificación SHA-256 archivo por archivo + réplica de
`Relocate-LegacyRootDocs` + identidad + pytest completo + node con cwd=raíz):

| Sim | Escenario | Log | pytest | node |
|---|---|---|---|---|
| A | Instalación limpia (base `69b1900` + payload R15.6, 141 archivos verificados SHA-256) | `SIM_R15_6_A_instalacion_limpia.txt` | **1034 passed / 0 failed / 16 skipped** | **39/39** |
| B | Instalación usada (checkpoint histórico `sim-b-r156` completado + `validacion_resultados.json` viejo con revisión 7) | `SIM_R15_6_B_instalacion_usada.txt` | **1034 passed / 0 failed / 16 skipped** | **39/39** |
| C | Upgrade R15.5 → R15.6 (payload R15.5 de 130 archivos desde ZIP oficial + Relocate + payload R15.6 de 141 + Relocate) | `SIM_R15_6_C_upgrade_desde_r15_5.txt` | **1034 passed / 0 failed / 26 skipped** | **39/39** |

Los 16 skips de A/B: 6 históricos heredados + 10 del test de identidad del
instalador R15.6 (su `.ps1` viaja en la raíz del ZIP, no en el árbol
instalado; skip por diseño, mismo criterio R15.5). Los 26 de C añaden los 10
del test del instalador R15.5 que permanece del payload anterior (sin su
`.ps1`, skip por diseño — documentado en R15.5). Identidad verificada en las
tres: `VERSION.txt=15.10.1-r15.6`, `PATCH_BUILD` presente, cache-busting ×5.

## 6. Estado de liberación

* Criterios 1–6 del auditor (§7): cerrados EN CÓDIGO con evidencia (esta
  matriz). Criterios de campo (instalador Windows real, Tmax con AVI reales,
  soak en máquina objetivo): **PENDIENTES DE CAMPO** — no se declara
  Production Ready; corresponde a la siguiente auditoría independiente.
