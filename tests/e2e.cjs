'use strict';

// Headless-Browser-Test für den Baufinanzierungsrechner (Playwright, Chromium).
// Aufruf: node tests/e2e.cjs
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

    // Effektivzins, laufende Kosten, Gesamtbelastung
    await page.click('#tab-rechner');
    const ezText = await page.textContent('#out-effektivzins');
    pruefe('Kachel Effektivzins sichtbar mit %', /%/.test(ezText), 'Anzeige: ' + ezText);
    const gesamtHaus = await page.textContent('#out-gesamt');
    const hausSichtbarVorher = await page.isVisible('#haus-felder');
    const wohnungVorher = await page.isVisible('#wohnung-felder');
    pruefe('Objekt Haus: Haus-Felder sichtbar, Wohnungsfelder ausgeblendet', hausSichtbarVorher && !wohnungVorher);
    await page.locator('label.segment-option', { has: page.locator('#objektart-wohnung') }).click();
    const hausNachWechsel = await page.isVisible('#haus-felder');
    const wohnungNachWechsel = await page.isVisible('#wohnung-felder');
    pruefe('Umschalten auf Wohnung blendet Haus-Felder aus und Wohnungsfelder ein',
      !hausNachWechsel && wohnungNachWechsel);
    const gesamtWohnung = await page.textContent('#out-gesamt');
    pruefe('Umschalten auf Wohnung ändert Gesamtbelastung', gesamtWohnung !== gesamtHaus,
      'Haus ' + gesamtHaus + ', Wohnung ' + gesamtWohnung);

    await page.click('#tab-leistbarkeit');
    const bewInput = await page.$('#bewirtschaftung');
    pruefe('Leistbarkeit hat kein Eingabefeld #bewirtschaftung', bewInput === null);
    const bewText = await page.textContent('#leist-bew');
    pruefe('Leistbarkeit zeigt laufende Kosten des Szenarios', /480/.test(bewText), 'Anzeige: ' + bewText);
    await page.click('#tab-vergleich');
    const vergleichZeilen = await page.$$eval('#vergleich-body th', (ths) => ths.map((t) => t.textContent));
    pruefe('Vergleich enthält Zeile Gesamtbelastung', vergleichZeilen.indexOf('Gesamtbelastung') !== -1,
      'Zeilen: ' + vergleichZeilen.length);
    await page.click('#tab-rechner');
    await page.locator('label.segment-option', { has: page.locator('#objektart-haus') }).click();

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

    // ---------- Randfälle: Effektivzins, Tilgbarkeit, Leistbarkeit ----------
    const rCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const rPage = await rCtx.newPage();
    const rFehler = [];
    rPage.on('console', (msg) => { if (msg.type() === 'error') rFehler.push('console: ' + msg.text()); });
    rPage.on('pageerror', (err) => rFehler.push('pageerror: ' + err.message));
    await rPage.goto(INDEX);
    await rPage.waitForSelector('#out-rate');
    await rPage.evaluate(() => localStorage.clear());
    await rPage.reload();
    await rPage.waitForSelector('#out-rate');

    const setze = async (id, wert) => {
      await rPage.fill('#' + id, String(wert));
      await rPage.dispatchEvent('#' + id, 'input');
    };

    await setze('einmalkosten', 900000);
    const ezLeer = await rPage.textContent('#out-effektivzins');
    pruefe('Einmalkosten 900000: Effektivzins „–“', ezLeer === '–', 'Anzeige: ' + ezLeer);
    await setze('einmalkosten', 0);

    await setze('tilgung', 0);
    const warnText = await rPage.textContent('#warnung-tilgbar');
    const warnSichtbar = await rPage.isVisible('#warnung-tilgbar');
    pruefe('Tilgung 0: Warnung „In der Zinsbindung wird nichts getilgt…“ sichtbar',
      warnSichtbar && /^In der Zinsbindung wird nichts getilgt/.test(warnText), 'Anzeige: ' + warnText);
    const stressText = await rPage.textContent('#stress-body');
    pruefe('Tilgung 0: Stresstest ohne „nicht tilgbar“', !/nicht tilgbar/.test(stressText));

    await setze('anschlusstilgung', 0);
    const warnNie = await rPage.textContent('#warnung-tilgbar');
    const warnNieSichtbar = await rPage.isVisible('#warnung-tilgbar');
    pruefe('Tilgung 0 und Anschlusstilgung 0: Warnung „…wird nie getilgt.“',
      warnNieSichtbar && /wird nie getilgt\.$/.test(warnNie), 'Anzeige: ' + warnNie);
    await setze('anschlusstilgung', 2);
    await setze('tilgung', 2);
    const warnWeg = await rPage.isVisible('#warnung-tilgbar');
    pruefe('Tilgung 2 und Anschlusstilgung 2: Warnung ausgeblendet', !warnWeg);

    await rPage.click('#tab-leistbarkeit');
    await setze('netto1', 0);
    await setze('netto2', 0);
    await setze('sonstige', 0);
    const gesamtLeer = await rPage.textContent('#leist-gesamt');
    pruefe('Leistbarkeit ohne Einnahmen: Gesamtbelastung ohne „= –“',
      /Gesamtbelastung/.test(gesamtLeer) && !/–\s*$/.test(gesamtLeer), 'Anzeige: ' + gesamtLeer);
    const ampelLeer = await rPage.textContent('#leist-ampel-wert');
    pruefe('Leistbarkeit ohne Einnahmen: Ampel-Wert „–“', ampelLeer === '–', 'Anzeige: ' + ampelLeer);

    await rPage.waitForTimeout(300);
    pruefe('Keine Konsolenfehler (Randfälle-Lauf)', rFehler.length === 0, rFehler.join(' | ').slice(0, 300));
    await rCtx.close();

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
        haushalt: { bewirtschaftung: 350 }
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
    pruefe('Altdaten: haushalt.bewirtschaftung gelöscht', !('bewirtschaftung' in gespeichert.haushalt),
      'Felder: ' + Object.keys(gespeichert.haushalt).join(', '));
    pruefe('Altdaten: neue Felder mit Defaults gefüllt', altesEingaben.objektart === 'haus' && altesEingaben.wohnflaeche === 120 &&
      altesEingaben.einmalkosten === 0, 'objektart ' + altesEingaben.objektart);
    pruefe('Altdaten: Effektivzins angezeigt', /%/.test(await altPage.textContent('#out-effektivzins')));
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
    await mp.click('#tab-rechner');
    await mp.locator('label.segment-option', { has: mp.locator('#objektart-wohnung') }).click();
    breiten.rechnerWohnung = await mp.evaluate(() => document.documentElement.scrollWidth);
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
