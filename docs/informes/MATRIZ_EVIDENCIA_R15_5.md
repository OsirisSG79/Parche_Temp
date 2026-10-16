# MATRIZ DE EVIDENCIA — R15.5 (15.10.1-r15.5)

Todos los comandos son reproducibles desde la raíz del árbol instalado
(mismo criterio que R15.4). Entorno de desarrollo: Linux, Python 3.13,
`fastapi`+`httpx` instalados; Node para los `.cjs` (ejecutar con
`cwd` = raíz del árbol).

## 1. Identidad

| Fuente | Valor esperado | Comando |
|---|---|---|
| `VERSION.txt` | `15.10.1-r15.5` | `cat VERSION.txt` |
| Backend | `PATCH_BUILD = "15.10.1-r15.5"` | `grep PATCH_BUILD dashboard/backend/app.py` |
| Frontend | `?v=15.10.1-r15.5` (≥5 assets) | `grep -c "v=15.10.1-r15.5" dashboard/frontend/index.html` |
| Instalador | `INSTALAR_R15_5.bat` / `.ps1`, marker `PATCH_INSTALLED_V15_10_1_R15_5.json`, bases r14→r15.5 | `grep "15.10.1-r15" INSTALAR_R15_5.ps1 \| head` |
| Pruebas de identidad | 24/24 verdes | `PYTHONPATH=pruebas:. python -m pytest pruebas/test_v15_10_1_r14_auditoria_preventiva.py pruebas/test_v15_10_1_r15_instalador.py pruebas/test_v15_10_1_r15_5_instalador_base.py -q` |

## 2. Por hallazgo

| Hallazgo | Prueba (RED→GREEN) | Comando |
|---|---|---|
| HIGH-01 aprendizaje post-commit | `test_v15_10_1_r155_aprendizaje_post_commit.py` (4) — RED 1F en `evidencia/ejecucion/RED_R15_5_F1_*.txt` | `PYTHONPATH=pruebas:. python -m pytest pruebas/test_v15_10_1_r155_aprendizaje_post_commit.py -q` |
| P0 + MEDIUM-05 coordinador | `test_v15_10_1_r155_transaccion_coordinada.py` (6) — RED 6F en `RED_R15_5_F2_*.txt` | `PYTHONPATH=pruebas:. python -m pytest pruebas/test_v15_10_1_r155_transaccion_coordinada.py -q` |
| HIGH-02 rotación | `test_v15_10_1_r155_rotacion_transaccional.py` (4) — RED 2F en `RED_R15_5_F3_*.txt` | `PYTHONPATH=pruebas:. python -m pytest pruebas/test_v15_10_1_r155_rotacion_transaccional.py -q` |
| HIGH-03 verificar + MEDIUM-04 externa | `test_v15_10_1_r155_verificacion_externa.py` (6) — RED 4F (resumen en `GREEN_R15_5_F4_*.txt`) | `PYTHONPATH=pruebas:. python -m pytest pruebas/test_v15_10_1_r155_verificacion_externa.py -q` |
| LOW-06 soak warm-up | `test_v15_10_1_r154_soak_analisis_video.py` (2) | `PYTHONPATH=pruebas:. python -m pytest pruebas/test_v15_10_1_r154_soak_analisis_video.py -q` |
| Pruebas adversariales P1 (6 ítems del auditor) | ítem 1: F1 · ítem 2: F3 · ítem 3: F4 · ítem 4: F4 externa · ítem 5: F2+F3 doble fallo · ítem 6: revisión documental y archivos auxiliares afirmados en cada test | ver comandos anteriores |

## 3. Inventario de pruebas (LOW-05/LOW-07) — cifras del árbol

