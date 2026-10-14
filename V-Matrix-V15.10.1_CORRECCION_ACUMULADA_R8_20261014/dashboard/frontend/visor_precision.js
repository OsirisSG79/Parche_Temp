/* Capa geométrica común para visores OCR y video. Sin dependencias ni bundler. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VMatrixVisorPrecision = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const finito = (valor, respaldo = 0) => Number.isFinite(Number(valor)) ? Number(valor) : respaldo;
  const limitar = (valor, minimo, maximo) => Math.max(minimo, Math.min(maximo, valor));

  function sourceToViewportPoint(punto, transformacion) {
    const ancho = finito(transformacion?.sourceWidth);
    const alto = finito(transformacion?.sourceHeight);
    const escala = finito(transformacion?.scale,
      finito(transformacion?.renderedWidth) / Math.max(ancho, 1));
    if (!(ancho > 0 && alto > 0 && escala > 0)) return null;
    const angulo = finito(transformacion?.rotationDeg) * Math.PI / 180;
    const cos = Math.cos(angulo), sen = Math.sin(angulo);
    const dx = (finito(punto?.x) - ancho / 2) * escala;
    const dy = (finito(punto?.y) - alto / 2) * escala;
    return {
      x: finito(transformacion?.centerX) + cos * dx - sen * dy,
      y: finito(transformacion?.centerY) + sen * dx + cos * dy,
    };
  }

  function viewportToSourcePoint(punto, transformacion, clamp = true) {
    const ancho = finito(transformacion?.sourceWidth);
    const alto = finito(transformacion?.sourceHeight);
    const escala = finito(transformacion?.scale,
      finito(transformacion?.renderedWidth) / Math.max(ancho, 1));
    if (!(ancho > 0 && alto > 0 && escala > 0)) return null;
    const angulo = finito(transformacion?.rotationDeg) * Math.PI / 180;
    const cos = Math.cos(angulo), sen = Math.sin(angulo);
    const dx = finito(punto?.x) - finito(transformacion?.centerX);
    const dy = finito(punto?.y) - finito(transformacion?.centerY);
    const x = cos * dx + sen * dy;
    const y = -sen * dx + cos * dy;
    const resultado = { x: x / escala + ancho / 2, y: y / escala + alto / 2 };
    return clamp
      ? { x: limitar(resultado.x, 0, ancho), y: limitar(resultado.y, 0, alto) }
      : resultado;
  }

  // Mapea un punto del viewport a un rectángulo fuente [x1,y1,x2,y2].
  // Se usa para ROIs normalizadas de video y para vistas recortadas de imagen.
  function viewportPointToBox(punto, viewport, cajaFuente, clamp = true) {
    if (!Array.isArray(cajaFuente) || cajaFuente.length !== 4) return null;
    const ancho = finito(viewport?.width), alto = finito(viewport?.height);
    if (!(ancho > 0 && alto > 0)) return null;
    let u = (finito(punto?.x) - finito(viewport?.left)) / ancho;
    let v = (finito(punto?.y) - finito(viewport?.top)) / alto;
    if (clamp) { u = limitar(u, 0, 1); v = limitar(v, 0, 1); }
    const [x1, y1, x2, y2] = cajaFuente.map((valor) => finito(valor));
    return { x: x1 + u * (x2 - x1), y: y1 + v * (y2 - y1) };
  }

  function boxPointToViewport(punto, viewport, cajaFuente) {
    if (!Array.isArray(cajaFuente) || cajaFuente.length !== 4) return null;
    const ancho = finito(viewport?.width), alto = finito(viewport?.height);
    const [x1, y1, x2, y2] = cajaFuente.map((valor) => finito(valor));
    if (!(ancho > 0 && alto > 0 && x2 !== x1 && y2 !== y1)) return null;
    return {
      x: finito(viewport?.left) + ((finito(punto?.x) - x1) / (x2 - x1)) * ancho,
      y: finito(viewport?.top) + ((finito(punto?.y) - y1) / (y2 - y1)) * alto,
    };
  }

  function xywhToPercent(caja, anchoFuente, altoFuente) {
    if (!Array.isArray(caja) || caja.length < 4) return null;
    const ancho = finito(anchoFuente), alto = finito(altoFuente);
    if (!(ancho > 0 && alto > 0)) return null;
    const [x, y, w, h] = caja.slice(0, 4).map((valor) => finito(valor));
    return {
      left: `${x / ancho * 100}%`, top: `${y / alto * 100}%`,
      width: `${w / ancho * 100}%`, height: `${h / alto * 100}%`,
    };
  }

  function xyxyToPercent(caja) {
    if (!Array.isArray(caja) || caja.length !== 4) return null;
    const [x1, y1, x2, y2] = caja.map((valor) => finito(valor));
    return {
      left: `${x1 * 100}%`, top: `${y1 * 100}%`,
      width: `${Math.max(0, x2 - x1) * 100}%`,
      height: `${Math.max(0, y2 - y1) * 100}%`,
    };
  }

  function childBoxToParentPercent(cajaHija, cajaPadre) {
    if (!Array.isArray(cajaHija) || cajaHija.length !== 4
        || !Array.isArray(cajaPadre) || cajaPadre.length !== 4) return null;
    const [px1, py1, px2, py2] = cajaPadre.map((valor) => finito(valor));
    const [x1, y1, x2, y2] = cajaHija.map((valor) => finito(valor));
    const ancho = px2 - px1, alto = py2 - py1;
    if (ancho === 0 || alto === 0) return null;
    return xyxyToPercent([
      (x1 - px1) / ancho, (y1 - py1) / alto,
      (x2 - px1) / ancho, (y2 - py1) / alto,
    ]);
  }

  function captureZoomAnchor(elemento, clientX, clientY) {
    if (!elemento?.getBoundingClientRect) return null;
    const rect = elemento.getBoundingClientRect();
    const x = finito(clientX) - rect.left - finito(elemento.clientLeft);
    const y = finito(clientY) - rect.top - finito(elemento.clientTop);
    const ancho = Math.max(1, finito(elemento.scrollWidth, elemento.clientWidth));
    const alto = Math.max(1, finito(elemento.scrollHeight, elemento.clientHeight));
    return {
      x: (finito(elemento.scrollLeft) + x) / ancho,
      y: (finito(elemento.scrollTop) + y) / alto,
      localX: x,
      localY: y,
    };
  }

  function restoreZoomAnchor(elemento, ancla) {
    if (!elemento || !ancla) return false;
    const ancho = Math.max(1, finito(elemento.scrollWidth, elemento.clientWidth));
    const alto = Math.max(1, finito(elemento.scrollHeight, elemento.clientHeight));
    elemento.scrollLeft = limitar(ancla.x * ancho - ancla.localX, 0,
      Math.max(0, ancho - finito(elemento.clientWidth)));
    elemento.scrollTop = limitar(ancla.y * alto - ancla.localY, 0,
      Math.max(0, alto - finito(elemento.clientHeight)));
    return true;
  }

  function zoomAtPointer(elemento, evento, actualizarZoom, scheduler) {
    if (!evento || typeof actualizarZoom !== "function") {
      actualizarZoom?.();
      return null;
    }
    const ancla = captureZoomAnchor(elemento, evento.clientX, evento.clientY);
    actualizarZoom();
    const programa = scheduler || (typeof requestAnimationFrame === "function"
      ? requestAnimationFrame.bind(globalThis) : null);
    if (ancla && programa) programa(() => restoreZoomAnchor(elemento, ancla));
    return ancla;
  }

  return Object.freeze({
    sourceToViewportPoint,
    viewportToSourcePoint,
    viewportPointToBox,
    boxPointToViewport,
    xywhToPercent,
    xyxyToPercent,
    childBoxToParentPercent,
    captureZoomAnchor,
    restoreZoomAnchor,
    zoomAtPointer,
  });
});
