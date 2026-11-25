(function (root) {
  'use strict';

  const eurFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Rundet eine Rohschrittweite auf 1, 2, 5 oder 10 mal eine Zehnerpotenz auf
  function schrittweite(roh) {
    const e = Math.pow(10, Math.floor(Math.log10(roh)));
    const f = roh / e;
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return n * e;
  }

  function kurzEuro(v) {
    if (Math.abs(v) >= 1000) return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(v / 1000)) + ' Tsd. €';
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' €';
  }

  // Zeichnet die Restschuld je Jahr als SVG in den Container (ohne Bibliothek).
  // reihen: [{name, farbe, punkte: [{x: jahr, y: betrag}], zinsbindungJahre}]
  // optionen: {breite, hoehe, beschriftung}
  function restschuld(container, reihen, optionen) {
    const o = optionen || {};
    const liste = (reihen || []).filter(function (r) { return r && r.punkte && r.punkte.length; });
    if (!container) return;
    if (!liste.length) {
      container.innerHTML = '<p class="bfc-leer">Keine Daten für das Diagramm.</p>';
      return;
    }

    const W = o.breite || 560;
    const H = o.hoehe || 300;
    const pad = { l: 84, r: 14, t: 14, b: 36 };

    let maxX = 1;
    let maxY = 0;
    liste.forEach(function (r) {
      r.punkte.forEach(function (p) {
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });
    const yStep = schrittweite(Math.max(maxY, 1) / 4);
    const yMax = yStep * 4;
    const xStep = maxX <= 10 ? 1 : 5;
    const xMax = Math.ceil(maxX / xStep) * xStep;

    const bw = W - pad.l - pad.r;
    const bh = H - pad.t - pad.b;
    const sx = function (x) { return pad.l + (x / xMax) * bw; };
    const sy = function (y) { return pad.t + bh - (y / yMax) * bh; };

    const teile = [];
    teile.push('<svg class="bfc-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      escapeHtml(o.beschriftung || 'Diagramm Restschuld') + '">');

    // Y-Gitter und Beschriftung
    for (let k = 0; k <= 4; k++) {
      const wert = yStep * k;
      const y = sy(wert);
      teile.push('<line class="bfc-gitter" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '"/>');
      teile.push('<text class="bfc-text" x="' + (pad.l - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + escapeHtml(kurzEuro(wert)) + '</text>');
    }

    // X-Beschriftung
    for (let x = 0; x <= xMax; x += xStep) {
      const px = sx(x);
      teile.push('<text class="bfc-text" x="' + px + '" y="' + (H - pad.b + 16) + '" text-anchor="middle">' + x + '</text>');
    }
    teile.push('<text class="bfc-text" x="' + (W - pad.r) + '" y="' + (H - 4) + '" text-anchor="end">Jahre</text>');

    // Achsen
    teile.push('<line class="bfc-achse" x1="' + pad.l + '" x2="' + pad.l + '" y1="' + pad.t + '" y2="' + (pad.t + bh) + '"/>');
    teile.push('<line class="bfc-achse" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + (pad.t + bh) + '" y2="' + (pad.t + bh) + '"/>');

    // Zinsbindungsende je Reihe als gestrichelte senkrechte Linie
    liste.forEach(function (r) {
      if (r.zinsbindungJahre === undefined || r.zinsbindungJahre === null) return;
      const px = sx(r.zinsbindungJahre);
      teile.push('<line class="bfc-zinsbindung" x1="' + px + '" x2="' + px + '" y1="' + pad.t + '" y2="' + (pad.t + bh) +
        '" stroke="' + escapeHtml(r.farbe || '#2563eb') + '"><title>' + escapeHtml((r.name || 'Reihe') + ': Zinsbindungsende nach ' + r.zinsbindungJahre + ' Jahren') + '</title></line>');
    });

    // Linien und Tooltip-Punkte
    liste.forEach(function (r) {
      const farbe = escapeHtml(r.farbe || '#2563eb');
      const pfad = r.punkte.map(function (p, i) {
        return (i === 0 ? 'M' : 'L') + sx(p.x).toFixed(2) + ' ' + sy(p.y).toFixed(2);
      }).join(' ');
      teile.push('<path class="bfc-linie" d="' + pfad + '" fill="none" stroke="' + farbe + '" stroke-width="2.5"/>');
      r.punkte.forEach(function (p) {
        teile.push('<circle cx="' + sx(p.x).toFixed(2) + '" cy="' + sy(p.y).toFixed(2) + '" r="3" fill="' + farbe + '">' +
          '<title>' + escapeHtml((r.name ? r.name + ' · ' : '') + 'Jahr ' + p.x + ': ' + eurFormat.format(p.y)) + '</title></circle>');
      });
    });

    teile.push('</svg>');
    container.innerHTML = teile.join('');
  }

  const api = { restschuld };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BaufiChart = api;
})(typeof self !== 'undefined' ? self : this);
