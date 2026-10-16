# CHANGELOG R15.6 — V-Matrix V15.10.1-r15.6

**Fecha:** 2026-10-16 · **Identidad:** `15.10.1-r15.6` · **Base del patch:** `69b1900`
(V15.9.10 + overlay R14). Parche acumulativo sobre R14/R15/R15.1/R15.2/R15.3/
R15.4/R15.5.

**Origen:** auditoría independiente de R15.5
(`AUDITORIA_INDEPENDIENTE_R15_5_20261016.md`, veredicto «Release Candidate
para pruebas controladas; NO Production Ready»). R15.6 cierra los hallazgos
reproducidos SIN funciones nuevas — sólo infraestructura de consistencia,
exactamente el «alcance mínimo recomendado» del auditor (§11).

---

## 1. Hallazgos cerrados

| Hallazgo | Título | Fase | Commit |
|---|---|---|---|
| CRÍTICO-01 | Corrección manual de campo persistía aunque la petición fallara | F1 | `218ea89` |
| MEDIO-06 | Rutas multi-efecto fuera del coordinador (no-texto, lote, anotación región, externas) | F1 | `218ea89` |
| ALTO-02 | Doble fallo en `corregir_lectura` sin registro de inconsistencia | F2 | `981453a` |
| ALTO-11 | Edición de zona persistía aunque fallara la revisión | F2 | `981453a` |
| ALTO-08 | `editar_zona` ignoraba la reserva del pipeline (TOCTOU) | F3 | `51a2e58` |
| ALTO-09 | Orientación regional cambiaba durante la reserva | F3 | `51a2e58` |
| ALTO-10 | Revisión cerrable como `completada` con pipeline activo | F3 | `51a2e58` |
| ALTO-03 | Registro de inconsistencias fail-open (escritura y arranque) | F4 | `1f582e9` |
| MEDIO-05 | Sin flujo público de recuperación; mensaje pedía borrado manual | F4+F6 | `1f582e9`, `40eb226` |
| ALTO-04 | Lost update entre dos pestañas en `pruebas_externas.json` | F5 | `a50512f` |
| BAJO-07 | Inventario Node/documentación no generado desde el árbol real | F6+F7 | `40eb226`, build automático |

Detalle por hallazgo: `INFORME_R15_6_POR_HALLAZGO.md`. Matriz de evidencia:
`MATRIZ_EVIDENCIA_R15_6.md`.

## 2. Cambios principales

### F1 — Helper único «efecto humano + estado de revisión» (Causa A)

* `_transaccion_efecto_humano()` sobre `TransaccionMultiAlmacen`: snapshot
  común (evidencias de imagen + revisión) → efectos SQLite → revisión humana
  → commit documental/externo SIEMPRE al final; fallo ⇒ restauración
  VERIFICADA; doble fallo ⇒ inconsistencia durable + bloqueo.
* Migrados: `marcar_region_no_texto`, `marcar_regiones_no_texto_lote` (ahora
  ATÓMICO: si una marca falla se compensan todas), `anotar_region_no_detectada`,
  `corregir_campo_caso` (CRÍTICO-01: la revisión durable se aplica ANTES del
  commit documental y es compensable), `corregir_prueba_externa`,
  `anotar_region_externa`.
* `snapshot_evidencias_imagen` ampliado con `regiones_no_texto`,
  `anotaciones_regiones` y `orientaciones_region`.
* `_aprendizaje_opcional()`: el entrenamiento automático post-commit nunca
  revierte la confirmación humana (política HIGH-01 de R15.5 generalizada).

### F2 — `corregir_lectura` y `editar_zona` bajo el coordinador

* `corregir_lectura` en TODAS sus ramas (incluidas `ilegible`/`no_es_campo`,
  que antes no capturaban snapshot): doble fallo ⇒ registro durable +
  bloqueo del caso; rollback manual duplicado eliminado.
* `editar_zona` (`guardar`/`deshacer`/`guardar_bloque`): edición + aprendizaje
  + revisión en una sola transacción compensable.
* **Bug latente corregido:** la compensación de zonas usaba `WHERE id IN`
  sobre `ediciones_zona_detalle`, cuya PK es `edicion_id` — la restauración
  de ediciones SIEMPRE fallaba en silencio (`no such column: id`).

### F3 — Guard uniforme de pipeline (Causa B)

* `_assert_pipeline_inactivo(accion, incluir_reanalisis=…)`: hilo vivo +
  reserva del slot + estado de procesamiento (+ reanálisis opcional) en un
  único punto; sustituye los checks locales `is_alive()`.
* `POST /api/revisiones` con `estado="completada"` (carpeta) exige pipeline
  inactivo y sin reanálisis en curso.
* Prueba automática de inventario: cualquier writer de `actualizar_revision`
  fuera del coordinador rompe la suite (plan P1 ítem 9 del auditor).

### F4 — Recuperación fail-closed (Causa D)