| Magnitud | Valor | Comando |
|---|---|---|
| Suite Python dev | **1010 passed / 0 failed** (×2 pasadas) | `PYTHONPATH=pruebas:. python -m pytest pruebas/ -q` |
| Pruebas nuevas R15.5 | **20** (4+6+4+6) | `PYTHONPATH=pruebas:. python -m pytest pruebas/ -q -k r155` |
| `.cjs` activos | **38** (38/38) | `ls pruebas/*.cjs \| wc -l` |
| `.cjs` del parche acumulado | **13** | `grep -c "\.cjs" MANIFEST_SHA256_R15_5.txt` |
| `.cjs` históricos de archivo | **8** | `find pruebas -name "*.cjs" \| grep -v "^pruebas/[^/]*\.cjs$" \| wc -l` |
| Entradas del manifiesto | generado automáticamente (doble pasada del build) | `wc -l MANIFEST_SHA256_R15_5.txt` |
| SHA256 del paquete | verificable desde dentro del ZIP | `bash verificar_sha256.sh` o `powershell -File VERIFICAR_SHA256.ps1` |

## 4. Regresión global

- Suite completa: `PYTHONPATH=pruebas:. python -m pytest pruebas/ -q` →
  **1010 passed / 0 failed** (~150 s; repetida 2 veces, sin contaminación de
  `.cache_ocr/` — verificar con `ls .cache_ocr/estado_inconsistente.json`,
  debe NO existir tras la suite).
- Node: cada `pruebas/*.cjs` con `node <archivo>` desde la raíz → **38/38**.
- Dirigidas por fase (logs en `evidencia/ejecucion/`): 31 (F2 coordinador +
  persistencia + c1–c7), 41 (F2 + r153), 14 (F3 rotación/externas/editor),
  76 (F4: R15.2–R15.5 completas), 24 (F5/F6 identidad/instalador/soak).
- Simulaciones de instalación (logs `SIM_R15_5_*` en `evidencia/ejecucion/`;
  en las tres: payload copiado con verificación SHA-256 archivo por archivo,
  `Relocate-LegacyRootDocs` replicado tras cada payload, identidad verificada
  y SUITE COMPLETA pytest+node sobre el árbol simulado):
  A limpia (base `69b1900` + payload R15.5 ⇒ 994 passed + 16 skipped: 15 de
  instalador por diseño + 1 de plataforma; node 38/38);
  B usada (como A + checkpoint histórico sembrado y documento vacío ⇒ suite
  completa verde: contrato R15.4 MEDIUM-03 vigente);
  C upgrade R15.4→R15.5 (payload R15.4 del ZIP oficial + payload R15.5 ⇒
  994 passed + 26 skipped — los 10 adicionales son el instalador viejo
  R15.4 que permanece en el árbol actualizado y se omite por diseño;
  node 38/38).

## 5. Garantías heredadas que siguen vigentes (no regresadas)

- R15.4: compensación multi-almacén (ahora vía coordinador común), lock corto
  de 3 fases + reserva por recurso (423), `/api/pruebas` consciente del
  checkpoint, soak 100 análisis, inventario Node.
- R15.3: admisión atómica del pipeline, 409 ⇒ cero efectos persistentes,
  invariante magnitud/persistencia Tmax, confianza ≤ 0.35 sin confirmar.
- R15.2: autoridad única de escritura (`utilidades/persistencia_documento`),
  migración por fila, CAS estricto en writers de UI.
- R15.1: documento fresco bajo lock (CRÍTICO-01), CAS opcional `expected_revision`.
- V15.9.3: fallo de escritura ⇒ la marca sin-datos NO se elimina (arnés
  legacy `test_restaurar_texto_unittest.py` intacto).

## 6. Declaración de alcance

R15.5 cierra en código los criterios 1–4 de liberación del auditor
(atomicidad transversal, doble fallo declarado y bloqueante, política única
compartida, soak post-warm-up). Los criterios 5 (instalación/rollback en
Windows real) y 6 (calibración Tmax con videos reales) siguen PENDIENTES DE
CAMPO: **no se declara producción**. Sin funciones nuevas; el motor OCR, la
plantilla Excel y los umbrales Tmax no cambian.
