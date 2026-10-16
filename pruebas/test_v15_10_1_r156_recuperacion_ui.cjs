// R15.6 · F6 (MEDIO-05) — UI formal de recuperación.
// La auditoría R15.5 exige un flujo público (no sólo API) para listar,
// diagnosticar y resolver inconsistencias, y prohíbe pedir al usuario que
// borre archivos manualmente.
const fs = require('fs');
const assert = require('assert');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../dashboard/frontend/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../dashboard/frontend/estilos.css'), 'utf8');

assert(source.includes('function EstadoRecuperacion()'),
  'debe existir el componente EstadoRecuperacion');
assert(source.includes('<${EstadoRecuperacion} />'),
  'el componente debe montarse en el centro de notificaciones');
assert(source.includes('/api/recuperacion/inconsistencias'),
  'la UI debe consultar el listado público de inconsistencias');
assert(source.includes('/api/recuperacion/inconsistencias/'),
  'la UI debe llamar al resolver por recurso');
assert(source.includes('/resolver'), 'ruta del resolver presente');
assert(source.includes('/api/recuperacion/modo-recuperacion/resolver'),
  'la UI debe poder limpiar el modo recuperación sin entradas activas');
assert(source.includes('confirmo_verificacion: true'),
  'la resolución exige confirmación explícita de verificación');
assert(source.includes('MODO RECUPERACIÓN'),
  'el modo recuperación debe anunciarse con visibilidad');
assert(!source.includes('elimina el registro'),
  'MEDIO-05: la UI no debe pedir borrado manual de archivos');
assert(styles.includes('.estado-recuperacion'),
  'estilo propio del aviso de recuperación');
console.log('OK: R15.6 UI de recuperación — lista bloqueos durables, anuncia el modo recuperación y los resuelve con confirmación explícita (MEDIO-05).');
