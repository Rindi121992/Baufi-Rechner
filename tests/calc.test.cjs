'use strict';

const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/calc.js');

function nah(actual, expected, toleranz, text) {
  assert.ok(Math.abs(actual - expected) <= toleranz,
    `${text || ''} erwartet ${expected} ±${toleranz}, erhalten ${actual}`);
}

test('K1: nebenkosten mit Referenzwerten', () => {
  const nk = C.nebenkosten({ kaufpreis: 400000, grunderwerbsteuerSatz: 6.5, notarSatz: 2, maklerSatz: 3.57 });
  nah(nk.grunderwerbsteuer, 26000, 0.001);
  nah(nk.notar, 8000, 0.001);
  nah(nk.makler, 14280, 0.001);
  nah(nk.summe, 48280, 0.001);
  nah(nk.quote, 12.07, 0.001);
});

test('K2: annuitaetenplan Referenzfall', () => {
  const p = C.annuitaetenplan({ betrag: 300000, zins: 4, tilgung: 2, zinsbindungJahre: 10, anschlusszins: 4, anschlussTilgung: 2, sondertilgungJahr: 0 });
  nah(p.rate, 1500, 0.01, 'rate');
  nah(p.restschuldZinsbindung, 226375.10, 1, 'restschuldZinsbindung');
  assert.strictEqual(p.laufzeitMonate, 451);
  nah(p.gesamtzinsen, 253669, 50, 'gesamtzinsen');
  assert.ok(p.jahre[0].zinsen >= 11850 && p.jahre[0].zinsen <= 11950, `jahre[0].zinsen ${p.jahre[0].zinsen}`);
  nah(p.anschlussrate, 1131.88, 0.01, 'anschlussrate');
  assert.strictEqual(p.jahre.length, 38);
  assert.strictEqual(p.tilgbar, true);
  assert.strictEqual(p.jahre[0].phase, 1);
  assert.strictEqual(p.jahre[27].phase, 2);
});

test('K3: Sondertilgung senkt Restschuld, Zinsen und Anschlussrate', () => {
  const p = C.annuitaetenplan({ betrag: 300000, zins: 4, tilgung: 2, zinsbindungJahre: 10, anschlusszins: 4, anschlussTilgung: 2, sondertilgungJahr: 10000 });
  assert.ok(p.restschuldZinsbindung < 126375, `restschuld ${p.restschuldZinsbindung}`);
  assert.ok(p.gesamtzinsen < 253669 && p.anschlussrate < 1131.88, `zinsen ${p.gesamtzinsen} rate ${p.anschlussrate}`);
});

test('K4: nicht tilgbar, keine Endlosschleife, 1200 Monate', () => {
  const p = C.annuitaetenplan({ betrag: 100000, zins: 5, tilgung: 0, zinsbindungJahre: 10, anschlusszins: 5, anschlussTilgung: 0, sondertilgungJahr: 0 });
  assert.strictEqual(p.tilgbar, false);
  assert.strictEqual(p.laufzeitMonate, 1200);
  nah(p.restschuldZinsbindung, 100000, 0.01, 'restschuld bleibt');
});

test('K5: eigenkapital groesser als gesamtkosten', () => {
  const f = C.finanzierung({ kaufpreis: 300000, eigenkapital: 900000, bundesland: 'NW', notarSatz: 2, maklerSatz: 3.57,
    modernisierung: 0, zins: 3.6, tilgung: 2, zinsbindungJahre: 15, anschlusszins: 4.5, anschlussTilgung: 2,
    sondertilgungJahr: 0, kfw: { aktiv: false } });
  assert.strictEqual(f.darlehenGesamt, 0);
  assert.strictEqual(f.rateGesamt, 0);
  assert.strictEqual(f.tilgbar, true);
});

test('K6: finanzierung mit KfW-Anteil', () => {
  const f = C.finanzierung({ kaufpreis: 400000, eigenkapital: 0, grunderwerbsteuerSatz: 0, notarSatz: 0, maklerSatz: 0,
    modernisierung: 0, zins: 3.6, tilgung: 2, zinsbindungJahre: 15, anschlusszins: 4.5, anschlussTilgung: 2,
    sondertilgungJahr: 0, kfw: { aktiv: true, betrag: 100000, zins: 2.5, tilgung: 2, zinsbindungJahre: 10 } });
  nah(f.darlehenGesamt, 400000, 0.001, 'darlehenGesamt');
  nah(f.bank.betrag, 300000, 0.001, 'bank-betrag');
  nah(f.bank.rate, 300000 * (3.6 + 2) / 1200, 0.001, 'bank.rate');
  nah(f.kfw.rate, 100000 * (2.5 + 2) / 1200, 0.001, 'kfw.rate');
  nah(f.rateGesamt, f.bank.rate + f.kfw.rate, 0.000001, 'rateGesamt');
});

