# MATRIZ DE EVIDENCIA — R15.4 (15.10.1-r15.4)

Todas las cifras de esta matriz fueron EJECUTADAS (no declaradas de memoria). Comandos reproducibles desde la raíz del producto instalado. Evidencia cruda: carpeta `evidencia/` del paquete (logs RED/GREEN por fase) y `evidencia/ejecucion/` (simulaciones de instalación).

## 1. Identidad

| Fuente | Valor esperado | Verificación |
|---|---|---|
| `VERSION.txt` | `15.10.1-r15.4` | `cat VERSION.txt` |
| `dashboard/backend/app.py` | `version="15.10.1-r15.4"` y `PATCH_BUILD = "15.10.1-r15.4"` | `grep -n "15.10.1-r15.4" dashboard/backend/app.py` |
| `dashboard/frontend/index.html` | 5× `?v=15.10.1-r15.4`; cero versiones viejas (r14, r15, r15.1, r15.2, r15.3) | `grep -c "v=15.10.1-r15.4" dashboard/frontend/index.html` |
| Instalador | `INSTALAR_R15_4.ps1` (ASCII puro, sin BOM) + `INSTALAR_R15_4.bat`; marker `PATCH_INSTALLED_V15_10_1_R15_4.json`; backup `_BACKUP_PRE_R15_4_*`; bases acumulativas r14→r15.4 | `pruebas/test_v15_10_1_r15_instalador.py`, `pruebas/test_v15_10_1_r15_4_instalador_base.py`, `pruebas/test_v15_10_1_r14_auditoria_preventiva.py` (22/22) |

## 2. Por hallazgo

| Hallazgo | Fase · Commit | Pruebas nuevas (RED→GREEN) | Evidencia | Estado |
|---|---|---|---|---|
| HIGH-01 compensación multi-almacén + 503 | F1 · `49d761b` | `test_v15_10_1_r154_compensacion_multialmacen.py` (8) — 7F/1P → 8/8 | `RED_R15_4_F1_compensacion.txt`, `GREEN_R15_4_F1_compensacion.txt` | CERRADO |
| MEDIUM-02 lock corto 3 fases + reserva 423 | F2 · `62b394e` | `test_v15_10_1_r154_lock_corto.py` (5) — 5F → 5/5 | `RED_R15_4_F2_lock_corto.txt`, `GREEN_R15_4_F2_lock_corto.txt` | CERRADO |
| MEDIUM-03 checkpoint seguro + aviso UI | F3 · `c5af614` | `test_v15_10_1_r154_checkpoint_seguro.py` (8) — 7F/1P → 8/8; `test_v15_10_1_r154_aviso_checkpoint.cjs` (render real vendor); regresión dirigida consumidores 51/51 | `RED_R15_4_F3_checkpoint_seguro.txt`, `GREEN_R15_4_F3_checkpoint_seguro.txt` | CERRADO |
| MEDIUM/LOW-04 anomalía de orden + soak | F4 · `83ce235` | `test_v15_10_1_r154_soak_analisis_video.py` (2: 100 análisis + fds VideoCapture) — verde (monitorización, no defecto reproducible en sandbox); diagnóstico aislada-vs-archivo medido | `GREEN_R15_4_F4_soak.txt` | CERRADO (monitorizado) |
| LOW-05 inventario Node | F6 · docs | Tabla §3 con comandos reproducibles | `CHANGELOG_R15_4.md` §Inventario, `GREEN_R15_4_F5_identidad.txt` | CERRADO |
| FIELD-06 matriz Windows real | — | Pruebas estáticas del instalador al día (22/22); ejecución física imposible en sandbox (sin pwsh) | §1 | PENDIENTE DE CAMPO |

## 3. Inventario de pruebas (LOW-05) — cifras exactas

| Magnitud | Valor | Comando |
|---|---|---|
| Python suite completa (dev) | **990 passed / 0 failed** (~150 s) | `PYTHONPATH=pruebas:. python -m pytest pruebas/ -q` |
| Python en simulaciones A/B/C | **974 passed + 16 skipped** (15 instalador por diseño + 1 plataforma) | logs en `evidencia/ejecucion/` |
| Node activos (`pruebas/*.cjs`) | **38** (38/38 verdes en dev y sims) | `ls pruebas/*.cjs \| wc -l` |
| — por parche acumulado R14→R15.4 | **13** (5 nuevos + 8 actualizados) | `grep -c "\.cjs" MANIFEST_SHA256_R15_4.txt` |
| — heredados de base sin tocar | **25** (base 69b1900: 33 activos) | `git ls-tree -r 69b1900 --name-only \| grep "pruebas/[^/]*\.cjs$" \| wc -l` (sobre el repo de desarrollo) |
| Históricas de archivo (NO ejecutadas) | **8** | `find pruebas -mindepth 2 -name "*.cjs" \| wc -l` |
| Total `.cjs` repo | **46** | `find . -name "*.cjs" -not -path "./.git/*" \| wc -l` |

## 4. Regresión global

| Ámbito | Resultado |
|---|---|
| Suite Python completa tras cada fase | F1 975/0 · F2 980/0 · F3 988/0 · F4 990/0 · F5 990/0 |
| Node tras cada fase | 37/37 (F1–F4) · 38/38 (desde F3, con el `.cjs` nuevo; confirmado en F5) |
| Simulaciones de instalación | A (limpia base+R14), B (usada con checkpoint y marker), C (upgrade R15.3→R15.4): instalación + suite + node verdes en las 3 |

## 5. Garantías heredadas que siguen vigentes (no regresadas)

- R15.3: admisión atómica pipeline/reanálisis; 409 ⇒ cero efectos persistentes; guarda uniforme de reserva (12 endpoints); invariante de magnitud/persistencia Tmax (2 % / 25 px / 3 frames) y confianza ≤ 0.35 en todo estado no confirmado.
- R15.2: autoridad única de escritura del documento; migración por fila; CAS estricto en UI; invariante temporal Tmax.
- R15.1/R15/N17 y anteriores: protección estructural de cabeceras, precedencia C7, contrato N6/N4, plantilla inmutable, fail-closed.
- Regla de seguridad Tmax: sin evidencia suficiente ⇒ NO CONFIRMADO y caso a revisión/azul.

## 6. Declaración de alcance

- SIN funciones nuevas (correctiva pequeña y enfocada, criterio del auditor).
- Motor OCR y plantilla Excel intactos.
- No se declara Production Ready: pendientes FIELD-06 (instalador Windows real), AVI reales, GPU Windows, navegador real y calibración de campo de umbrales Tmax (plan R15.4 puntos 8 y 9).
