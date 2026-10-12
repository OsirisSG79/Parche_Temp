# Cambios V15.9 — Apertura · ROI · Zoom · Matriz (V-Matrix OCR)

**Entrega:** mejora V15.9.0 (plan `PLAN_V_MATRIX_V15_9_APERTURA_ROI_ZOOM_MATRIZ`)
aplicada sobre **V15.8.1**, rama local `codex/ocr-v15-9-apertura-roi-zoom-matriz`.
El repositorio de GitHub es de sólo lectura: esta entrega es un parche local,
sin push ni PR.

## Contenido del zip

- `cambios_V15_9.patch` — diff completo (aplicable con
  `git apply cambios_V15_9.patch` sobre una copia limpia de V15.8.1).
- `archivos/` — **archivos modificados y nuevos completos**, con la misma
  estructura de carpetas del proyecto (copia y reemplaza).
- `CAMBIOS_V15_9.md` — este documento.

## Qué mejora (por fase)

1. **Fase 0.5 · Rangos antes de procesar**: al pulsar «Procesar carpeta»
   aparece «Configurar rangos de apertura» **antes de cualquier trabajo**
   (verde ≤ 6.0 ms y amarillo ≤ 7.0 ms por defecto). Validación estricta
   (finitos, no negativos, `0 ≤ verde < amarillo`), acciones
   «Procesar con estos rangos» / «Usar predeterminados (6 / 7 ms)» /
   «Cancelar» y casilla opcional «Guardar para próximas carpetas». Cada
   ejecución guarda una **instantánea de criterios** (V, A, origen, usuario,
   fecha) que alimenta dashboard y Excel por igual. ES/EN/DE.
2. **Fase 1 · Detector**: flujo de dos momentos (aparición corroborada →
   retroceso al primer cambio conectado), puntuaciones separadas
   (fisura / tela clara / abombamiento / reflejo / movimiento de cámara /
   ruido), baseline robusto, estado `evento_al_inicio` sin inventar el
   nacimiento y `razones_evento` guardadas por video.
3. **Fase 2 · ROI**: ROI general y microzona de nacimiento **distintas**;
   ROI manual bloqueada y persistente; sugerencia automática sólo con
   confirmación explícita (aceptar/ajustar/bloquear/revertir); una imagen
   pertenece a un solo visor y la transformación imagen↔visor es única.
4. **Fase 3 · Zoom**: 100/200/400/800 % + ajuste a pantalla, rueda,
   doble clic, pantalla completa, atajos `+`/`−`/`0`/`F`/`L`, lupa temporal
   F−1/F/F+1 con el mismo punto espacial y overlays independientes
   (ROI / Sugerida / Nacimiento).
5. **Fase 4 · Matriz completa**: una sola definición de columnas
   (HT/RT/NT × UGL/OGL/NOM, cupos 5/10 con expansión) para dashboard y
   Excel; posiciones vacantes en gris tenue (sin ID ni tiempo) y con
   leyenda propia; motivos de gris trazables; grupo «Sin clasificar» con
   causa y enlace al Listado; nunca 0 ms inventado ni identificadores
   falsos; 1ST/2ST intactos.
6. **Fase 5 · Consenso**: 3 de 4 cámaras comparables confirman; menos
   respaldo queda «pendiente de revisión» (`propuesto`/`discordancia`) con
   `tiempo_propuesto_ms` **sin aplicar**; salidas separadas (primer
   instante confiable por cámara + resultado consolidado); estados
   `confirmado/propuesto/discordancia/sin_evento/sin_datos`; la
   confirmación humana tiene prioridad sobre el consenso automático.
7. **Fase 6 · Unificación y verificación**: el semáforo vive sólo en
   `utilidades/matriz_apertura.py` + `criterios_usuario.py` (Excel y
   dashboard lo comparten; `analisis_video.py` legado no duplica reglas);
   cachés acotadas y con identidad de archivo (`firma_contenido`,
   `_CACHE_RELOJ_MAX`).

## Pruebas

- `python -m pytest pruebas/` → **462 aprobadas**, 1 falla conocida de
  entorno (`test_dashboard.py::test_estado_config_y_frontend` exige datos
  procesados; falla igual en V15.8.1 sin carpeta procesada).
- `node --test pruebas/*.cjs` (24 archivos) → **24/24 en verde**
  (incluye `test_v15_9_apertura_zoom_ui.cjs`).
- Pruebas nuevas: `test_v15_9_criterios_ejecucion.py`,
  `test_v15_9_matriz_completa.py`, `test_v15_9_detector_dos_momentos.py`,
  `test_v15_9_consenso_3_de_4.py`, `test_v15_9_apertura_zoom_ui.cjs`.

## Garantías de publicación

- No se rompen revisiones ni reglas anteriores.
- Nunca se inventan tiempos ni se sustituye la ausencia de medición por 0 ms.
- No se alteran ROIs confirmadas por el usuario.
- Identificadores 1ST/2ST del Excel intactos.
- ES/EN/DE; ejecución local sin internet.

## Pendiente de validación con datos reales

Sin videos de ensayo en el repositorio quedan pendientes: exactitud ±1
cuadro (30 casos), acuerdo ≥ 0.95 con revisión humana (30 casos), umbral
3-de-4 con lote real de 4 cámaras y criterio de `reflejo` con reflejos
reales. Ver `archivos/docs/informes/RESULTADOS_PRUEBAS_V15_9.md`.

## Cómo aplicar

1. Respaldar el proyecto (o trabajar en rama local).
2. Copiar el contenido de `archivos/` sobre el proyecto (archivos completos),
   o bien `git apply cambios_V15_9.patch` sobre V15.8.1 limpia.
3. Ejecutar `python -m pytest pruebas/` y `node --test pruebas/*.cjs`.
4. Reiniciar el dashboard.
