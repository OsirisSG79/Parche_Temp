/* R15.4 · MEDIUM-03 (frontend) — aviso de recuperación de checkpoint.
 *
 * El listado debe comunicar visiblemente cuando las filas provienen del
 * checkpoint (documento oficial ausente) en vez de presentarlas como
 * actuales. Render REAL con el vendor (React + htm), no regex: el aviso es
 * un elemento con role="status" y texto sin etiquetas literales; con
 * fuente="documento" no se renderiza nada.
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

const t = (s) => s; // identidad: las traducciones se prueban en los tests i18n
const fuente = extraerFuncion('AvisoCheckpointRecuperacion');
const construir = new Function('html', 't', `${fuente}; return AvisoCheckpointRecuperacion;`);
const Aviso = construir(html, t);

// 1) fuente=documento ⇒ nada (sin avisos fantasma)
assert.strictEqual(Aviso({ fuente: 'documento' }), null,
  'con fuente=documento el aviso no debe renderizarse');
assert.strictEqual(Aviso({ fuente: undefined }), null,
  'sin fuente el aviso no debe renderizarse');

// 2) fuente=checkpoint_recuperacion ⇒ elemento real con role=status
const nodo = Aviso({ fuente: 'checkpoint_recuperacion' });
assert.ok(nodo && nodo.props, 'el aviso debe ser un elemento React real');
assert.strictEqual(nodo.props.role, 'status', 'el aviso debe ser role="status"');
assert.strictEqual(nodo.props['aria-live'], 'polite');
const texto = textoDe(nodo);
assert.ok(!/[<>]/.test(texto), `el aviso no debe tener etiquetas literales: ${texto}`);
assert.ok(texto.includes('Vista de recuperación'),
  `el aviso debe anunciar la recuperación; dijo: ${texto}`);
assert.ok(texto.includes('documento oficial'),
  `el aviso debe mencionar el documento oficial; dijo: ${texto}`);

// 3) Cableado: el listado usa el componente y el error muestra el mensaje del
//    servidor (mensaje claro de recuperación/error, MEDIUM-03).
assert.ok(src.includes('<${AvisoCheckpointRecuperacion} fuente=${filas?.fuente} />'),
  'VistaGeneral debe montar el aviso de recuperación');
assert.ok(src.includes('html`<${EstadoError} mensaje=${(errorFilas || errorConfig)?.message} />`'),
  'EstadoError debe recibir el mensaje del backend (p. ej. el 503 de recuperación)');

// 4) i18n: la cadena larga del aviso tiene traducción EN y DE.
const i18n = fs.readFileSync(path.resolve(__dirname, '../dashboard/frontend/i18n.js'), 'utf8');
const clave = 'No existe el documento oficial de resultados; estas filas provienen del checkpoint de una corrida en curso o recuperable.';
assert.ok(i18n.includes(`"${clave}":"The official results document`),
  'falta la traducción EN del aviso de recuperación');
assert.ok(i18n.includes(`"${clave}":"Das offizielle Ergebnisdokument`),
  'falta la traducción DE del aviso de recuperación');

console.log('OK R15.4 · aviso de recuperación de checkpoint (render real + cableado + i18n)');
