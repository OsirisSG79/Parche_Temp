# INFORME R15.4 — Corrección por hallazgo

Auditoría fuente: `AUDITORIA_INDEPENDIENTE_R15_3_20261015.md` (veredicto: R15.3 instalable para pruebas, NO Production Ready; bloquea HIGH-01).
Versión: 15.10.1-r15.4 · Fecha: 2026-10-15 · Correctiva pequeña y enfocada, SIN funciones nuevas.
Regla Tmax vigente: sin evidencia suficiente ⇒ NO CONFIRMADO y caso a revisión/azul.

---

## HIGH-01 — Efecto persistente sobrevive al fallo del commit documental final

**Qué decía la auditoría.** R15.3 cerró «409 ⇒ cero efectos», pero quedaba otra ventana: CAS validado → efecto externo persistido (SQLite / revisión manual de video) → fallo de `escribir_json_seguro` (disco, permisos, antivirus, archivo bloqueado) → la petición termina en error con el efecto YA aplicado. Repros independientes del auditor: `marcar_imagen_sin_datos` (fila queda en SQLite), `corregir_lectura` (corrección queda en SQLite), `revisar_video` (revisión durable sigue existiendo). Impacto: dos fuentes internas diciendo cosas distintas. Recomendación: transacción compensable (capturar estado anterior → aplicar efecto → commit → si falla, restaurar) y `EscrituraFallida` → error HTTP controlado, preferiblemente 503, con mensaje claro.

**Qué se hizo (F1, commit `49d761b`).**

- Detección uniforme: `_es_fallo_escritura_documento(exc)` reconoce `EscrituraFallida` directa o encadenada como `__cause__` (el documento global la envuelve).
- Mensaje único: `_MSG_GUARDADO_FALLO` — «No se pudo guardar el documento de resultados (disco, permisos o archivo bloqueado). El cambio NO se aplicó…» + extensión específica por ruta. Traducción a **HTTP 503** en las 6 rutas con efectos externos: `marcar_imagen_sin_datos`, `corregir_lectura`, `restaurar_imagen_con_texto`, `revisar_video`, `aprender_zona_video`, `revertir_zona_video`. Nunca se afirma que el cambio se guardó.
- Compensación real por almacén:
  - SQLite: snapshot del registro anterior (`obtener_registro`) y de la estrategia; fallo de commit ⇒ restauración del snapshot o eliminación del registro creado (`eliminar_registro`).
  - Revisiones de video: nueva primitiva `restaurar_revisiones(ruta, revisiones_anteriores)` en `video_airbag.py` (escritura atómica tolerante, mismo criterio que el resto del almacén); fallo de commit en `revisar_video` ⇒ se restaura la lista previa.
  - Zonas aprendidas: `restaurar_perfil_zona` (existente) con fallback a `eliminar_zona_aprendida` cuando el snapshot era `None` (ValueError documentado) en `aprender_zona_video` y `revertir_zona_video`.
  - La compensación se ejecuta en `except BaseException` (no sólo `Exception`) y re-lanza el fallo original traducido a 503.
- Limitación documentada: `guardar_ejemplo_evento` (dataset append-only de ejemplos, rama «confirmado» de `revisar_video`) NO se compensa; no afecta decisiones ni almacenes de estado.

**Pruebas (RED-first).** `test_v15_10_1_r154_compensacion_multialmacen.py` — 8 pruebas. RED inicial: 7 failed / 1 passed (`RED_R15_4_F1_compensacion.txt`): fallo inyectado parcheando SÓLO `pdoc.escribir_json_seguro` (no el de `utilidades.persistencia`). GREEN: 8/8 + suite 975/0 (`GREEN_R15_4_F1_compensacion.txt`). Cubren: los 3 repros del auditor con verificación de que el almacén externo vuelve a su estado anterior, compensación de revisión de video, compensación de zona con restauración y con eliminación, texto del 503 (no afirma guardado), y no-compensación en éxito.

