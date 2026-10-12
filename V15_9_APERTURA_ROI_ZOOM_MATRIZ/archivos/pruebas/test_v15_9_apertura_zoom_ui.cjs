/** V15.9 · contratos de interfaz: rangos previos a procesar, zoom/lupa y matriz completa. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(raiz, "dashboard", "frontend", "app.js"), "utf8");
const css = fs.readFileSync(path.join(raiz, "dashboard", "frontend", "estilos.css"), "utf8");
const i18n = fs.readFileSync(path.join(raiz, "dashboard", "frontend", "i18n.js"), "utf8");

test("diálogo de rangos se abre ANTES de procesar y valida límites", () => {
  for (const cadena of [
    "Configurar rangos de apertura", "Verde hasta (ms)", "Amarillo hasta (ms)",
    "Procesar con estos rangos", "Usar predeterminados (6 / 7 ms)",
    "Guardar para próximas carpetas", "Cancelar",
    "0 ≤ verde < amarillo", "Escribe dos números finitos",
    "Los límites no pueden ser negativos.", "Combinación definitiva:",
    "dialogo-rangos-vista-previa", "Vista previa del semáforo",
    "dialogoRangos", "confirmarProcesamiento", "rango_apertura",
    "verde_max: rango.verde_max, amarillo_max: rango.amarillo_max",
    "origen: rango.origen, guardar_preferencia: !!rango.guardar_preferencia",
  ]) {
    assert.ok(app.includes(cadena), `Falta en app.js: ${cadena}`);
  }
  // «Procesar carpeta» abre el diálogo primero; el trabajo empieza sólo al confirmar.
  const iProcesar = app.indexOf("const procesar = async (ev) => {");
  assert.ok(iProcesar >= 0, "Falta VistaCarga.procesar");
  const cuerpo = app.slice(iProcesar, app.indexOf("const confirmarProcesamiento", iProcesar));
  assert.ok(cuerpo.includes("setDialogoRangos(true)"), "procesar() debe abrir el diálogo");
  assert.ok(!cuerpo.includes("/api/pipeline"), "procesar() no debe iniciar el pipeline por sí solo");
  const iConfirmar = app.indexOf("const confirmarProcesamiento", iProcesar);
  const confirmar = app.slice(iConfirmar, iConfirmar + 1600);
  assert.ok(confirmar.includes("/api/pipeline"), "confirmarProcesamiento envía el pipeline");
  assert.ok(confirmar.includes("rango_apertura"), "confirmarProcesamiento envía rango_apertura");
  // El diálogo valida la combinación antes de habilitar «Procesar con estos rangos».
  const iDialogo = app.indexOf("function DialogoRangosApertura");
  assert.ok(iDialogo > 0, "Falta DialogoRangosApertura");
  const dialogo = app.slice(iDialogo, iDialogo + 6400);
  assert.ok(dialogo.includes("validar(vRaw, aRaw)"), "El diálogo valida los límites");
  assert.ok(dialogo.includes("procesarConCampos(\"elegido\")"), "Acción con rangos elegidos");
  assert.ok(dialogo.includes("procesarConCampos(\"predeterminado\")"), "Acción con predeterminados");
  assert.ok(dialogo.includes("guardar_preferencia"), "El diálogo envía guardar_preferencia");
  assert.ok(dialogo.includes("checked=${guardarPreferencia}"), "El checkbox parte sin marcar");
  for (const clase of ["dialogo-rangos", "dialogo-rangos-campos",
                       "dialogo-rangos-guardar", "dialogo-rangos-acciones"]) {
    assert.ok(css.includes(clase), `Falta estilo: ${clase}`);
  }
});

test("zoom del video: 100/200/400/800, rueda, doble clic, fullscreen y lupa F±1", () => {
  for (const cadena of [
    "video-inspector-barra", "video-inspector-marco", "video-inspector-overlays",
    "video-lupa-temporal", "video-lupa-panel", "Ajustar a pantalla", "Lupa F±1",
    "PASOS_ZOOM", "zoomInspector", "zoomPaso", "ruedaZoomInspector",
    "dobleClicZoom", "pantallaCompleta", "setLupaActiva",
    "Lupa temporal F-1/F/F+1 (tecla L)",
  ]) {
    assert.ok(app.includes(cadena), `Falta en app.js: ${cadena}`);
  }
  // El marco usa la rueda y la imagen el doble clic; el teclado tiene +/−/0/F/L.
  assert.ok(app.includes("onWheel=${ruedaZoomInspector}"), "Falta zoom con rueda");
  assert.ok(app.includes("onDblClick=${dobleClicZoom}"), "Falta zoom con doble clic");
  const iTeclas = app.indexOf("function tecladoVideo(e) {");
  assert.ok(iTeclas >= 0, "Falta tecladoVideo");
  const teclas = app.slice(iTeclas, iTeclas + 1400);
  for (const t of ["zoomPaso(1)", "zoomPaso(-1)", "setZoomInspector(100)",
                   "pantallaCompleta()", "setLupaActiva((v) => !v)"]) {
    assert.ok(teclas.includes(t), `Atajo faltante en tecladoVideo: ${t}`);
  }
  // Overlays independientes (ROI / sugerida / nacimiento) y lupa de F-1,F,F+1.
  for (const t of ["overlayRoi", "overlaySugerida", "overlayNacimiento",
                   "F (actual)", "F−1", "F+1",
                   "Mismo punto espacial en los tres cuadros"]) {
    assert.ok(app.includes(t), `Falta en app.js: ${t}`);
  }
  for (const clase of ["video-inspector-barra", "video-inspector-marco",
                       "video-lupa-temporal", "video-lupa-panel", "boton-compacto"]) {
    assert.ok(css.includes(clase), `Falta estilo: ${clase}`);
  }
});

test("matriz completa: vacantes, sin clasificar y cupos", () => {
  for (const cadena of [
    "matriz-celda-vacante", "Vacante (posición sin caso)",
    "matriz-sin-clasificar", "matriz-columna-cupos", "matriz-celda-fuera",
    "Sin clasificar (", "sin_clasificar",
    "Todas las posiciones esperadas se muestran",
    "esperados", "Posición esperada sin caso asignado",
    "motivo_estado", "abrir en Listado",
  ]) {
    assert.ok(app.includes(cadena), `Falta en app.js: ${cadena}`);
  }
  // El gris de caso y el gris de vacante se distinguen por clase y leyenda.
  const iMatriz = app.indexOf("function MatrizApertura(");
  const matriz = app.slice(iMatriz, iMatriz + 5200);
  assert.ok(matriz.includes("matriz-celda-vacia"), "Se conserva la celda vacía legada");
  assert.ok(matriz.includes("paleta.vacante"), "La vacante tiene color propio");
  assert.ok(matriz.includes("item.tipo === \"vacante\""), "Las vacantes se renderizan aparte");
});

test("i18n del diálogo de rangos en inglés y alemán", () => {
  for (const cadena of [
    "Configure opening ranges", "Process with these ranges", "Use defaults (6 / 7 ms)",
    "Save for next folders (permanent preference)", "Vacant (position without case)",
    "Öffnungsbereiche konfigurieren", "Mit diesen Bereichen verarbeiten",
    "Standardwerte verwenden (6 / 7 ms)", "Für nächste Ordner speichern",
    "Frei (Position ohne Fall)",
  ]) {
    assert.ok(i18n.includes(cadena), `Falta traducción: ${cadena}`);
  }
  // Las claves V15.8 siguen publicadas.
  assert.ok(i18n.includes("Save selected thresholds"));
  assert.ok(i18n.includes("Gewählte Grenzwerte speichern"));
});
