/* R15 · Red segura en el frontend (auditoría R14: MEDIA-08, MEDIA-09,
 * MEDIA-13, BAJA-17 + MEDIA-14 lado cliente).
 *
 * Pruebas obligatorias 13 (respuesta antigua no sobrescribe la nueva) y 14
 * (máximo una solicitud activa de frame por tarjeta), más las correcciones
 * de 404 por contexto, tooltip duplicado y expected_revision en las
 * mutaciones de video.
 *
 * Parte unidad (red_segura.js) + parte de cableado (app.js/index.html).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const red = require(path.resolve(__dirname, '../dashboard/frontend/red_segura.js'));

(async () => {
  // --- Unidad: sondeo serial nunca solapa (prueba 13, causa raíz MEDIA-08) ---
  let concurrencia = 0;
  let maxConcurrencia = 0;
  let ejecuciones = 0;
  const puertas = [];
  const sondeo = red.crearSondeoSerial({
    intervaloMs: 1,
    dormir: () => Promise.resolve(),
    tarea: async () => {
      concurrencia += 1; ejecuciones += 1;
      maxConcurrencia = Math.max(maxConcurrencia, concurrencia);
      await new Promise((resolver) => puertas.push(resolver));
      concurrencia -= 1;
    },
  });
  sondeo.iniciar();
  // Mientras la primera tarea no termina, NO debe arrancar otra.
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(ejecuciones, 1, 'el sondeo serial solapó peticiones');
  puertas.shift()();
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(ejecuciones, 2, 'el sondeo no reanudó tras terminar la tarea');
  assert.strictEqual(maxConcurrencia, 1, 'hubo dos tareas en vuelo a la vez');
  sondeo.detener();
  puertas.length && puertas.shift()();
  await new Promise((r) => setTimeout(r, 20));
  const trasDetener = ejecuciones;
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(ejecuciones, trasDetener, 'detener() no cortó el bucle');
  assert.strictEqual(sondeo.iniciar(), false, 'un sondeo detenido no se reinicia');

  // --- Unidad: guarda de secuencia descarta respuestas antiguas ---
  const guarda = red.crearGuardaSecuencia();
  const t1 = guarda.siguiente();
  const t2 = guarda.siguiente();
  assert.strictEqual(guarda.esVigente(t1), false, 'respuesta antigua sigue vigente');
  assert.strictEqual(guarda.esVigente(t2), true);

  // --- Unidad: política 404 explícita (MEDIA-13) ---
  assert.strictEqual(red.lanzar404({ permitir404: false }), true);
  assert.strictEqual(red.lanzar404({ permitir404: true }), false);
  assert.strictEqual(red.lanzar404(undefined), false);

  // --- Cableado en app.js ---
  const src = fs.readFileSync(path.resolve(__dirname, '../dashboard/frontend/app.js'), 'utf8');

  // MEDIA-08: el intervalo de 1200 ms que solapaba peticiones debe haber
  // desaparecido del polling de proceso y del listado.
  assert.ok(!src.includes('setInterval(() => { refrescar(); refrescarReanalisisVideos(); }, 1200)'),
    'el polling de proceso sigue con setInterval solapable');
  assert.ok(!/setInterval\(\(\) => \{\s*pedirJSON\(rutaFilas\)/.test(src),
    'el polling del listado sigue con setInterval solapable');
  assert.ok(src.includes('crearSondeoSerial'), 'app.js no usa el sondeo serial');
  assert.ok(src.includes('crearGuardaSecuencia'), 'app.js no usa la guarda de secuencia');

  // MEDIA-13: pedirJSON con política explícita y recursos concretos en modo estricto.
  assert.ok(src.includes('permitir404'), 'pedirJSON no tiene política explícita de 404');
  assert.ok(/\/api\/video\/tiempo-frame[^;]*permitir404: false/s.test(src),
    'tiempo-frame sigue convirtiendo 404 en null silencioso');

  // MEDIA-09: frame principal con fetch + AbortController + Blob URL (prueba 14).
  const efecto = src.slice(src.indexOf('const rutaFrameSolicitada'), src.indexOf('const proporcion ='));
  assert.ok(efecto.includes('AbortController'), 'el frame no aborta la descarga anterior');
  assert.ok(efecto.includes('createObjectURL'), 'el frame no usa Blob URL');
  assert.ok(efecto.includes('fetch(rutaFrameSolicitada'), 'el frame no se descarga con fetch cancelable');
  assert.ok(!efecto.includes('img.src = rutaFrameSolicitada'),
    'el frame sigue cargando directo por URL sin cancelación');

  // MEDIA-14 (cliente): expected_revision en las mutaciones de video.
  for (const endpoint of ['/api/video/revision', '/api/video/maximo', '/api/video/zona-aprendizaje', '/api/video/zona-revertir']) {
    const re = new RegExp(`enviarJSON\\("${endpoint.replace('/', '\\/')}", \\{[^}]*expected_revision`, 's');
    const cuerpos = src.split(`enviarJSON("${endpoint}"`).length - 1;
    assert.ok(cuerpos >= 1, `falta el POST a ${endpoint}`);
    const trozos = src.split(`enviarJSON("${endpoint}"`).slice(1);
    for (const trozo of trozos) {
      assert.ok(trozo.slice(0, 700).includes('expected_revision'),
        `un POST a ${endpoint} no envía expected_revision`);
    }
    void re;
  }
  assert.ok(src.includes('revision_documento'), 'el cliente no sigue la revisión del documento');

  // BAJA-17: title duplicado del botón «Esta zona + este cuadro = apertura».
  assert.ok(!src.includes('title="Guarda esta región como zona de interés y el cuadro actual como primer cuadro de apertura"'),
    'el title genérico duplicado sigue sobrescribiendo el tooltip de evento censurado');

  // index.html carga el módulo antes que app.js.
  const idx = fs.readFileSync(path.resolve(__dirname, '../dashboard/frontend/index.html'), 'utf8');
  assert.ok(idx.includes('red_segura.js'), 'index.html no carga red_segura.js');
  assert.ok(idx.indexOf('red_segura.js') < idx.indexOf('app.js'),
    'red_segura.js debe cargarse antes que app.js');

  console.log('OK R15 red segura: sondeo serial + secuencia + 404 explícito + AbortController + CAS + tooltip');
})().catch((e) => { console.error(e.message); process.exit(1); });