**Estado: CERRADO.**

---

## MEDIUM-02 — Lock documental sostenido durante el análisis de video

**Qué decía la auditoría.** `aprender_zona_video` mantenía `_lock_documento()` durante el análisis completo (decodificación + estimación de apertura: segundos). Impacto de usuario: cualquier otra mutación bloqueada; timeout percibido como cuelgue. Recomendación: acortar el lock (no sostenerlo durante análisis pesado) y reserva de operación/busy explícito (409/423 inmediato) para edición incompatible.

**Qué se hizo (F2, commit `62b394e`).**

- Flujo de 3 fases en `aprender_zona_video`:
  1. Lock CORTO: CAS + snapshot de la zona + aplicación de ROI.
  2. `analizar_video` FUERA del lock (422 por análisis inválido conserva la ROI — contrato previo sin cambio).
  3. Lock CORTO de reentrada: CAS FRESCO (revisión leída del disco, no la del prechequeo) + commit; `except BaseException` ⇒ compensación de ROI (restaurar snapshot o eliminar) y 503 si el fallo es de escritura.
- Reserva de operación por recurso: `_operaciones_lock` + `_operaciones_activas` + `_reservar_operacion(ruta, accion)` → si ya hay una operación sobre el MISMO video, **423 inmediato**: «Otra operación sobre este video está en curso ({accion}, iniciada {inicio}). Espera a que termine e inténtalo de nuevo.» + `_liberar_operacion` en `finally`. `revertir_zona_video` comparte la reserva (try/finally envolviendo el cuerpo desde el pre-chequeo de decodificación).
- Consecuencia documentada (SUPERSEDE): durante la fase 2 otra mutación puede commitear; el CAS fresco de la fase 3 la detecta ⇒ 409 sin commit (antes era imposible por el lock largo).

**Pruebas (RED-first).** `test_v15_10_1_r154_lock_corto.py` — 5 pruebas. RED: 5 failed (`RED_R15_4_F2_lock_corto.txt`). GREEN: 5/5 + suite 980/0 + node 37/37 (`GREEN_R15_4_F2_lock_corto.txt`). Cubren: lock libre DURANTE el análisis (evento seteado desde dentro del análisis stubbeado demuestra que otra mutación puede tomar el lock), 423 aprender/aprender y aprender/revertir, CAS fresco en reentrada (mutación externa entre fases ⇒ 409 sin commit), liberación de la reserva tras éxito y tras fallo. Ajuste documentado: `revertir` exige historial ⇒ los tests guardan DOS ROIs (la primera queda en historial).

**Estado: CERRADO.**

---

## MEDIUM-03 — Checkpoint histórico presentado como resultado actual

**Qué decía la auditoría.** Si falta `validacion_resultados.json`, `/api/pruebas` recurría a `resultados_parciales` del checkpoint: una instalación usada con checkpoint `completado` mostraba resultados viejos como actuales (repro del auditor). Recomendación: listado consciente del estado del checkpoint; los parciales históricos nunca deben presentarse como actuales.

**Qué se hizo (F3, commit `c5af614`).**

- Backend (`/api/pruebas`): `_ESTADOS_CHECKPOINT_VIGENTE` = {procesando, pausando, pausado, cancelando, reanudando, detenido_con_avance} (estados realmente en curso o reanudables).
  - Sin documento oficial + parciales + estado NO vigente ⇒ **503**: «El documento oficial de resultados (validacion_resultados.json) no existe. Se conserva un checkpoint de una corrida en estado '{estado}' (ejecución {id}, progreso {p}%). Esos resultados parciales NO se muestran como actuales: reprocesa el lote o restaura el documento oficial.»
  - Sin documento + estado vigente ⇒ parciales con `fuente="checkpoint_recuperacion"` (por fila y en la respuesta).
  - Con documento ⇒ `fuente="documento"` y los parciales de corrida finalizada NO pisan filas.
  - Ámbito verificado: el detalle `/api/pruebas/{clave}` ya respondía 404 limpio sin fallback ⇒ no se toca.
