/* R15.1 · Fase 2 — UI: Tmax NO CONFIRMADO explícito (auditoría R15: ALTO-06).
 *
 * "La UI además puede mostrar «Máximo inflado automático ... 0.000 ms ...
 * Sin anomalías automáticas»". Corrección exigida: UI y Excel deben mostrar
 * explícitamente "NO CONFIRMADO" cuando el estado del máximo no es
 * maximo_inflado_estimado.
 *
 * Verificación de cableado sobre el fuente (mismo patrón que los tests
 * frontend R12/R15): app.js debe consumir el estado por video
 * (estado_max_inflado) y el estado por caso (max_inflado_estado), y existir
 * la etiqueta NO CONFIRMADO junto al render del máximo.
 */
const fs = require('fs');
const src = fs.readFileSync('dashboard/frontend/app.js', 'utf8');

if (!src.includes('estado_max_inflado')) {
  throw new Error('app.js no consume el estado del máximo por video (estado_max_inflado)');
}
if (!src.includes('max_inflado_estado')) {
  throw new Error('app.js no consume el estado del máximo por caso (max_inflado_estado)');
}
if (!src.includes('NO CONFIRMADO')) {
  throw new Error('Falta la etiqueta explícita NO CONFIRMADO en app.js');
}
if (!/maximo_inflado_estimado/.test(src)) {
  throw new Error('app.js no distingue el estado confirmado (maximo_inflado_estimado)');
}
// "Sin anomalías automáticas" no puede mostrarse para un máximo no confirmado:
// el bloque del subtítulo (4188) debe condicionar la leyenda por estado.
const subtitulo = src.split('\n').filter((l) => l.includes('Sin anomalías automáticas'))[0] || '';
if (subtitulo && !/estado_max_inflado|maximo_inflado_estimado/.test(subtitulo)) {
  throw new Error('La leyenda «Sin anomalías automáticas» no está condicionada al estado del máximo');
}
console.log('OK R15.1 Fase 2 UI: máximo NO CONFIRMADO explícito');
