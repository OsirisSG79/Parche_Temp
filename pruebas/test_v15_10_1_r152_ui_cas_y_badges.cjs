/* R15.2 · MEDIO-05 + ALTO-04 (frontend) — auditoría independiente R15.1.
 *
 * MEDIO-05: las insignias «NO CONFIRMADO» se construyen interpolando la
 * cadena "<strong>NO CONFIRMADO</strong>" dentro de un template htm: React la
 * renderiza como TEXTO LITERAL (el usuario ve las etiquetas). Corrección: un
 * helper que devuelve elementos reales (html`` anidado), probado con RENDER
 * real del vendor (React + htm), no con regex: textContent sin etiquetas y
 * un nodo <strong> de verdad.
 *
 * ALTO-04: toda mutación humana del documento debe enviar expected_revision
 * (la pantalla mantiene la revisión actual vía /api/pruebas y la actualiza
 * tras cada respuesta), y un 409 de conflicto debe refrescar el detalle.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const React = require(path.resolve(__dirname, '../dashboard/frontend/vendor/react.production.min.js'));
const htm = require(path.resolve(__dirname, '../dashboard/frontend/vendor/htm.umd.js'));
const html = htm.bind(React.createElement);

const src = fs.readFileSync(path.resolve(__dirname, '../dashboard/frontend/app.js'), 'utf8');

function extraerFuncion(nombre) {
  const inicio = src.indexOf(`function ${nombre}(`);
  assert.ok(inicio >= 0, `app.js no define ${nombre}()`);
  const fin = src.indexOf('\n}', inicio);
  assert.ok(fin > inicio, `no se encuentra el cierre de ${nombre}()`);
  return src.slice(inicio, fin + 2);
}

function textoDe(nodo) {
  if (nodo == null || nodo === false) return '';
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join('');
  if (nodo.props) return textoDe(nodo.props.children);
  return '';
}

function tiposDe(nodo, acumulador = []) {
  if (nodo == null || nodo === false) return acumulador;
  if (Array.isArray(nodo)) { nodo.forEach((n) => tiposDe(n, acumulador)); return acumulador; }
  if (typeof nodo === 'object' && nodo.type) {
    acumulador.push(nodo.type);
    tiposDe(nodo.props.children, acumulador);
  }
  return acumulador;
}

// --- MEDIO-05: render REAL de la insignia (sin etiquetas literales) --------
const fuenteBadge = extraerFuncion('maximoNoConfirmadoBadge');
const construir = new Function('html', `${fuenteBadge}; return maximoNoConfirmadoBadge;`);
const badge = construir(html);
const t = (s) => s; // identidad: el i18n real se prueba en los tests de i18n

for (const estado of ['sin_maximo_defendible', 'maximo_visible_observado_no_confirmado']) {
  const nodo = badge(estado, t);
  const texto = textoDe(nodo);
  assert.ok(!/[<>]/.test(texto),
    `MEDIO-05: el render contiene etiquetas literales para ${estado}: ${texto}`);
  assert.ok(texto.includes('NO CONFIRMADO'), `falta NO CONFIRMADO para ${estado}: ${texto}`);
  assert.ok(tiposDe(nodo).includes('strong'),
    `MEDIO-05: no hay un elemento <strong> real para ${estado}`);
}
assert.strictEqual(badge('maximo_inflado_estimado', t), null,
  'el estado confirmado no debe llevar insignia');
assert.strictEqual(badge(null, t), null, 'sin estado no hay insignia');

// Los dos sitios que antes interpolaban la cadena rota deben usar el helper;
// la única construcción con <strong> permitida vive DENTRO del html`` del
// helper (elemento real), no en cadenas interpoladas de las plantillas.
const usos = src.split('maximoNoConfirmadoBadge(').length - 1;
assert.ok(usos >= 3, `esperados definición + 2 usos del helper, hay ${usos}`);
const fuertes = src.split('· <strong>${t("NO CONFIRMADO")}').length - 1;
assert.strictEqual(fuertes, 1,
  `la etiqueta <strong> sólo debe existir en el html\`\` del helper (hay ${fuertes})`);

// --- ALTO-04: detección de conflicto 409 (helper puro, conductual) ---------
const fuenteConflicto = extraerFuncion('esConflictoRevision');
const esConflicto = new Function(`${fuenteConflicto}; return esConflictoRevision;`)();
assert.strictEqual(esConflicto('Los datos cambiaron (revisión 4, esperada 3); recarga antes de guardar.'), true);
assert.strictEqual(esConflicto('El documento ya está versionado (revisión 2) y esta petición no envía expected_revision; recarga la pantalla y reintenta.'), true);
assert.strictEqual(esConflicto('La revisión está completada. Reábrela antes de editar.'), false);
assert.strictEqual(esConflicto(undefined), false);

// --- ALTO-04: las 5 mutaciones legacy de VistaDetalle envían expected_revision
// (ancladas a SU función: TarjetaExterna tiene llamadas propias fuera de alcance)
const VISTA_DETALLE = src.indexOf('function VistaDetalle(');
assert.ok(VISTA_DETALLE >= 0, 'no se encuentra el componente VistaDetalle');
function bloqueDesde(fn, url) {
  // Dentro de VistaDetalle: TarjetaExterna tiene homónimos fuera de alcance
  // (las externas usan SU documento, no el global versionado).
  const fnInicio = src.indexOf(`async function ${fn}(`, VISTA_DETALLE);
  assert.ok(fnInicio >= 0, `no se encuentra ${fn}() en VistaDetalle`);
  const inicio = url.startsWith('/') ? src.indexOf(url, fnInicio)
    : src.indexOf(url, fnInicio);
  assert.ok(inicio >= 0, `no se encuentra ${url} dentro de ${fn}()`);
  const fin = src.indexOf('});', inicio);
  assert.ok(fin > inicio, `bloque incompleto para ${url}`);
  return src.slice(inicio, fin + 3);
}
const CAS = /expected_revision: detalle\?\.revision_documento \?\? null/;
for (const [fn, url] of [
  ['confirmarCorreccion', 'enviarJSON("/api/aprendizaje/correcciones"'],
  ['rotarImagen', 'enviarJSON("/api/aprendizaje/rotaciones"'],
  ['marcarSinDatos', 'restaurar ? "/api/imagenes/con-texto" : "/api/imagenes/sin-datos"'],
  ['verificarImagen', 'enviarJSON("/api/imagenes/verificar"'],
  ['guardarCampoManual', '/campos/${encodeURIComponent(campoManual)}`'],
]) {
  const bloque = bloqueDesde(fn, url);
  assert.ok(CAS.test(bloque), `ALTO-04: ${fn} (${url}) no envía expected_revision`);
}

// Los catch de esas mutaciones refrescan el detalle ante un 409 de conflicto.
const refrescos = src.split('refrescarTrasConflicto(error)').length - 1;
assert.ok(refrescos >= 5,
  `ALTO-04: se esperan >=5 manejadores de conflicto en VistaDetalle, hay ${refrescos}`);
assert.ok(src.includes('async function refrescarTrasConflicto(error)'),
  'falta el helper refrescarTrasConflicto en VistaDetalle');

console.log('OK R15.2 UI: insignias renderizadas sin etiquetas literales + CAS cableado');
