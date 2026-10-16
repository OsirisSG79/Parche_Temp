# CHANGELOG — V-Matrix V15.10.1 R15.1

- **Versión:** 15.10.1-r15.1 (`PATCH_BUILD` en `dashboard/backend/app.py`; caché frontend `?v=15.10.1-r15.1`; `VERSION.txt`; marker `PATCH_INSTALLED_V15_10_1_R15_1.json` — las cuatro fuentes reportan la MISMA versión)
- **Fecha:** 2026-10-15
- **Base:** V15.10.1 R15 sobre R14 sobre V15.9.10 (N17 aceptado). Acumulativo: `INSTALAR_R15_1` acepta bases `15.10.1-r14`, `15.10.1-r15` y `15.10.1-r15.1` (VERSION.txt o marker) y aborta sobre cualquier otra carpeta ANTES de modificar nada.
- **Origen:** `AUDITORIA_INDEPENDIENTE_R15_20261015.md` — veredicto «R15 corrige una parte importante pero NO está lista para producción»; 11 hallazgos (1 crítico, 5 altos, 3 medios, 2 bajos). R15.1 cierra los 11.
- **Suite final:** 887 passed / 0 failed (Python) · 36/36 verdes (Node `.cjs`)
- **Filosofía intacta:** no inventar certeza; la intervención humana es la excepción, no el flujo; R16 (trigger eléctrico, volumen/presión) fuera de alcance.

## Hallazgos cerrados

