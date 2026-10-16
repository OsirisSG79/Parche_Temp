# INFORME R15.3 POR HALLAZGO — Auditoría independiente R15.2 (2026-10-15)

Metodología RED-first: cada hallazgo se reproduce en ROJO sobre el árbol
auditado (`3d7a4ef`, R15.2) antes de corregirlo, y se verifica en VERDE con
suite completa. Evidencias crudas en `evidencia/ejecucion/`
(`RED_R15_3_F*` / `GREEN_R15_3_F*`). Árbol dev final: 967 passed / 0 failed;
Node 37/37 (ámbito: `pruebas/*.cjs` activos — ver BAJO-06).

Commits: F1 `005beb6` · F2 `70762d4` · F3 `be93c68` · F4 `0b00b07` · F5 (docs
+ empaquetado) este commit.

---

## CRÍTICO-01 — Carrera de admisión: reanálisis y pipeline admitidos a la vez

**Reproducción (RED, determinista).** Se fuerza el interleaving del auditor:
(1) `reanalizar_videos` comprueba pipeline libre bajo `_pipeline_lock`;
(2) libera `_pipeline_lock`; (3) antes de tomar `_video_reanalisis_lock` se
ejecuta `iniciar_pipeline` completo (espera fuera del lock con Events);
(4) el pipeline es admitido; (5) el reanálisis continúa y TAMBIÉN es admitido.
Sobre R15.2 ambos terminan aceptados → doble uso de CPU/GPU, estados
contradictorios en UI, escrituras cruzadas.

**Causa raíz.** `iniciar_pipeline` decide bajo la región conjunta
`_pipeline_lock → _video_reanalisis_lock`, pero `reanalizar_videos` decidía en
DOS secciones separadas con una ventana intermedia sin locks.

**Corrección.** `reanalizar_videos` usa UNA sola región atómica con el mismo
orden de locks que `iniciar_pipeline`: validación de editabilidad, comprobación
de pipeline/slot, reserva de estado, creación del hilo y `start()` ocurren sin
liberar locks en medio. Ninguno de los dos procesos puede ser admitido si el
otro ya fue reservado o iniciado.

**Verificación (GREEN).** `test_v15_10_1_r153_admision_atomica.py`:
- `test_ventana_forzada_doble_admision_reanalisis_pipeline` (el interleaving
  del auditor ya no admite dos: exactamente un ganador);
- `test_carrera_admision_100_iteraciones_un_solo_ganador` (100 carreras
  concurrentes reales ⇒ 1 solo ganador siempre — criterio 1);
- regresión: concurrencia R15 + documento único R15.2 verdes.

---

## MEDIO-05 — `Thread.start()` fallido deja «preparando» fantasma

**Reproducción (RED).** Con `Thread.start` parcheado para lanzar excepción,
`reanalizar_videos` sobre R15.2 dejaba `_video_reanalisis_hilo` asignado y el
estado en `preparando` sin hilo vivo: la UI mostraba un reanálisis fantasma y
la reserva bloqueaba todo indefinidamente.

**Causa raíz.** La reserva de estado y la asignación del hilo se hacían antes
del `start()` sin compensación ante fallo.

**Corrección.** Rollback completo ante fallo de arranque: hilo=None, estado
anterior restaurado más `estado='error'` y `ultimo_error` visible, y 500
explícito al cliente — mismo criterio que `_rollback_admision_pipeline`.
Nunca `preparando` sin hilo vivo (criterio 6).

**Verificación (GREEN).** `test_fallo_thread_start_reanalisis_estado_seguro`:
tras el fallo, estado seguro + error visible + una llamada posterior válida
puede reintentar.

---

## ALTO-02 — TOCTOU CAS: 409 con efectos persistentes

**Reproducción (RED).** En `marcar_imagen_sin_datos`, `corregir_lectura`,
`revisar_video` y `aprender_zona_video` se inyecta una mutación concurrente
DENTRO del efecto durable (entre el prechequeo CAS y el CAS final). Sobre
R15.2 la petición terminaba en 409 PERO dejaba efectos persistentes:
registros SQLite de evidencia/estrategia, dataset de eventos de video, ROI
aprendida y/o revisión aplicada — «rechazada» sin ser «sin efectos».