* `_escribir_json_verificado()`: temporal + fsync + replace + relectura.
* Registro no escribible o ilegible al arrancar ⇒ **MODO RECUPERACIÓN** con
  centinela durable (`recuperacion_requerida.json`) que sobrevive reinicios;
  guards de documento/pipeline/recurso/video bloquean (503) en ese modo.
* API pública: `GET /api/recuperacion/inconsistencias`,
  `POST /api/recuperacion/inconsistencias/{recurso}/resolver`,
  `POST /api/recuperacion/modo-recuperacion/resolver` — resolución sólo con
  `confirmo_verificacion=true`, escritura verificada (si falla, el bloqueo se
  mantiene) y auditoría durable de quién/cuándo (`inconsistencias_resueltas.json`).
* Los mensajes ya NO piden borrar archivos a mano.

### F5 — Autoridad del documento externo (Causa C)

* Las ramas externas de rotación, sin-datos y con-texto corren bajo
  `_pdoc.lock_documento(salida)`: lectura fresca → CAS `expected_revision`
  (409 sin efectos) → patch → commit verificado con `revision_documento`
  monotónica (`_commit_documento_externo`).
* `pruebas_externas._commit_documento_completo()` para la regeneración de
  `evaluar`: lock por ruta y revisión que NUNCA retrocede.
* Dos pestañas que marcan pruebas externas distintas preservan AMBOS cambios.

### F6 — UI formal de recuperación + inventarios reales (BAJO-07)

* Componente `EstadoRecuperacion` en el centro de notificaciones: lista
  bloqueos, anuncia el MODO RECUPERACIÓN con motivo/fecha y los resuelve con
  usuario + confirmación explícita (API, nunca borrado manual).
* Inventario Node del árbol: **39 archivos `.cjs` activos, 39/39 verdes**
  (generado desde el árbol real, no cifra manual).

### F7 — Identidad e instalador

* `VERSION.txt` / `PATCH_BUILD` / cache-busting ×5 / README ⇒ `15.10.1-r15.6`.
* `INSTALAR_R15_6.bat/.ps1`: bases acumulativas r14→r15.6, marker
  `PATCH_INSTALLED_V15_10_1_R15_6.json`, backup `_BACKUP_PRE_R15_6_`, salidas
  `PARCHE_R15_6_COPIADO_Y_VERIFICADO_OK` / `R15_6_VERIFICADO_OK`,
  `Relocate-LegacyRootDocs` con sufijo `_root_pre_R15_6`.
* SUPERSEDE documentado (precedente `9a50dc7`): retirados `INSTALAR_R15_5.*`
  y su test de identidad; el pin de versión de la preventiva R14 sigue el
  release.

## 3. Validación (cifras ejecutadas, no manuales)

* Suite backend en HEAD final de desarrollo: **1045 passed / 0 failed /
  5 skipped** (los 5 skips son los tests históricos del instalador R15, que
  sólo existe en su paquete distribuible) + **node 39/39** (cwd = raíz del
  árbol) — ver `SUITE_R15_6_final.txt` (3 pasadas consecutivas).
* Cada fase con RED→GREEN documentado en `evidencia/ejecucion/`
  (12 logs RED/GREEN R15.6 + históricos R15→R15.5).
* Simulaciones de instalación A (limpia), B (usada) y C (upgrade R15.5→R15.6)
  con suite completa: ver `MATRIZ_EVIDENCIA_R15_6.md` §5 y logs
  `SIM_R15_6_*.txt`.
* Pruebas adversariales de la auditoría incorporadas al suite oficial
  (plan P1): **40 pruebas nuevas** en 5 archivos `test_v15_10_1_r156_*.py`
  (cifra por `--collect-only`) + 1 `.cjs` de UI.

## 4. Alcance y exclusiones

* SIN funciones nuevas; SIN cambios en motor OCR, Tmax/semáforo ni plantilla
  Excel (recomendación explícita del auditor para esta ronda).
* R16 fuera de alcance.

## 5. Pendiente de campo (no se declara producción)

1. Instalador y rollback en Windows real (CIM/WMI, proceso activo, `-Force`,
   archivo bloqueado, fallo a mitad) — el sandbox no dispone de PowerShell.
2. Calibración de Tmax/semáforo con AVI reales y ground truth humano.
3. Soak de 100–200 análisis en la máquina Windows objetivo (CPU/GPU real).

## 6. Instalación

* Paquete completo: ejecutar `INSTALAR_R15_6.bat` (o `.ps1`) desde la raíz
  extraída del ZIP. Bases aceptadas: V15.9.10+R14 instalado, o R15/R15.1/
  R15.2/R15.3/R15.4/R15.5/R15.6.
* Sólo código: `V-MATRIX_R15_6.patch` aplica sobre `69b1900`
  (`git apply` / `patch -p1`); verificado byte a byte contra el payload.
* Verificación: `verificar_sha256.sh` / `VERIFICAR_SHA256.ps1` y
  `MANIFEST_SHA256_R15_6.txt` (payload instalable).
