'use strict';

// Headless-Browser-Test für den Baufinanzierungsrechner (Playwright, Chromium).
// Aufruf: node baufinanzierung/tests/e2e.cjs
// Lädt index.html per file:// und prüft die Kernabläufe. Exit-Code 1 bei Fehlern.

const path = require('path');
const { chromium } = require('playwright');

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');
const ergebnisse = [];

function pruefe(name, ok, detail) {
  ergebnisse.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'OK   ' : 'FEHL ') + name + (detail ? ' – ' + detail : ''));
}

async function main() {
  const browser = await chromium.launch();
  try {
    // ---------- Desktop-Lauf ----------
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const fehler = [];
    page.on('console', (msg) => { if (msg.type() === 'error') fehler.push('console: ' + msg.text()); });
    page.on('pageerror', (err) => fehler.push('pageerror: ' + err.message));

    await page.goto(INDEX);
    await page.waitForSelector('#out-rate');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('#out-rate');

    const rateText = () => page.textContent('#out-rate');
    const rateAusgangs = await rateText();
    pruefe('Monatsrate mit Defaults angezeigt', /1\.901,97/.test(rateAusgangs), 'Anzeige: ' + rateAusgangs);

    await page.fill('#kaufpreis', '400000');
    await page.dispatchEvent('#kaufpreis', 'input');
    const rateNeu = await rateText();
    pruefe('Kaufpreis-Änderung ändert Monatsrate', rateNeu !== rateAusgangs, 'vorher ' + rateAusgangs + ', nachher ' + rateNeu);
    await page.fill('#kaufpreis', '450000');
    await page.dispatchEvent('#kaufpreis', 'input');

    const grestStart = await page.inputValue('#grest');
    pruefe('Grunderwerbsteuer beim Start 5 (BW)', Number(grestStart) === 5, 'Wert: ' + grestStart);
    const bundeslandFeld = await page.$('#bundesland');
    pruefe('Kein Feld #bundesland vorhanden', bundeslandFeld === null);
    await page.fill('#grest', '3.5');
    await page.dispatchEvent('#grest', 'input');

    // Szenario duplizieren, Vergleich prüfen
    await page.click('#btn-duplizieren');
    await page.click('#tab-vergleich');
    const spaltenVergleich = await page.$$eval('#vergleich-kopf th', (ths) => ths.length);
    pruefe('Vergleich zeigt nach Duplizieren 2 Szenario-Spalten', spaltenVergleich === 3,
      'Kopfzellen inkl. Kennzahl: ' + spaltenVergleich);

    // Reload behält Szenarien
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForSelector('#out-rate');
    const szenarienNachReload = await page.$$eval('#szenario-auswahl option', (os) => os.length);
    pruefe('Reload behält Szenarien (localStorage)', szenarienNachReload === 2, 'Anzahl: ' + szenarienNachReload);
    const grestNachReload = await page.inputValue('#grest');
    pruefe('Reload behält Eingaben des aktiven Szenarios', Number(grestNachReload) === 3.5,
      'Grunderwerbsteuer nach Reload: ' + grestNachReload);

    // Leistbarkeit
    await page.click('#tab-leistbarkeit');
    const maxKp = await page.textContent('#leist-maxkaufpreis');
    pruefe('Leistbarkeit zeigt maximalen Kaufpreis', /\d/.test(maxKp) && maxKp !== '–', 'Anzeige: ' + maxKp);

    // Teilen-Link-Roundtrip mit Umlauten (im Browser-Kontext)
    const roundtrip = await page.evaluate(() => {
      const s = { id: 'x1', name: 'Küche größer – Müller & Söhne', eingaben: { kaufpreis: 123456 } };
      const link = window.BaufiStorage.teilenLink(s);
      const zurueck = window.BaufiStorage.ausLink(link.split('#')[1]);
      const mitRaute = window.BaufiStorage.ausLink(link.slice(link.indexOf('#')));
      return {
        gleich: JSON.stringify(zurueck) === JSON.stringify(s),
        gleichMitRaute: JSON.stringify(mitRaute) === JSON.stringify(s),
        name: zurueck && zurueck.name
      };
    });
    pruefe('Teilen-Link-Roundtrip mit Umlauten', roundtrip.gleich && roundtrip.gleichMitRaute, 'Name: ' + roundtrip.name);

    await page.waitForTimeout(300);
    pruefe('Keine Konsolenfehler (Desktop-Lauf)', fehler.length === 0, fehler.join(' | ').slice(0, 300));

    await ctx.close();

    // ---------- Altdaten-Lauf: altes Szenario mit bundesland und abweichendem Satz ----------
    const altCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const altPage = await altCtx.newPage();
    const altFehler = [];
    altPage.on('console', (msg) => { if (msg.type() === 'error') altFehler.push('console: ' + msg.text()); });
    altPage.on('pageerror', (err) => altFehler.push('pageerror: ' + err.message));
    await altPage.goto(INDEX);
    await altPage.waitForSelector('#out-rate');
    await altPage.evaluate(() => {
      const altes = {
        version: 1,
        szenarien: [{ id: 'alt1', name: 'Altes Szenario', eingaben: { kaufpreis: 450000, bundesland: 'NW', grunderwerbsteuerSatz: 6.5 } }],
        aktivId: 'alt1',
        haushalt: {}
      };
      localStorage.setItem('baufi.v1', JSON.stringify(altes));
    });
    await altPage.reload();
    await altPage.waitForSelector('#out-rate');
    const grestAlt = await altPage.inputValue('#grest');
    pruefe('Altdaten NW 6,5 wird auf BW 5 gesetzt', Number(grestAlt) === 5, 'Wert: ' + grestAlt);
    const gespeichert = await altPage.evaluate(() => JSON.parse(localStorage.getItem('baufi.v1')));
    const altesEingaben = gespeichert.szenarien[0].eingaben;
    pruefe('Altdaten: Feld bundesland gelöscht', !('bundesland' in altesEingaben), 'Felder: ' + Object.keys(altesEingaben).length);
    pruefe('Altdaten-Lauf ohne Konsolenfehler', altFehler.length === 0, altFehler.join(' | ').slice(0, 300));
    await altCtx.close();

    // ---------- Mobil-Lauf (375 px) ----------
    const mobil = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const mp = await mobil.newPage();
    const mobilFehler = [];
    mp.on('pageerror', (err) => mobilFehler.push(err.message));
    await mp.goto(INDEX);
    await mp.waitForSelector('#out-rate');
    const breiten = {};
    breiten.rechner = await mp.evaluate(() => document.documentElement.scrollWidth);
    await mp.click('#tab-vergleich');
    breiten.vergleich = await mp.evaluate(() => document.documentElement.scrollWidth);
    await mp.click('#tab-leistbarkeit');
    breiten.leistbarkeit = await mp.evaluate(() => document.documentElement.scrollWidth);
    const mobilOk = Object.values(breiten).every((w) => w <= 375);
    pruefe('Mobil 375 px: kein horizontales Scrollen', mobilOk, JSON.stringify(breiten));
    pruefe('Mobil-Lauf ohne Seitenfehler', mobilFehler.length === 0, mobilFehler.join(' | '));
    await mobil.close();
  } finally {
    await browser.close();
  }

  const fehlgeschlagen = ergebnisse.filter((r) => !r.ok);
  console.log('');
  console.log(ergebnisse.length - fehlgeschlagen.length + ' von ' + ergebnisse.length + ' Prüfungen erfolgreich.');
  if (fehlgeschlagen.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('e2e abgebrochen:', err);
  process.exitCode = 1;
});
