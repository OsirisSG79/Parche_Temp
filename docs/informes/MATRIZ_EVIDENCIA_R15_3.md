# MATRIZ DE EVIDENCIA — R15.3 (auditoría independiente R15.2)

Trazabilidad hallazgo → prueba → evidencia cruda. Metodología RED-first: cada
corrección se reproduce en ROJO antes del fix (archivos `RED_*`) y se verifica
en VERDE (`GREEN_*`) con suite completa. Ejecutadas en el sandbox de
desarrollo (Linux, Python 3.13.16, pytest 9.0.3, Node 20.20.2) el 2026-10-15.
Commits: F1 `005beb6` · F2 `70762d4` · F3 `be93c68` · F4 `0b00b07` · F5
(docs+empaquetado) este commit. Base auditada: `3d7a4ef` (R15.2).

| Hallazgo | Prueba(s) | RED | GREEN | Resultado |
|---|---|---|---|---|
| CRÍTICO-01 + MEDIO-05 | `pruebas/test_v15_10_1_r153_admision_atomica.py` (3: interleaving forzado, 100 carreras un ganador, fallo de `Thread.start`) | `ejecucion/RED_R15_3_F1_admision_atomica.txt` (2 failed/1 passed sobre R15.2) | `ejecucion/GREEN_R15_3_F1_admision_atomica.txt` (3/3 + regresión concurrencia R15 y documento único R15.2: 26/26) | CERRADOS |
| ALTO-02 + ALTO-03 | `pruebas/test_v15_10_1_r153_cas_efectos.py` (17: 4 rutas con mutación concurrente en el efecto, compensación de ROI, 12 endpoints × reserva) | `ejecucion/RED_R15_3_F2_cas_efectos.txt` (6 failed/11 passed) | `ejecucion/GREEN_R15_3_F2_cas_efectos.txt` (51 passed del bloque dirigido + suite dev 956/0 + node 37/37) | CERRADOS |
| ALTO-04 + P2 confianza | `pruebas/test_v15_10_1_r153_tmax_magnitud.py` (11: repro auditor ×3, umbrales, persistencia, no-regresión 1.0, coherencia, contrato, fuzz ×300) | `ejecucion/RED_R15_3_F3_tmax_magnitud.txt` (10 failed/1 passed; repro exacta: 10000→10001 px ⇒ `maximo_inflado_estimado` conf 1.0) | `ejecucion/GREEN_R15_3_F3_tmax_magnitud.txt` (11/11 + batería video/apertura 228 + suite dev 967/0) | CERRADOS |
| Identidad r15.3 (release) | `test_v15_10_1_r15_instalador.py` + `test_v15_10_1_r15_4_instalador_base.py` + `test_v15_10_1_r14_auditoria_preventiva.py` (22) | `ejecucion/RED_R15_3_F4_identidad.txt` (8 failed/14 passed: pins r15.3 sobre contenido r15.2 + rename) | `ejecucion/GREEN_R15_3_F4_identidad.txt` (22/22 + suite 967/0 + node 37/37 + ps1 ASCII puro sin BOM) | CERRADO (estático; Windows real = criterio 8, campo) |
| BAJO-06 | Conteos por ámbito (changelog + informe) | — | `ejecucion/GREEN_R15_3_F5_empaquetado.txt` (conteos y sims) | CERRADO (documental) |
| Regresión global | suite completa `pruebas/` | — | `ejecucion/GREEN_R15_3_F4_identidad.txt` (967/0 + node 37/37) y `ejecucion/GREEN_R15_3_F5_empaquetado.txt` (build, verificación interna, simulaciones A/B) | VERDE |

## Criterios de aprobación R15.3 del auditor

| # | Criterio | Evidencia | Estado |
|---|---|---|---|
| 1 | Pipeline vs reanálisis: 1 solo ganador en 100+ carreras | `test_carrera_admision_100_iteraciones_un_solo_ganador` + interleaving forzado determinista | CERRADO |
| 2 | 409 CAS: 0 efectos persistentes | 4 rutas con mutación concurrente inyectada DENTRO del efecto (`…r153_cas_efectos.py`) | CERRADO |
| 3 | Reserva pipeline: todas las mutaciones incompatibles bloqueadas | 12 endpoints × 409 con reserva sin hilo (incluye `restaurar_imagen_con_texto`) | CERRADO |
| 4 | Tmax confirmado exige crecimiento significativo | umbrales relativo 2 % / absoluto 25 px + persistencia 3 frames; repro del auditor ⇒ `sin_maximo_defendible` | CERRADO |
| 5 | Señal plana/ruido ⇒ no confirmado con confianza baja/coherente | tope 0.35 para todo estado no confirmado + penalización −0.40 | CERRADO |
| 6 | `Thread.start()` fallido ⇒ estado seguro | rollback + `estado='error'` + `ultimo_error` + 500; nunca `preparando` fantasma | CERRADO |
| 7 | Regresión Python/Node completa | 967/0 dev · node 37/37 · sims A/B del payload | CERRADO |
| 8 | Instalador en Windows real | imposible en sandbox (sin pwsh/Windows); 22 pruebas estáticas verdes | PENDIENTE DE CAMPO (CAMPO-07, documentado) |