- Frontend: componente `AvisoCheckpointRecuperacion` (role=status, aria-live=polite) montado en `VistaGeneral`; `EstadoError` recibe ahora `mensaje` del backend (`pedirJSON` propaga el `detail` del servidor) ⇒ el 503 de recuperación es VISIBLE; i18n EN/DE de las cadenas nuevas en `i18n.js`.

**Pruebas (RED-first).** `test_v15_10_1_r154_checkpoint_seguro.py` — 8 pruebas; helper que siembra un parcial público viejo (origen=carpeta, nombre PARCIAL-VIEJO) con el documento oficial borrado. RED: 7 failed / 1 passed (`RED_R15_4_F3_checkpoint_seguro.txt`). GREEN: 8/8; regresión dirigida de consumidores del listado (r11 resumen live, r12 estado/decisión, dashboard, r15.2 CAS UI): 51/51; suite 988/0 (`GREEN_R15_4_F3_checkpoint_seguro.txt`). `test_v15_10_1_r154_aviso_checkpoint.cjs`: render REAL con el vendor (React+htm) — el aviso aparece sólo con `fuente="checkpoint_recuperacion"`, sin etiquetas literales, con role=status; cableado e i18n verificados; el inventario activo pasa a 38 (38/38).

**Volteo documentado (detectado por la simulación B).** Sobre una instalación usada con checkpoint histórico sembrado en disco, `test_documento_ausente_no_inventa_revision` (R15.2) esperaba 404 ante documento ausente y el contrato nuevo responde 503 de recuperación. La prueba aísla ahora explícitamente el caso SIN checkpoint (su invariante original: no inventar revisión ⇒ 404 intacto); el caso CON checkpoint histórico es precisamente el comportamiento pedido por la auditoría y lo cubre `test_v15_10_1_r154_checkpoint_seguro.py`. Contrato reemplazado a propósito, no edición para verdear.

**Estado: CERRADO.**

---

## MEDIUM/LOW-04 — Anomalía de rendimiento dependiente del orden

**Qué decía la auditoría.** En su entorno, `test_v15_7_detector_apertura.py` completo podía volver anormalmente lenta la última prueba (o exceder timeout); aislada, segundos. Reproducido también sobre R15.2 ⇒ no es regresión R15.3. Riesgo: acumulación de recursos OpenCV, handles, caché u otro estado tras análisis consecutivos. Recomendación: soak test de 50–100 análisis consecutivos midiendo tiempo por iteración, memoria, handles, liberación de `VideoCapture` y estado de caché.

**Qué se hizo (F4, commit `83ce235`).**

- Diagnóstico medido en el sandbox (Linux): duraciones aisladas ≈ dentro del archivo completo (tabla completa en `GREEN_R15_4_F4_soak.txt`; p. ej. `test_bolsa_de_pocos_pixeles_en_cuadro_grande` 19.98 s aislada vs 20.02 s en archivo; la última 1.56 s vs 1.43 s) ⇒ SIN degradación dependiente del orden aquí; el total (~56 s) es inherente a la generación + análisis de videos sintéticos por prueba.
- Soak test permanente: `test_v15_10_1_r154_soak_analisis_video.py` (2 pruebas) — **100 análisis consecutivos reales** (`analizar_video`, `usar_cache=False`, rutas de caché/revisiones/aprendizaje redirigidas a tmp): mediana de las 10 últimas ≤ 2.5× la de las 10 primeras; crecimiento RSS ≤ 60 MB; descriptores abiertos +≤5 (Linux ⇒ `VideoCapture` liberado); `len(_cache_reloj) ≤ _CACHE_RELOJ_MAX` (cota declarada del módulo). + ciclo explícito `VideoCapture` open/read/release ×50 con cota de fds.
- Resultado: 100 análisis en ~10 s, verde desde la primera ejecución (no hay defecto que reproducir en este entorno — el entregable es la monitorización + el diagnóstico, como pidió el auditor).