**Causa raíz.** Patrón `precheck → side effect → CAS final`: el prechequeo no
es garantía transaccional (el documento puede cambiar entre prechequeo y
commit, y los efectos ya son durables).

**Corrección.** La autoridad de mutación cubre CAS autoritativo + efectos +
commit en la MISMA región de exclusión del documento (RLock reentrante por
ruta, ya usado por la primitiva R15.2):
- `marcar_imagen_sin_datos` y `corregir_lectura`: `with _lock_documento()`
  alrededor de prechequeo, registros sqlite/estrategia/`actualizar_revision` y
  `mutar_documento` (las rutas que no mutan documento conservan comportamiento);
- `revisar_video`: `guardar_revision_video` + dataset de eventos DENTRO de la
  región de commit, tras CAS y revalidación (`case_key`/`item` desde el fresco);
- `aprender_zona_video`: snapshot de zona + `guardar_zona_aprendida` + análisis
  + commit bajo lock; fallo de commit ⇒ COMPENSACIÓN de la ROI
  (`restaurar_perfil_zona`, y `eliminar_zona_aprendida` cuando no hay snapshot
  previo — helper transaccional nuevo en `aprendizaje_video_airbag.py`).
Invariante: **409 ⇒ cero efectos persistentes; éxito ⇒ efectos coherentes con
lo commiteado** (criterio 2). El 422 de análisis conserva la ROI (contrato
existente, documentado).

**Verificación (GREEN).** `test_v15_10_1_r153_cas_efectos.py` (17 pruebas):
las 4 rutas con mutación concurrente inyectada en el efecto, compensación de
ROI con escritura fallida, y no-regresión de éxitos (efectos visibles cuando
la petición sí commitea).

---

## ALTO-03 — `restaurar_imagen_con_texto` ignoraba la reserva de pipeline

**Reproducción (RED).** Con slot de pipeline reservado (sin hilo vivo aún),
`restaurar_imagen_con_texto` era admitida sobre R15.2: era la única mutación
humana fuera de la guarda uniforme, justo en la ventana entre admisión y
arranque del worker.

**Causa raíz.** La guarda uniforme R15.2 (`_assert_documento_editable`) no se
aplicó a esa ruta.

**Corrección.** `restaurar_imagen_con_texto` pasa por
`_assert_documento_editable()`: 409 «Termina o detén el procesamiento antes de
…» mientras el worker vive o su slot está reservado (criterio 3: TODAS las
mutaciones incompatibles bloqueadas).

**Verificación (GREEN).** Bloque de 12 endpoints × reserva sin hilo vivo en
`test_v15_10_1_r153_cas_efectos.py`.

---

## ALTO-04 (+ P2 confianza) — Tmax confirma ruido de 1 px con confianza 1.0

**Reproducción (RED, exacta del auditor).** Señal de 100 frames con área
10000 px y breakout que salta a 10001 px (+0.01 %): sobre R15.2 el analizador
devolvía `maximo_inflado_estimado` «confirmado» con `frame_max = inicio+1`,
duración 1.0 y **confianza 1.0**, sin anomalías — reproducido con breakout en
frames 1, 5 y 20. La invariante temporal R15.2 (`frame_max > frame_breakout ∧
duración > 0`) era necesaria pero no suficiente.

**Causa raíz.** No existía umbral de MAGNITUD ni exigencia de PERSISTENCIA:
cualquier crecimiento de 1 muestra superaba la mediana causal y confirmaba.

**Corrección.** Invariante de magnitud/persistencia en
`utilidades/estandar_apertura.py`, tras la regla R15.2, con constantes
documentadas (no un porcentaje arbitrario único, como pide el auditor):
- `EXPANSION_MINIMA_RELATIVA = 0.02` (2 % — escala con resolución/ROI);
- `EXPANSION_MINIMA_ABSOLUTA_PX = 25.0` (piso de ruido de segmentación);
- umbral efectivo = `max(ABS, REL × max(base, 1))` sobre el área en el frame
  de breakout;
- `PERSISTENCIA_EXPANSION_FRAMES = 3` sobre la mediana causal (suavizado);
- sin magnitud ⇒ `sin_maximo_defendible` + anomalía
  `expansion_post_breakout_insuficiente`; magnitud sin persistencia (glitch
  de 1 frame) ⇒ `maximo_visible_observado_no_confirmado`.