test('K7: leistbarkeit und ampel', () => {
  const l = C.leistbarkeit({ netto1: 3000, netto2: 2500, sonstigeEinnahmen: 0, lebenshaltung: 1800, fixkosten: 400,
    bewirtschaftung: 350, puffer: 300, zins: 4, tilgung: 2, eigenkapital: 90000, nebenkostenQuote: 10, maxQuote: 35 });
  assert.strictEqual(l.einnahmen, 5500);
  assert.strictEqual(l.freieRate, 2650);
  assert.strictEqual(l.quotenRate, 1925);
  assert.strictEqual(l.maxRate, 1925);
  nah(l.maxDarlehen, 385000, 0.001, 'maxDarlehen');
  nah(l.maxKaufpreis, 431818.18, 1, 'maxKaufpreis');
  assert.strictEqual(C.ampel(1500, 5500), 'gruen');
  assert.strictEqual(C.ampel(2000, 5500), 'gelb');
  assert.strictEqual(C.ampel(2500, 5500), 'rot');
});

test('Grenzfall: betrag 0 ergibt leeren Plan', () => {
  const p = C.annuitaetenplan({ betrag: 0, zins: 4, tilgung: 2, zinsbindungJahre: 10, anschlusszins: 4, anschlussTilgung: 2 });
  assert.strictEqual(p.rate, 0);
  assert.strictEqual(p.gesamtzinsen, 0);
  assert.strictEqual(p.restschuldZinsbindung, 0);
  assert.strictEqual(p.laufzeitMonate, 0);
  assert.strictEqual(p.anschlussrate, 0);
  assert.strictEqual(p.tilgbar, true);
  assert.deepStrictEqual(p.jahre, []);
});

test('Grenzfall: Rest wird nach Zinsbindung vollstaendig getilgt, Anschlussrate 0', () => {
  const p = C.annuitaetenplan({ betrag: 10000, zins: 3, tilgung: 50, zinsbindungJahre: 10, anschlusszins: 4, anschlussTilgung: 2 });
  assert.strictEqual(p.anschlussrate, 0);
  assert.ok(p.laufzeitMonate < 120, `laufzeit ${p.laufzeitMonate}`);
  assert.strictEqual(p.tilgbar, true);
});

test('Grenzfall: Bundesland setzt Grunderwerbsteuer in finanzierung', () => {
  const f = C.finanzierung({ kaufpreis: 100000, eigenkapital: 0, bundesland: 'BY', notarSatz: 0, maklerSatz: 0,
    zins: 3, tilgung: 2, zinsbindungJahre: 10, anschlusszins: 4, anschlussTilgung: 2, sondertilgungJahr: 0, kfw: { aktiv: false } });
  nah(f.nebenkosten.grunderwerbsteuer, 3500, 0.001);
});

test('Stresstest liefert fuenf Zeilen mit steigender Anschlussrate', () => {
  const eing = Object.assign({}, C.DEFAULTS, { kaufpreis: 450000, eigenkapital: 90000 });
  const s = C.stresstest(eing);
  assert.strictEqual(s.length, 5);
  assert.strictEqual(s[0].anschlusszins, 3);
  assert.ok(s[4].anschlussrate > s[0].anschlussrate);
});

test('Ampel-Grenzen und leere Einnahmen', () => {
  assert.strictEqual(C.ampel(100, 0), 'rot');
  assert.strictEqual(C.ampel(100, -5), 'rot');
  assert.strictEqual(C.ampel(30, 100), 'gruen');
  assert.strictEqual(C.ampel(40, 100), 'gelb');
  assert.strictEqual(C.ampel(40.01, 100), 'rot');
});

test('Leistbarkeit ohne Einnahmen liefert keine negative freie Rate', () => {
  const l = C.leistbarkeit({ netto1: 0, netto2: 0, lebenshaltung: 1000, zins: 4, tilgung: 2 });
  assert.strictEqual(l.freieRate, 0);
  assert.strictEqual(l.maxRate, 0);
  assert.strictEqual(l.maxDarlehen, 0);
});