| # | Hallazgo | Corrección | Pruebas |
|---|---|---|---|
| CRÍTICO-01 | Writers legacy sin lock/CAS perdían commits concurrentes y hacían retroceder `revision_documento` (reproducción del auditor: revisión 6 → 5 con `VIDEO_NUEVO` perdido) | Primitiva única `mutar_documento()` (lock RLock → lectura fresca de disco → CAS → patch → revisión monotónica → `escribir_json_seguro(lanzar=True)` → invalidación de caché). Migrados los 7 writers restantes: campo manual, sin-datos, verificar imagen, corrección OCR, rotación, restaurar con-texto y consolidar. Cero `_guardar_json_atomico(RUTA_VALIDACION…)` directos (guard estático en prueba). Defensa en profundidad: ninguna callback puede hacer retroceder la revisión | `test_v15_10_1_r15_1_documento_global.py` (9): pérdida por escritura lenta, sin-datos concurrente, consolidación sobre snapshot viejo, 3 mutaciones heterogéneas concurrentes (campo+imagen+video), CAS estricto, guard estático |
| ALTO-02 | `expected_revision=None` bypaseaba el CAS en endpoints R15 | `estricto=True` en los 7 call sites de video: documento ya versionado (rev > 0) rechaza peticiones sin `expected_revision` con 409 «recarga la pantalla». Documentos legacy sin versionar aceptan la primera mutación, que los versiona. `expected_revision` añadido a los 6 modelos legacy | Ídem (prueba 7) |
| ALTO-03 | Preflight del instalador fail-open con Python global (Get-Process veía `C:\Python311\python.exe` y daba por verificado sin poder ver la línea de comando); `.bat` sin `%*` | Fallback fail-closed: sin intérpretes `python/pythonw/uvicorn/node` ⇒ seguro; con cualquiera cuya línea de comando no es visible ⇒ NO VERIFICADO y aborto salvo `-Force`. `INSTALAR_R15_1.bat` reenvía `%*` | `test_v15_10_1_r15_4_instalador_base.py` |
| ALTO-04 | Instalador no verificaba base R14 (instalaciones híbridas posibles) | `Assert-BaseConocida` antes de leer manifiesto/copiar: sólo VERSION.txt ∈ {r14, r15, r15.1} o marker R14/R15/R15.1; resto ⇒ throw sin modificar nada | Ídem |
| ALTO-05 | `VERSION.txt` quedaba en r14 tras instalar R15 (fuera de manifiesto y postflight); benchmark etiquetado con versión falsa | `VERSION.txt` = `15.10.1-r15.1` en el árbol, incluido en el manifiesto R15.1 y verificado en postflight junto a index.html y `PATCH_BUILD` | Ídem + `test_v15_10_1_r14_auditoria_preventiva.py` actualizada (SUPERSEDE documentado) |
| ALTO-06 | Tmax 0.0 ms «confirmado» con breakout en frame 0 y cero anomalías (`[100×5]`, `[100,99,100,100,100]`, `[100,100,99,100,99]`) | Censura explícita: `frame_breakout == 0` ⇒ anomalía `evento_censurado_al_inicio` + confianza −0.20; máximo en el frame 0 (duración 0 ms) ⇒ `sin_maximo_defendible` + `sin_evidencia_previa_del_crecimiento`; frame 0 con área > 50 % del pico ⇒ estimado degradado a `maximo_visible_observado_no_confirmado`. Guarda de sobre-corrección: crecimiento observado desde frame 0 pequeño mantiene el estimado | `test_v15_10_1_r15_2_maximo_censurado.py` (11) + regresiones R13/R15 intactas |
| MEDIO-07 | Carrera de pantalla: `refrescar()` inicial sin guarda en paralelo al sondeo serial (respuesta inicial vieja sobrescribía el primer poll); mismo patrón en VistaTabla (`useApi(rutaFilas)` + sondeo) | Fuente única por recurso: el sondeo serial ejecuta también la primera consulta (`iniciar()` inmediato) y las guardas de secuencia son ÚNICAS por recurso, compartidas entre refrescos manuales y sondeo (refs). VistaTabla sin petición inicial paralela; sondeo con gestión de error/carga | `test_v15_10_1_r15_3_carrera_ui.cjs` (conductual + cableado) |
| MEDIO-08 | Rollback no transaccional para documentos reubicados (dedup de `README_R14.md` sin registrar; copias a `docs\historial\parches\acumulados` no retiradas) | `Relocate-LegacyRootDocs` registra TODA mutación antes de ejecutarla: dedup con backup + `RootDocsMoved`; copias a acumulados en `$RelocatedDests` (rollback retira creadas y restaura sobreescritas vía `.dest_previo`) | `test_v15_10_1_r15_4_instalador_base.py` |
| MEDIO-09 | `resultado_caso.py` agregaba cualquier `frame_max_inflado` con tiempo > 0 sin exigir estado ⇒ no-confirmados convertidos en métrica genérica del caso y exportados sin etiqueta | Agregación separada por estado: mediana confirmada sólo con `estado == maximo_inflado_estimado`; nuevos `tiempo_max_inflado_no_confirmado_ms`, `max_inflado_estado`, soportes separados; evidencias etiquetadas por video (`estado_secuencia`); la censura 0 ms se recoge por auditabilidad pero no alimenta métricas. Excel: columnas NUEVAS al final («Estado máximo inflado», «Máximo visible NO CONFIRMADO ms») es/en/de — posiciones legacy 1–23 intactas. UI: badge «NO CONFIRMADO» por video y por caso; «Sin anomalías automáticas» sólo con máximo confirmado | `test_v15_10_1_r15_2_maximo_censurado.py` + `test_v15_10_1_r15_2_ui_maximo_no_confirmado.cjs` + fixtures R13 actualizadas (SUPERSEDE documentado: la mediana confirmada exige estado explícito) |
| BAJO-10 | README raíz seguía declarando V15.8.1 | Bloque de versión reescrito: V15.10.1 · R15.1, instalación vigente `INSTALAR_R15_1`, enlace a este changelog | `test_documentacion_organizada.py` (enlaces resuelven) |
| BAJO-11 | Prueba de concurrencia no hermética: copiaba el estado global existente; en instalación usada con checkpoint `completado` daba falso rojo | Fixture fija estado inicial SEGURO conocido (`inactivo`, sin `ejecucion_id`) conservando la estructura de claves | `test_v15_10_1_r15_concurrencia.py` |

## Fases y commits

| Fase | Contenido | Commit(s) |
|---|---|---|
| 1 | CRÍTICO-01 + ALTO-02: primitiva `mutar_documento`, migración de los 7 writers legacy, CAS estricto, monotonía global | RED en `6c2f85c` + GREEN `5d58657` |
| 2 | ALTO-06 + MEDIO-09: censura explícita de Tmax, estados separados hasta Excel/UI | `6356ef4` |
| 3 | MEDIO-07: fuente única por recurso + guardas compartidas | `6356ef4` |
| 4 | ALTO-03/04/05 + MEDIO-08: instalador `INSTALAR_R15_1` (fail-closed, base conocida, identidad r15.1, rollback de reubicaciones) | `67e47ce` |
| 5 | BAJO-10 + BAJO-11 + empaquetado (manifiesto con VERSION.txt, simulaciones limpio/usado, evidencia) | este commit |