Los tres umbrales son parametrizables por llamada (`analizar_secuencia_
despliegue(..., expansion_minima_relativa=, expansion_minima_absoluta_px=,
persistencia_expansion_frames=)`) para calibración futura con AVI reales.

**P2 — consistencia de confianza.** Penalización −0.40 por
`expansion_post_breakout_insuficiente` y tope `CONFIANZA_MAX_NO_CONFIRMADO =
0.35` para TODO estado distinto de confirmado (antes una señal plana o un
early-return «observado» podía reportar confianza 1.0). La confianza ahora es
coherente con el estado final (criterios 4 y 5) y alimenta la insignia azul
«NO CONFIRMADO» de la UI cuando corresponde.

**Verificación (GREEN).** `test_v15_10_1_r153_tmax_magnitud.py` (11): repro
del auditor ×3 (breakout 1/5/20 ⇒ `sin_maximo_defendible`, confianza 0.35),
umbral relativo, umbral absoluto, persistencia (glitch de 1 frame ⇒ observado
no confirmado), NO-regresión de expansión real (+15 % sostenida ⇒ confirmado
con confianza 1.0), coherencia de confianza, contrato de umbrales y fuzz ×300
con la invariante global R15.2+R15.3. Batería video/apertura: 228 verdes.

---

## BAJO-06 — Evidencia/documentación de pruebas Node desactualizada

**Reproducción.** El auditor contó 38 archivos `.cjs` en su árbol (38/38
verdes) frente a los 37/37 declarados por el paquete R15.2.

**Análisis.** Conteos verificados en los árboles de este release (ámbito
declarado explícitamente, que es lo que faltaba):
- árbol dev R15.3, `pruebas/*.cjs` ACTIVOS: **37 archivos, 37/37 verdes**;
- simulaciones A y B del payload: **37/37**;
- copias históricas de archivo FUERA de `pruebas/` (no activas): **8**
  (`codigo_final_referencia/pruebas/` ×4,
  `V15_9_APERTURA_ROI_ZOOM_MATRIZ/archivos/pruebas/` ×1,
  `V-Matrix-V15.10.1_CORRECCION_ACUMULADA_R8_20261014/pruebas/` ×3);
- total `.cjs` en el repo (búsqueda global): **45**.
El conteo de 38 del auditor no es reproducible en el árbol dev ni en las
simulaciones (ambos 37); depende del ámbito del buscador empleado sobre su
checkout. No es un defecto funcional.

**Corrección (documental).** Este paquete declara conteos exactos POR ÁMBITO
en changelog, matriz y evidencia de empaquetado, de modo que cualquier
auditoría pueda reproducir la cifra declarando el mismo ámbito.

**Verificación.** Loop node de las evidencias GREEN (37/37 en dev y en sims)
+ conteos reproducibles con `ls pruebas/*.cjs | wc -l` y
`find . -name '*.cjs' -not -path './.git/*' | wc -l`.

---

## CAMPO-07 — Instalador Windows (pendiente de campo, no cerrable en sandbox)

Inspección estática R15.3 del instalador (22 pruebas verdes): manifiesto
acumulativo, hashes, preflight de procesos, fallback fail-closed, validación
de base conocida por contenido (bases r14→r15.3), backup + marker previo,
rollback, identidad final. Sin pwsh/Windows en sandbox, la matriz física del
auditor (proceso activo, CIM/WMI caído, fallback, `-Force`, archivo bloqueado,
error intencional a mitad, rollback, reinstalación) queda PENDIENTE DE CAMPO —
criterio 8. Mismo criterio y misma limitación documentada que R14/R15/R15.1/
R15.2.

---

## Lo que la auditoría dio por bueno (no tocado)

Autoridad única de escritura (`persistencia_documento.py`), migración por fila
sobre fresco, invariante temporal R15.2 de Tmax, CAS estricto + frontend con
`expected_revision`, insignia «NO CONFIRMADO» como elemento real, marker de
base validado por contenido con respaldo del previo. R15.3 no reescribe nada:
es pequeño y enfocado, como pidió el auditor.

## Pendientes de campo (heredados + criterio 8)

Instalador en Windows real (CAMPO-07/criterio 8); AVI reales para calibrar
umbrales de expansión (parametrizables, sin funciones nuevas); GPU Windows;
navegador real (render final de insignias). No se declara producción ni
precisión sin estas pruebas.