**Estado: CERRADO (monitorizado).** La anomalía específica del entorno del auditor no es reproducible en el sandbox; el soak queda como red permanente y FIELD (Windows real) sigue aplicando.

---

## LOW-05 — Inventario Node de evidencia

**Qué decía la auditoría.** El paquete documentaba 37 pruebas Node activas; el árbol instalado del auditor contenía 38 y las 38 pasaban. Pedía diferenciar: pruebas incluidas por el parche / heredadas de la base instalada / total realmente ejecutado sobre el producto final.

**Qué se hizo (F6, documental).** Tabla exacta en `CHANGELOG_R15_4.md` (sección «Inventario de pruebas») y en la matriz, con comandos reproducibles:

- Activos ejecutados (`pruebas/*.cjs`): **38** — 38/38 verdes en dev y en las 3 simulaciones (el nuevo `test_v15_10_1_r154_aviso_checkpoint.cjs` de F3 explica el +1 frente a los 37 de R15.3; el conteo del auditor sobre su árbol queda así reconciliado).
- Incluidos/actualizados por el parche acumulado R14→R15.4: **13** (5 nuevos + 8 heredados actualizados; todos en `MANIFEST_SHA256_R15_4.txt`).
- Heredados de la base sin tocar: **25** (base 69b1900 tenía 33 activos).
- Copias históricas de archivo (NO ejecutadas, en subcarpetas de archivo dentro de `pruebas/`): **8**. Total repo: **46**.
- Python: 990 passed / 0 failed en dev; simulaciones 974 passed + 16 skipped esperados (15 instalador por diseño + 1 plataforma).

**Estado: CERRADO.**

---

## FIELD-06 — Instalador Windows: validación física pendiente

**Qué decía la auditoría.** Inspección estática y simulación correctas (identidad y manifiesto OK), pero no fue posible ejecutar PowerShell real, CIM/WMI real, procesos V-Matrix abiertos, bloqueo antivirus, permisos NTFS, UAC ni rollback tras fallo de copia. Antes de producción, matriz en máquina Windows representativa.

**Qué se hizo.** Nada ejecutable en sandbox (sin pwsh, mismo criterio que R14→R15.3). R15.4 mantiene las pruebas estáticas del instalador al día (identidad r15.4, bases acumulativas r14→r15.4, marker por contenido, backup `_BACKUP_PRE_R15_4_`, postflight con regex de versión) y deja la matriz de campo intacta y pendiente: proceso activo, CIM/WMI caído, fallback, `-Force`, archivo bloqueado, error a mitad, rollback, reinstalación. **No se declara producción.**

**Estado: PENDIENTE DE CAMPO (sin cambio respecto a R15.3).**

---

## Regresión y evidencia global

| Ámbito | Resultado | Evidencia |
|---|---|---|
| Suite Python completa (árbol dev, HEAD F6) | **990 passed / 0 failed** | `GREEN_R15_4_F5_identidad.txt` (cola de suite) + ejecución de empaquetado |
| Node `.cjs` activos | **38/38** | ídem |
| Dirigidas por fase | F1 8/8 · F2 5/5 · F3 8/8+1 cjs · F4 2/2 · F5 22/22 | `GREEN_R15_4_F1..F5*.txt` |
| RED-first por fase | F1 7F/1P · F2 5F · F3 7F/1P · F5 8F/14P (fiel sobre `83ce235`+rename) | `RED_R15_4_F1/F2/F3/F5*.txt` |
| Simulaciones de instalación A (limpia), B (usada), C (upgrade R15.3→R15.4) | verdes, 974P+16S c/u | `evidencia/ejecucion/` del paquete |
| Commits | F1 `49d761b` · F2 `62b394e` · F3 `c5af614` · F4 `83ce235` · F5 `7848bff` · F6 (docs+paquete) | `git log` |
