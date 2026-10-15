const assert = require('assert');
const path = require('path');
const visor = require(path.resolve(__dirname, '../dashboard/frontend/visor_precision.js'));

// Trackpad: deltas pequeños deben producir cambios pequeños, no saltos mínimos de 3%+.
const z1 = visor.zoomSuavePorRueda(200, -2, 100, 1000, 0.0018, 0);
assert(z1 > 200 && z1 < 202, `zoom trackpad demasiado brusco: ${z1}`);
const z2 = visor.zoomSuavePorRueda(200, -100, 100, 1000, 0.0018, 0);
assert(z2 > z1 && z2 < 250, `zoom rueda fuera de rango cómodo: ${z2}`);

// DOM_DELTA_LINE se normaliza de forma explícita.
assert.strictEqual(visor.normalizarDeltaRueda(2, 1), 32);
assert.strictEqual(visor.normalizarDeltaRueda(1, 2), 240); // clamp de página

// Los botones siguen siendo progresivos y limitados.
assert.strictEqual(visor.zoomSuavePorPaso(100, 1, 100, 1000, 1.2), 120);
assert.strictEqual(visor.zoomSuavePorPaso(1000, 1, 100, 1000, 1.2), 1000);

// Pan nunca puede mostrar fondos fuera del contenido.
const fake = {scrollWidth:1000, clientWidth:400, scrollHeight:800, clientHeight:300};
assert.deepStrictEqual(visor.panLimitado(fake, -50, 900), {left:0, top:500});
assert.deepStrictEqual(visor.panLimitado(fake, 550, 200), {left:550, top:200});

console.log('OK R13 zoom continuo/trackpad/pan limitado');
