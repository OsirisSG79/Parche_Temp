/* R15.1 · Fase 3 — Carrera de pantalla cerrada (auditoría R15: MEDIO-07).
 *
 * "Al montar la pantalla todavía hace una petición inicial refrescar() y acto
 * seguido inicia el sondeo serial. Esas dos solicitudes no comparten la misma
 * guarda de secuencia." El mismo patrón existía en VistaTabla: useApi(rutaFilas)
 * + sondeo en paralelo.
 *
 * Corrección exigida: una sola fuente por recurso — el sondeo serial ejecuta
 * también la primera consulta (iniciar() ya la dispara de inmediato) y toda
 * escritura de estado pasa por la MISMA guarda de secuencia.
 *
 * Parte conductual (el patrón de guarda compartida descarta la respuesta
 * inicial lenta) + parte de cableado sobre el fuente de app.js.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const red = require(path.resolve(__dirname, '../dashboard/frontend/red_segura.js'));

(async () => {
  // --- Conductual: respuesta inicial LENTA no sobrescribe el poll RÁPIDO ---
  const guarda = red.crearGuardaSecuencia();
  const pantalla = [];
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  const inicial = (async () => {           // petición inicial (lenta, 80 ms)
    const token = guarda.siguiente();
    await dormir(80);
    if (guarda.esVigente(token)) pantalla.push('VIEJO');
  })();
  await dormir(10);
  const poll = (async () => {               // primer ciclo del sondeo (10 ms)
    const token = guarda.siguiente();
    await dormir(10);
    if (guarda.esVigente(token)) pantalla.push('NUEVO');
  })();
  await Promise.all([inicial, poll]);
  assert.deepStrictEqual(pantalla, ['NUEVO'],
    'la respuesta inicial vieja no debe sobrescribir el poll nuevo');

  // --- Cableado: app.js ---
  const src = fs.readFileSync('dashboard/frontend/app.js', 'utf8');

  // Pantalla principal: refrescar() comparte la guarda con el sondeo.
  if (!/guardaEstadoRef/.test(src)) {
    throw new Error('refrescar() no comparte la guarda de secuencia con el sondeo (guardaEstadoRef)');
  }
  // El montaje ya no lanza refrescar()/refrescarReanalisisVideos() en paralelo
  // al primer ciclo del sondeo (el sondeo ejecuta la primera consulta).
  const montaje = src.split('useEffect(() => {')
    .find((b) => b.includes('sondeo.iniciar()') && b.includes('refrescarPlantillas'));
  if (!montaje) throw new Error('no se localiza el effect de montaje del sondeo principal');
  if (/^\s*refrescar\(\);/m.test(montaje.split('sondeo.iniciar()')[0])) {
    throw new Error('el montaje todavía llama refrescar() en paralelo al sondeo');
  }
  if (/refrescarReanalisisVideos\(\);/.test(montaje.split('sondeo.iniciar()')[0])) {
    throw new Error('el montaje todavía llama refrescarReanalisisVideos() en paralelo al sondeo');
  }
  // VistaTabla: una sola fuente por recurso — el sondeo hace la primera consulta.
  if (src.includes('useApi(rutaFilas')) {
    throw new Error('VistaTabla todavía hace petición inicial useApi(rutaFilas) en paralelo al sondeo');
  }
  console.log('OK R15.1 Fase 3: carrera de pantalla cerrada (guarda compartida + fuente única)');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