## Cambios de contrato documentados (SUPERSEDE)

1. **CAS estricto (ALTO-02):** los endpoints de video rechazan con 409 peticiones sin `expected_revision` sobre documentos ya versionados. Los clientes deben encadenar `revision_documento` de cada respuesta (el frontend R15 ya lo hace; `test_maximos_video.py` no requiere cambios porque su fixture no versiona el documento).
2. **Respuestas con `revision_documento`:** campo manual, sin-datos, verificar imagen, corrección OCR, rotación y restaurar con-texto devuelven ahora `revision_documento` tras el commit.
3. **`corregir_lectura` (OCR):** el 500 «no se pudo persistir su clasificación» desaparece — la escritura verificada (`lanzar=True`) propaga el error real y NUNCA se devuelve éxito con guardado fallido.
4. **`guardar_rotacion`:** las evidencias del gestor se registran DESPUÉS del commit del documento, con el delta resultante del documento fresco (el documento es la fuente de verdad).
5. **Mediana confirmada de Tmax (MEDIO-09):** `tiempo_max_inflado_estimado_ms` del caso sólo agrega videos con `estado == maximo_inflado_estimado`; `max_inflado_soporte` cuenta confirmados. Los no confirmados viajan en campos separados. Secuencias legacy sin campo `estado` no alimentan la métrica confirmada (todos los documentos R13+ lo incluyen).
6. **Fixtures R13** (`test_v15_10_1_r13_breakout_maximo.py`): añaden `estado` explícito a `secuencia_despliegue_r13` (contrato 5).
7. **Instalador:** `INSTALAR_R15.ps1/.bat` → `INSTALAR_R15_1.ps1/.bat`; identidad manifiesto/marker/backup r15 → r15.1; `test_v15_10_1_r15_instalador.py` y `test_v15_10_1_r14_auditoria_preventiva.py` siguen el release.

## Limitaciones conocidas

- **Sin pwsh en CI:** las pruebas del instalador son estáticas (código fuente), mismo criterio que R14/R15. La ejecución real en Windows con fallo inducido (criterio de liberación del auditor) queda como validación de campo pendiente, igual que AVI reales, GPU Windows y navegador real.
- **Lock de proceso único:** `mutar_documento` serializa escritores DENTRO del proceso backend. Un segundo proceso escribiendo el mismo JSON a la vez sigue fuera del contrato (igual que en R15); el instalador exige V-Matrix cerrado precisamente por esto.
- **Censura de Tmax:** el umbral 50 % del pico para «evidencia previa limpia» en frame 0 es conservador y documentado; no sustituye un trigger eléctrico real (R16).
- **Consolidación:** la fusión de preferencias de exportación toma el documento fresco como fuente; documentos externos se validan antes del lock (comportamiento heredado de R15).

## Criterios de liberación del auditor — estado

| Criterio | Estado |
|---|---|
| 0 pérdidas de actualización entre cualquier par de endpoints que modifiquen `validacion_resultados.json` | CERRADO (Fase 1; pruebas 2/3/5/10 concurrentes heterogéneas) |
| Revisión monotónica global | CERRADO (Fase 1; defensa en profundidad + consolidación) |
| 0 Tmax confirmado en 0 ms con evento censurado al inicio | CERRADO (Fase 2) |
| Ninguna respuesta inicial vieja sobrescribe el primer poll | CERRADO (Fase 3) |
| Instalador rechaza base incorrecta | CERRADO (Fase 4, estático; ejecución Windows pendiente de campo) |
| VERSION.txt/backend/frontend/marker reportan la misma versión | CERRADO (Fase 4) |
| Rollback real verificado en Windows | PENDIENTE DE CAMPO (código de rollback completo y probado estáticamente; el sandbox no tiene pwsh/Windows) |