## Suite completa

| Corrida | Árbol | Resultado |
|---|---|---|
| Tras F1 | desarrollo (`005beb6`) | bloque dirigido verde (admisión 3/3 + concurrencia/documento 26/26) |
| Tras F2 | desarrollo (`70762d4`) | 956 passed / 0 failed · node 37/37 |
| Tras F3 | desarrollo (`be93c68`) | 967 passed / 0 failed · batería video/apertura 228 · node 37/37 |
| Tras F4 | desarrollo (`0b00b07`) | 967 passed / 0 failed · node 37/37 (`GREEN_R15_3_F4_identidad.txt`) |
| Simulación A (limpia) | checkout del payload del ZIP | ver `GREEN_R15_3_F5_empaquetado.txt` |
| Simulación B (usada) | ídem + checkpoint `completado` + documento rev 7 sembrados | ver `GREEN_R15_3_F5_empaquetado.txt` |

## Identidad de versión (coherencia exigida por el auditor)

| Fuente | Valor |
|---|---|
| `VERSION.txt` | `15.10.1-r15.3` |
| `dashboard/backend/app.py` (`PATCH_BUILD` + FastAPI version) | `15.10.1-r15.3` |
| `dashboard/frontend/index.html` (5 assets `?v=`) | `15.10.1-r15.3` |
| `INSTALAR_R15_3.ps1` (`$PatchBuild`, marker, manifiesto, backups) | `15.10.1-r15.3` / `PATCH_INSTALLED_V15_10_1_R15_3.json` / `MANIFEST_SHA256_R15_3.txt` / `_BACKUP_PRE_R15_3_` |
| Bases aceptadas por el instalador (acumulativas) | `15.10.1-r14`, `-r15`, `-r15.1`, `-r15.2`, `-r15.3` |

## BAJO-06 — conteos Node por ámbito (fix documental)

| Ámbito | `.cjs` | Resultado |
|---|---|---|
| `pruebas/*.cjs` activos (árbol dev R15.3) | 37 | 37/37 verdes |
| `pruebas/*.cjs` activos (simulaciones A y B) | 37 | 37/37 verdes |
| Copias históricas fuera de `pruebas/` (`codigo_final_referencia/` ×4, `V15_9_APERTURA_ROI_ZOOM_MATRIZ/archivos/` ×1, `V-Matrix-…R8_20261014/` ×3) | 8 | no activas |
| Total repo (búsqueda global) | 45 | — |

El «38» observado por el auditor no es reproducible en dev ni en sims (37);
la diferencia depende del ámbito del buscador sobre su checkout. Toda cifra
declarada por este paquete indica su ámbito.

## Volteos de pruebas documentados (SUPERSEDE — no «verdear» ediciones viejas)

| Archivo | Cambio | Motivo |
|---|---|---|
| `test_v15_10_1_r152_documento_unico.py` (`test_sin_datos_concurrente`) | El interleaving prechequeo→commit ya no es alcanzable por diseño ⇒ la prueba verifica los dos órdenes deterministas posibles | ALTO-02 (CAS+efectos en la misma región de lock) |
| `test_reconfirmacion_simbolos_unittest.py`, `test_reconfirmacion_unittest.py`, `test_sobrescritura_publica_unittest.py` | entorno AST ampliado con `contextlib` | ALTO-02 (las rutas usan `with _lock_documento()`) |
| `test_restaurar_texto_unittest.py` | stub de `_assert_documento_editable` en el entorno | ALTO-03 (guarda uniforme) |
| `test_v15_10_1_r15_instalador.py`, `test_v15_10_1_r15_4_instalador_base.py`, `test_v15_10_1_r14_auditoria_preventiva.py` | pins de identidad r15.2 → r15.3; bases/markers acumulativos; regex postflight `15\.10\.1-r15\.3`; pin negativo nuevo (`r15.2` fuera de `index.html`); nombres de test `r15_2`→`r15_3`; párrafos históricos SUPERSEDE conservados y bug de doc R15.1 corregido | Release nuevo (F4) |
