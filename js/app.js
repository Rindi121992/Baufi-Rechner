(function () {
  'use strict';

  const C = window.BaufiCalc;
  const S = window.BaufiStorage;
  const CH = window.BaufiChart;

  const MAX_SZENARIEN = 6;
  const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2'];

  const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let zustand = null;
  let speicherTimer = null;

  // ---------- Hilfsfunktionen ----------

  function $(id) { return document.getElementById(id); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function pct(v, digits) {
    return (digits === 2 ? nf2 : nf1).format(v) + ' %';
  }

  function jahreMonate(m) {
    if (!m) return '–';
    return Math.floor(m / 12) + ' Jahre ' + (m % 12) + ' Monate';
  }

  function feldZahl(id) {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : 0;
  }

  function setVal(id, v) {
    const el = $(id);
    if (el) el.value = v === undefined || v === null ? '' : String(v);
  }

  function el(tag, text, klasse) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (klasse) node.className = klasse;
    return node;
  }

  function zeigeStatus(text) {
    $('status').textContent = text;
  }

  function neueId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function punkte(plan) {
    return [{ x: 0, y: plan.betrag }].concat(plan.jahre.map(function (j) {
      return { x: j.jahr, y: j.restschuld };
    }));
  }

  // ---------- Zustand ----------

  function vervollstaendigeEingaben(e) {
    const src = e || {};
    const out = Object.assign(clone(C.DEFAULTS), src);
    out.kfw = Object.assign(clone(C.DEFAULTS.kfw), src.kfw || {});
    // Altdaten mit Feld bundesland: ein abweichender Satz kam vom alten Bundesland-Default
    const altVersion = Object.prototype.hasOwnProperty.call(src, 'bundesland');
    if (out.grunderwerbsteuerSatz === undefined || out.grunderwerbsteuerSatz === null ||
        (altVersion && out.grunderwerbsteuerSatz !== C.GRUNDERWERBSTEUER_BW)) {
      out.grunderwerbsteuerSatz = C.GRUNDERWERBSTEUER_BW;
    }
    delete out.bundesland;
    if (out.objektart !== 'wohnung') out.objektart = 'haus';
    return out;
  }

  function vervollstaendigeSzenario(s) {
    return {
      id: typeof s.id === 'string' && s.id ? s.id : neueId(),
      name: typeof s.name === 'string' && s.name.trim() ? s.name : 'Szenario',
      eingaben: vervollstaendigeEingaben(s.eingaben)
    };
  }

  function standardZustand() {
    const id = neueId();
    return {
      version: 1,
      szenarien: [{ id: id, name: 'Szenario 1', eingaben: vervollstaendigeEingaben({}) }],
      aktivId: id,
      haushalt: clone(C.HAUSHALT_DEFAULTS)
    };
  }

  function normalisiere(z) {
    const szenarien = (z.szenarien || []).filter(function (s) { return s && typeof s === 'object'; })
      .map(vervollstaendigeSzenario);
    if (!szenarien.length) return standardZustand();
    const haushalt = Object.assign(clone(C.HAUSHALT_DEFAULTS), z.haushalt || {});
    delete haushalt.bewirtschaftung; // Altdaten: laufende Kosten kommen jetzt aus dem Szenario
    const out = {
      version: 1,
      szenarien: szenarien,
      aktivId: z.aktivId,
      haushalt: haushalt
    };
    if (!szenarien.some(function (s) { return s.id === out.aktivId; })) out.aktivId = szenarien[0].id;
    return out;
  }

  function aktiv() {
    return zustand.szenarien.find(function (s) { return s.id === zustand.aktivId; }) || zustand.szenarien[0];
  }

  function naechsterName() {
    const namen = zustand.szenarien.map(function (s) { return s.name; });
    let n = 1;
    while (namen.indexOf('Szenario ' + n) !== -1) n++;
    return 'Szenario ' + n;
  }

  function speichereVerzoegert() {
    clearTimeout(speicherTimer);
    speicherTimer = setTimeout(function () {
      speicherTimer = null;
      S.speichern(zustand);
    }, 300);
  }

  function speichereSofort() {
    clearTimeout(speicherTimer);
    speicherTimer = null;
    S.speichern(zustand);
  }

  function speicherungNachspuelen() {
    if (speicherTimer) speichereSofort();
  }

  // ---------- Formular lesen/schreiben ----------

  function zeigeObjektFelder(objektart) {
    $('haus-felder').hidden = objektart === 'wohnung';
    $('wohnung-felder').hidden = objektart !== 'wohnung';
  }

  function schreibeFormular() {
    const e = aktiv().eingaben;
    setVal('kaufpreis', e.kaufpreis);
    setVal('modernisierung', e.modernisierung);
    setVal('grest', e.grunderwerbsteuerSatz);
    setVal('notar', e.notarSatz);
    setVal('makler', e.maklerSatz);
    setVal('eigenkapital', e.eigenkapital);
    setVal('zins', e.zins);
    setVal('tilgung', e.tilgung);
    setVal('zinsbindung', e.zinsbindungJahre);
    setVal('sondertilgung', e.sondertilgungJahr);
    setVal('einmalkosten', e.einmalkosten);
    $(e.objektart === 'wohnung' ? 'objektart-wohnung' : 'objektart-haus').checked = true;
    zeigeObjektFelder(e.objektart);
    setVal('wohnflaeche', e.wohnflaeche);
    setVal('nebenkosten-qm', e.nebenkostenQm);
    setVal('instandhaltung-qm', e.instandhaltungQmJahr);
    setVal('hausgeld', e.hausgeld);
    setVal('wohnung-sonstiges', e.wohnungSonstiges);
    setVal('anschlusszins', e.anschlusszins);
    setVal('anschlusstilgung', e.anschlussTilgung);
    $('kfw-aktiv').checked = !!e.kfw.aktiv;
    $('kfw-felder').hidden = !e.kfw.aktiv;
    setVal('kfw-betrag', e.kfw.betrag);
    setVal('kfw-zins', e.kfw.zins);
    setVal('kfw-tilgung', e.kfw.tilgung);
    setVal('kfw-zinsbindung', e.kfw.zinsbindungJahre);

    const h = zustand.haushalt;
    setVal('netto1', h.netto1);
    setVal('netto2', h.netto2);
    setVal('sonstige', h.sonstigeEinnahmen);
    setVal('lebenshaltung', h.lebenshaltung);
    setVal('fixkosten', h.fixkosten);
    setVal('puffer', h.puffer);
    setVal('maxquote', h.maxQuote);
  }

  function leseFormular() {
    const e = aktiv().eingaben;
    e.kaufpreis = feldZahl('kaufpreis');
    e.modernisierung = feldZahl('modernisierung');
    e.grunderwerbsteuerSatz = feldZahl('grest');
    e.notarSatz = feldZahl('notar');
    e.maklerSatz = feldZahl('makler');
    e.eigenkapital = feldZahl('eigenkapital');
    e.zins = feldZahl('zins');
    e.tilgung = feldZahl('tilgung');
    e.zinsbindungJahre = Number($('zinsbindung').value);
    e.sondertilgungJahr = feldZahl('sondertilgung');
    e.einmalkosten = feldZahl('einmalkosten');
    e.objektart = $('objektart-wohnung').checked ? 'wohnung' : 'haus';
    e.wohnflaeche = feldZahl('wohnflaeche');
    e.nebenkostenQm = feldZahl('nebenkosten-qm');
    e.instandhaltungQmJahr = feldZahl('instandhaltung-qm');
    e.hausgeld = feldZahl('hausgeld');
    e.wohnungSonstiges = feldZahl('wohnung-sonstiges');
    e.anschlusszins = feldZahl('anschlusszins');
    e.anschlussTilgung = feldZahl('anschlusstilgung');
    e.kfw = {
      aktiv: $('kfw-aktiv').checked,
      betrag: feldZahl('kfw-betrag'),
      zins: feldZahl('kfw-zins'),
      tilgung: feldZahl('kfw-tilgung'),
      zinsbindungJahre: Number($('kfw-zinsbindung').value)
    };
  }

  function leseHaushalt() {
    zustand.haushalt = {
      netto1: feldZahl('netto1'),
      netto2: feldZahl('netto2'),
      sonstigeEinnahmen: feldZahl('sonstige'),
      lebenshaltung: feldZahl('lebenshaltung'),
      fixkosten: feldZahl('fixkosten'),
      puffer: feldZahl('puffer'),
      maxQuote: feldZahl('maxquote')
    };
  }

  // ---------- Rendering: Rechner ----------

  function tilgungsZeilen(plan, tbodyId) {
    const tb = $(tbodyId);
    tb.textContent = '';
    let erste2 = true;
    plan.jahre.forEach(function (j) {
      const tr = el('tr');
      if (j.phase === 2) {
        tr.className = 'phase2' + (erste2 ? ' phase2-beginn' : '');
        erste2 = false;
      }
      tr.appendChild(el('td', String(j.jahr)));
      tr.appendChild(el('td', eur0.format(j.zinsen)));
      tr.appendChild(el('td', eur0.format(j.tilgung)));
      tr.appendChild(el('td', eur0.format(j.sondertilgung)));
      tr.appendChild(el('td', eur0.format(j.restschuld)));
      tb.appendChild(tr);
    });
  }

  function renderRechner() {
    const s = aktiv();
    const e = s.eingaben;
    const f = C.finanzierung(e);
    const b = f.bank;
    const k = f.kfw;
    const nk = f.nebenkosten;

    $('out-rate').textContent = eur2.format(f.rateGesamt);
    $('out-rate-hinweis').textContent = k
      ? 'Bank ' + eur2.format(b.rate) + ' · KfW ' + eur2.format(k.rate)
      : 'Bankdarlehen, Annuität';
    $('out-gesamt').textContent = eur2.format(f.belastungGesamt);
    $('out-effektivzins').textContent = pct(f.effektivzins, 2);
    $('out-sollzins').textContent = 'Bankdarlehen · Sollzins ' + pct(e.zins, 2);

    const bew = f.bewirtschaftung;
    $('out-bew').textContent = eur0.format(bew.summe) + ' / Monat';
    $('out-bew-hinweis').textContent = e.objektart === 'wohnung'
      ? 'Hausgeld und Sonstiges ' + eur0.format(bew.nebenkosten) + ' (Rücklage im Hausgeld)'
      : 'Nebenkosten ' + eur0.format(bew.nebenkosten) + ' · Rücklage ' + eur0.format(bew.ruecklage);

    $('out-darlehen').textContent = eur0.format(f.darlehenGesamt);
    $('out-nk').textContent = eur0.format(nk.summe);

    const liste = $('out-nk-liste');
    liste.textContent = '';
    [
      ['Grunderwerbsteuer', nk.grunderwerbsteuer],
      ['Notar & Grundbuch', nk.notar],
      ['Makler', nk.makler]
    ].forEach(function (zeile) {
      liste.appendChild(el('li', zeile[0] + ': ' + eur0.format(zeile[1])));
    });

    $('out-restschuld').textContent = eur0.format(b.restschuldZinsbindung);
    $('out-anschlussrate').textContent = b.anschlussrate > 0 ? eur2.format(b.anschlussrate) : 'keine (getilgt)';
    $('out-laufzeit').textContent = jahreMonate(Math.max(b.laufzeitMonate, k ? k.laufzeitMonate : 0));
    $('out-zinsen').textContent = eur0.format(f.gesamtzinsen);
    $('out-beleihung').textContent = pct(f.beleihungsauslauf, 1);
    let hinweis = '';
    if (f.beleihungsauslauf > 100) hinweis = 'Vollfinanzierung – schwer zu bekommen';
    else if (f.beleihungsauslauf > 80) hinweis = 'Zinsaufschlag wahrscheinlich';
    $('out-beleihung-hinweis').textContent = hinweis;
    $('out-ek-quote').textContent = pct(f.eigenkapitalQuote, 1);

    $('warnung-tilgbar').hidden = f.tilgbar;
    $('kfw-plan-box').hidden = !k;

    const stressBody = $('stress-body');
    stressBody.textContent = '';
    C.stresstest(e).forEach(function (z) {
      const tr = el('tr');
      tr.appendChild(el('td', pct(z.anschlusszins, 1)));
      tr.appendChild(el('td', z.anschlussrate > 0 ? eur2.format(z.anschlussrate) : '–'));
      tr.appendChild(el('td', eur0.format(z.gesamtzinsen)));
      tr.appendChild(el('td', jahreMonate(z.laufzeitMonate) + (z.tilgbar ? '' : ' (nicht tilgbar)')));
      stressBody.appendChild(tr);
    });

    CH.restschuld($('diagramm-rechner'), [{
      name: s.name,
      farbe: PALETTE[0],
      punkte: punkte(b),
      zinsbindungJahre: e.zinsbindungJahre
    }], { beschriftung: 'Restschuld je Jahr (Bankdarlehen)' });

    tilgungsZeilen(b, 'tilgung-bank-body');
    if (k) tilgungsZeilen(k, 'tilgung-kfw-body');
  }

  // ---------- Rendering: Vergleich ----------

  function renderVergleich() {
    const szenarien = zustand.szenarien;
    const haushalt = zustand.haushalt;
    const einnahmen = C.leistbarkeit(haushalt).einnahmen;
    const ergebnisse = szenarien.map(function (s) { return C.finanzierung(s.eingaben); });

    const kopf = $('vergleich-kopf');
    kopf.textContent = '';
    kopf.appendChild(el('th', 'Kennzahl', null));
    szenarien.forEach(function (s, i) {
      const th = el('th', s.name);
      th.setAttribute('scope', 'col');
      th.style.borderTop = '4px solid ' + PALETTE[i % PALETTE.length];
      kopf.appendChild(th);
    });

    const zeilen = [
      { label: 'Kaufpreis', wert: function (s) { return eur0.format(s.eingaben.kaufpreis); } },
      { label: 'Eigenkapital', wert: function (s) { return eur0.format(s.eingaben.eigenkapital); } },
      { label: 'Kaufnebenkosten', wert: function (s, f) { return eur0.format(f.nebenkosten.summe); } },
      { label: 'Darlehen', wert: function (s, f) { return eur0.format(f.darlehenGesamt); } },
      { label: 'Sollzins', wert: function (s) { return pct(s.eingaben.zins, 2); } },
      { label: 'Effektivzins', wert: function (s, f) { return pct(f.effektivzins, 2); } },
      { label: 'Tilgung', wert: function (s) { return pct(s.eingaben.tilgung, 2); } },
      { label: 'Zinsbindung', wert: function (s) { return s.eingaben.zinsbindungJahre + ' Jahre'; } },
      { label: 'Monatsrate', wert: function (s, f) { return eur2.format(f.rateGesamt); }, zahl: function (f) { return f.rateGesamt; } },
      { label: 'Laufende Kosten', wert: function (s, f) { return eur0.format(f.bewirtschaftung.summe) + ' / Monat'; } },
      { label: 'Gesamtbelastung', wert: function (s, f) { return eur2.format(f.belastungGesamt); }, zahl: function (f) { return f.belastungGesamt; } },
      { label: 'Restschuld nach Zinsbindung', wert: function (s, f) { return eur0.format(f.restschuldZinsbindung); }, zahl: function (f) { return f.restschuldZinsbindung; } },
      { label: 'Anschlussrate', wert: function (s, f) { return f.bank.anschlussrate > 0 ? eur2.format(f.bank.anschlussrate) : '–'; } },
      { label: 'Gesamtlaufzeit', wert: function (s, f) { return jahreMonate(Math.max(f.bank.laufzeitMonate, f.kfw ? f.kfw.laufzeitMonate : 0)); } },
      { label: 'Gesamtzinsen', wert: function (s, f) { return eur0.format(f.gesamtzinsen); }, zahl: function (f) { return f.gesamtzinsen; } },
      { label: 'Beleihungsauslauf', wert: function (s, f) { return pct(f.beleihungsauslauf, 1); } },
      { label: 'Rate / Netto-Quote', ampel: true }
    ];

    const body = $('vergleich-body');
    body.textContent = '';
    zeilen.forEach(function (z) {
      const tr = el('tr');
      tr.appendChild(el('th', z.label, null));
      tr.firstChild.setAttribute('scope', 'row');

      let min = null;
      if (z.zahl && szenarien.length > 1) {
        min = Math.min.apply(null, ergebnisse.map(z.zahl));
      }

      szenarien.forEach(function (s, i) {
        const f = ergebnisse[i];
        const td = el('td');
        if (z.ampel) {
          const rate = f.rateGesamt;
          const amp = C.ampel(rate, einnahmen);
          const text = einnahmen > 0 ? pct(rate / einnahmen * 100, 1) : '–';
          const label = amp === 'gruen' ? 'gut tragbar' : amp === 'gelb' ? 'angespannt' : 'zu hoch';
          td.appendChild(el('span', text, 'ampel-' + amp));
          td.appendChild(document.createTextNode(' '));
          td.appendChild(el('span', label, 'ampel-text'));
        } else {
          td.textContent = z.wert(s, f);
          if (min !== null && z.zahl(f) === min) {
            td.className = 'bester';
            td.appendChild(el('span', ' · bester Wert', 'ampel-text'));
          }
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });

    const reihen = szenarien.map(function (s, i) {
      return {
        name: s.name,
        farbe: PALETTE[i % PALETTE.length],
        punkte: punkte(ergebnisse[i].bank),
        zinsbindungJahre: s.eingaben.zinsbindungJahre
      };
    });
    CH.restschuld($('diagramm-vergleich'), reihen, { beschriftung: 'Restschuld aller Szenarien' });

    const legende = $('legende-vergleich');
    legende.textContent = '';
    reihen.forEach(function (r) {
      const eintrag = el('span', null, 'legende-eintrag');
      const swatch = el('span', null, 'swatch');
      swatch.style.background = r.farbe;
      eintrag.appendChild(swatch);
      eintrag.appendChild(document.createTextNode(r.name));
      legende.appendChild(eintrag);
    });
  }

  // ---------- Rendering: Leistbarkeit ----------

  function berechneLeistbarkeit() {
    const e = aktiv().eingaben;
    const f = C.finanzierung(e);
    const l = C.leistbarkeit(Object.assign({}, zustand.haushalt, {
      zins: e.zins,
      tilgung: e.tilgung,
      eigenkapital: e.eigenkapital,
      nebenkostenQuote: f.nebenkosten.quote,
      bewirtschaftung: f.bewirtschaftung.summe
    }));
    return { l: l, f: f };
  }

  function renderLeistbarkeit() {
    const { l, f } = berechneLeistbarkeit();
    $('leist-szenario').textContent = aktiv().name;
    $('leist-frei').textContent = eur0.format(l.freieRate);
    $('leist-quote').textContent = eur0.format(l.quotenRate);
    $('leist-maxrate').textContent = eur0.format(l.maxRate);
    $('leist-maxdarlehen').textContent = eur0.format(l.maxDarlehen);
    $('leist-maxkaufpreis').textContent = eur0.format(l.maxKaufpreis);
    $('leist-bew-szenario').textContent = aktiv().name;
    $('leist-bew').textContent = eur0.format(f.bewirtschaftung.summe) + '/Monat';

    const amp = C.ampel(f.rateGesamt, l.einnahmen);
    const quote = l.einnahmen > 0 ? f.rateGesamt / l.einnahmen * 100 : null;
    const box = $('leist-ampel');
    box.className = 'ampel ampel-' + amp;
    $('leist-ampel-wert').textContent = quote === null ? '–' : pct(quote, 1) + ' der Einnahmen';
    let text;
    if (amp === 'gruen') text = 'Gut tragbar: die Rate liegt unter 30 % der Einnahmen.';
    else if (amp === 'gelb') text = 'Angespannt: die Rate liegt zwischen 30 und 40 % der Einnahmen.';
    else text = 'Zu hoch: die Rate liegt über 40 % der Einnahmen oder es gibt keine Einnahmen.';
    $('leist-ampel-text').textContent = text;

    const gesamtQuote = l.einnahmen > 0 ? f.belastungGesamt / l.einnahmen * 100 : null;
    $('leist-gesamt').textContent = 'Gesamtbelastung ' + eur0.format(f.belastungGesamt) + ' = ' +
      (gesamtQuote === null ? '–' : pct(gesamtQuote, 1) + ' der Einnahmen');

    $('btn-kaufpreis-uebernehmen').disabled = !(Math.floor(l.maxKaufpreis / 1000) * 1000 > 0);
  }

  function renderAlles() {
    renderRechner();
    renderVergleich();
    renderLeistbarkeit();
  }

  function aktualisiereSzenarioLeiste() {
    const sel = $('szenario-auswahl');
    sel.textContent = '';
    zustand.szenarien.forEach(function (s) {
      const o = el('option', s.name);
      o.value = s.id;
      sel.appendChild(o);
    });
    sel.value = aktiv().id;
    const n = zustand.szenarien.length;
    $('btn-neu').disabled = n >= MAX_SZENARIEN;
    $('btn-duplizieren').disabled = n >= MAX_SZENARIEN;
    $('btn-loeschen').disabled = n <= 1;
  }

  // ---------- Ereignisse ----------

  function onEingabe(ev) {
    if (ev.target.id === 'kfw-aktiv') {
      $('kfw-felder').hidden = !$('kfw-aktiv').checked;
    }
    leseFormular();
    zeigeObjektFelder(aktiv().eingaben.objektart);
    renderAlles();
    speichereVerzoegert();
  }

  function onHaushalt() {
    leseHaushalt();
    renderVergleich();
    renderLeistbarkeit();
    speichereVerzoegert();
  }

  function zeigeTab(name) {
    ['rechner', 'vergleich', 'leistbarkeit'].forEach(function (t) {
      const aktivTab = t === name;
      $('tab-' + t).setAttribute('aria-selected', String(aktivTab));
      $('tab-' + t).tabIndex = aktivTab ? 0 : -1;
      $('panel-' + t).hidden = !aktivTab;
    });
    if (name === 'vergleich') renderVergleich();
  }

  function einrichtenEreignisse() {
    const form = $('eingaben');
    form.addEventListener('submit', function (ev) { ev.preventDefault(); });
    form.addEventListener('input', onEingabe);
    form.addEventListener('change', onEingabe);

    $('haushalt').addEventListener('submit', function (ev) { ev.preventDefault(); });
    $('haushalt').addEventListener('input', onHaushalt);
    $('haushalt').addEventListener('change', onHaushalt);

    ['rechner', 'vergleich', 'leistbarkeit'].forEach(function (t) {
      $('tab-' + t).addEventListener('click', function () { zeigeTab(t); });
    });
    document.querySelector('.tabs').addEventListener('keydown', function (ev) {
      const reihe = ['rechner', 'vergleich', 'leistbarkeit'];
      const idx = reihe.indexOf(ev.target.id.replace('tab-', ''));
      if (idx < 0) return;
      let neu = null;
      if (ev.key === 'ArrowRight') neu = reihe[(idx + 1) % reihe.length];
      if (ev.key === 'ArrowLeft') neu = reihe[(idx + reihe.length - 1) % reihe.length];
      if (!neu) return;
      zeigeTab(neu);
      $('tab-' + neu).focus();
    });

    $('szenario-auswahl').addEventListener('change', function (ev) {
      zustand.aktivId = ev.target.value;
      schreibeFormular();
      aktualisiereSzenarioLeiste();
      renderAlles();
      speichereSofort();
    });

    $('btn-neu').addEventListener('click', function () {
      if (zustand.szenarien.length >= MAX_SZENARIEN) return;
      const s = { id: neueId(), name: naechsterName(), eingaben: vervollstaendigeEingaben({}) };
      zustand.szenarien.push(s);
      zustand.aktivId = s.id;
      schreibeFormular();
      aktualisiereSzenarioLeiste();
      renderAlles();
      speichereSofort();
    });

    $('btn-duplizieren').addEventListener('click', function () {
      if (zustand.szenarien.length >= MAX_SZENARIEN) return;
      const quelle = aktiv();
      const s = { id: neueId(), name: quelle.name + ' (Kopie)', eingaben: clone(quelle.eingaben) };
      zustand.szenarien.push(s);
      zustand.aktivId = s.id;
      schreibeFormular();
      aktualisiereSzenarioLeiste();
      renderAlles();
      speichereSofort();
    });

    $('btn-umbenennen').addEventListener('click', function () {
      const s = aktiv();
      const neuer = window.prompt('Neuer Name für das Szenario:', s.name);
      if (neuer === null) return;
      if (!neuer.trim()) {
        zeigeStatus('Der Name darf nicht leer sein.');
        return;
      }
      s.name = neuer.trim();
      aktualisiereSzenarioLeiste();
      renderAlles();
      speichereSofort();
    });

    $('btn-loeschen').addEventListener('click', function () {
      if (zustand.szenarien.length <= 1) return;
      const s = aktiv();
      if (!window.confirm('Szenario „' + s.name + '“ wirklich löschen?')) return;
      zustand.szenarien = zustand.szenarien.filter(function (x) { return x.id !== s.id; });
      zustand.aktivId = zustand.szenarien[0].id;
      schreibeFormular();
      aktualisiereSzenarioLeiste();
      renderAlles();
      speichereSofort();
    });

    $('btn-kaufpreis-uebernehmen').addEventListener('click', function () {
      const { l } = berechneLeistbarkeit();
      const wert = Math.floor(l.maxKaufpreis / 1000) * 1000;
      if (!(wert > 0)) {
        zeigeStatus('Mit den aktuellen Angaben ist kein positiver Kaufpreis möglich.');
        return;
      }
      aktiv().eingaben.kaufpreis = wert;
      schreibeFormular();
      renderAlles();
      speichereSofort();
      zeigeStatus('Kaufpreis im Szenario „' + aktiv().name + '“ auf ' + eur0.format(wert) + ' gesetzt.');
    });

    $('btn-exportieren').addEventListener('click', function () {
      S.exportieren(zustand);
      zeigeStatus('Export gestartet.');
    });

    $('btn-importieren').addEventListener('click', function () {
      $('datei-import').click();
    });

    $('datei-import').addEventListener('change', function (ev) {
      const datei = ev.target.files && ev.target.files[0];
      if (!datei) return;
      S.importieren(datei).then(function (z) {
        zustand = normalisiere(z);
        schreibeFormular();
        aktualisiereSzenarioLeiste();
        renderAlles();
        speichereSofort();
        zeigeStatus('Import erfolgreich.');
      }).catch(function (err) {
        zeigeStatus('Import fehlgeschlagen: ' + err.message);
      }).then(function () {
        ev.target.value = '';
      });
    });

    $('btn-teilen').addEventListener('click', function () {
      const url = S.teilenLink(aktiv());
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          zeigeStatus('Link in die Zwischenablage kopiert.');
        }, function () {
          window.prompt('Link kopieren:', url);
        });
      } else {
        window.prompt('Link kopieren:', url);
      }
    });

    $('btn-zuruecksetzen').addEventListener('click', function () {
      if (!window.confirm('Alle Szenarien und Eingaben auf Standard zurücksetzen?')) return;
      zustand = standardZustand();
      schreibeFormular();
      aktualisiereSzenarioLeiste();
      renderAlles();
      speichereSofort();
      zeigeStatus('Alles wurde zurückgesetzt.');
    });

    window.addEventListener('pagehide', speicherungNachspuelen);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') speicherungNachspuelen();
    });
  }

  // ---------- Start ----------

  function uebernehmeLinkAusHash() {
    if (location.hash.indexOf('#s=') !== 0) return false;
    const s = S.ausLink(location.hash);
    history.replaceState(null, '', location.pathname + location.search);
    if (!s) {
      zeigeStatus('Der geteilte Link ist ungültig.');
      return false;
    }
    if (zustand.szenarien.length >= MAX_SZENARIEN) {
      zeigeStatus('Das geteilte Szenario wurde nicht übernommen: maximal 6 Szenarien.');
      return false;
    }
    const neu = vervollstaendigeSzenario({
      id: neueId(),
      name: 'Geteilt: ' + (s.name || 'Szenario'),
      eingaben: s.eingaben
    });
    zustand.szenarien.push(neu);
    zustand.aktivId = neu.id;
    return true;
  }

  function init() {
    const geladen = S.laden();
    zustand = geladen ? normalisiere(geladen) : standardZustand();
    const hinzugefuegt = uebernehmeLinkAusHash();

    einrichtenEreignisse();
    schreibeFormular();
    aktualisiereSzenarioLeiste();
    renderAlles();
    speichereSofort();
    if (hinzugefuegt) zeigeStatus('Geteiltes Szenario wurde als neues Szenario übernommen.');
  }

  init();
})();
