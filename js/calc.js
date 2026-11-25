(function (root) {
  'use strict';

  // Grunderwerbsteuersätze in Prozent, Stand Vorlage (Kürzel → Name, Satz)
  const GRUNDERWERBSTEUER = {
    BW: { name: 'Baden-Württemberg', satz: 5.0 },
    BY: { name: 'Bayern', satz: 3.5 },
    BE: { name: 'Berlin', satz: 6.0 },
    BB: { name: 'Brandenburg', satz: 6.5 },
    HB: { name: 'Bremen', satz: 5.5 },
    HH: { name: 'Hamburg', satz: 5.5 },
    HE: { name: 'Hessen', satz: 6.0 },
    MV: { name: 'Mecklenburg-Vorpommern', satz: 6.0 },
    NI: { name: 'Niedersachsen', satz: 5.0 },
    NW: { name: 'Nordrhein-Westfalen', satz: 6.5 },
    RP: { name: 'Rheinland-Pfalz', satz: 5.0 },
    SL: { name: 'Saarland', satz: 6.5 },
    SN: { name: 'Sachsen', satz: 5.5 },
    ST: { name: 'Sachsen-Anhalt', satz: 5.0 },
    SH: { name: 'Schleswig-Holstein', satz: 6.5 },
    TH: { name: 'Thüringen', satz: 5.0 }
  };

  // Standard-Szenario
  const DEFAULTS = {
    kaufpreis: 450000,
    eigenkapital: 90000,
    bundesland: 'NW',
    notarSatz: 2.0,
    maklerSatz: 3.57,
    modernisierung: 0,
    zins: 3.6,
    tilgung: 2.0,
    zinsbindungJahre: 15,
    anschlusszins: 4.5,
    anschlussTilgung: 2.0,
    sondertilgungJahr: 0,
    kfw: { aktiv: false, betrag: 100000, zins: 2.5, tilgung: 2.0, zinsbindungJahre: 10 }
  };

  // Standard-Haushalt für die Leistbarkeitsrechnung
  const HAUSHALT_DEFAULTS = {
    netto1: 3000,
    netto2: 2500,
    sonstigeEinnahmen: 0,
    lebenshaltung: 1800,
    fixkosten: 400,
    bewirtschaftung: 350,
    puffer: 300,
    maxQuote: 35
  };

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function nebenkosten(opts) {
    const o = opts || {};
    const kaufpreis = num(o.kaufpreis);
    const grunderwerbsteuer = kaufpreis * num(o.grunderwerbsteuerSatz) / 100;
    const notar = kaufpreis * num(o.notarSatz) / 100;
    const makler = kaufpreis * num(o.maklerSatz) / 100;
    const summe = grunderwerbsteuer + notar + makler;
    const quote = kaufpreis > 0 ? summe / kaufpreis * 100 : 0;
    return { grunderwerbsteuer, notar, makler, summe, quote };
  }

  function annuitaetenplan(opts) {
    const o = opts || {};
    const betrag = num(o.betrag);
    const zins = num(o.zins);
    const tilgung = num(o.tilgung);
    const zbMonate = Math.max(0, Math.round(num(o.zinsbindungJahre) * 12));
    const anschlusszins = num(o.anschlusszins);
    const anschlussTilgung = num(o.anschlussTilgung);
    const sonder = Math.max(0, num(o.sondertilgungJahr));
    const maxMonate = Math.max(0, Math.round((o.maxJahre == null ? 100 : num(o.maxJahre)) * 12));

    if (betrag <= 0) {
      return {
        betrag: 0, rate: 0, anschlussrate: 0, restschuldZinsbindung: 0, gesamtzinsen: 0,
        zinsenZinsbindung: 0, laufzeitMonate: 0, tilgbar: true, jahre: []
      };
    }

    const rate = betrag * (zins + tilgung) / 100 / 12;
    let tilgbar = true;
    if (zbMonate > 0 && rate <= betrag * zins / 100 / 12) tilgbar = false;

    let rest = betrag;
    let monate = 0;
    let anschlussrate = 0;
    let rateP2 = null;
    let restZB = betrag;
    let zinsenZB = 0;
    let gesamtzinsen = 0;
    const jahre = [];

    while (monate < maxMonate && rest >= 0.005) {
      monate += 1;
      const phase = monate <= zbMonate ? 1 : 2;
      let zinssatz;
      let r;
      if (phase === 1) {
        zinssatz = zins;
        r = rate;
      } else {
        if (rateP2 === null) {
          rateP2 = rest * (anschlusszins + anschlussTilgung) / 100 / 12;
          anschlussrate = rateP2;
          if (rateP2 <= rest * anschlusszins / 100 / 12) tilgbar = false;
        }
        zinssatz = anschlusszins;
        r = rateP2;
      }

      const zinsMonat = rest * zinssatz / 100 / 12;
      let tilg = Math.min(r - zinsMonat, rest);
      if (!(tilg > 0)) tilg = 0;
      rest -= tilg;

      let sondertilgung = 0;
      if (phase === 1 && sonder > 0 && monate % 12 === 0 && rest > 0) {
        sondertilgung = Math.min(sonder, rest);
        rest -= sondertilgung;
      }

      if (phase === 1) {
        restZB = rest;
        zinsenZB += zinsMonat;
      }
      gesamtzinsen += zinsMonat;

      const idx = Math.floor((monate - 1) / 12);
      if (!jahre[idx]) {
        jahre[idx] = { jahr: idx + 1, zinsen: 0, tilgung: 0, sondertilgung: 0, restschuld: 0, phase };
      }
      const j = jahre[idx];
      j.zinsen += zinsMonat;
      j.tilgung += tilg;
      j.sondertilgung += sondertilgung;
      j.restschuld = rest;
    }

    return {
      betrag,
      rate,
      anschlussrate,
      restschuldZinsbindung: restZB,
      gesamtzinsen,
      zinsenZinsbindung: zinsenZB,
      laufzeitMonate: monate,
      tilgbar,
      jahre
    };
  }

  function finanzierung(eingaben) {
    const e = eingaben || {};
    let satz = e.grunderwerbsteuerSatz;
    if (satz === undefined || satz === null || satz === '') {
      const land = GRUNDERWERBSTEUER[e.bundesland];
      satz = land ? land.satz : 0;
    }
    const nk = nebenkosten({
      kaufpreis: e.kaufpreis,
      grunderwerbsteuerSatz: satz,
      notarSatz: e.notarSatz,
      maklerSatz: e.maklerSatz
    });
    const kaufpreis = num(e.kaufpreis);
    const eigenkapital = num(e.eigenkapital);
    const gesamtkosten = kaufpreis + nk.summe + num(e.modernisierung);
    const darlehenGesamt = Math.max(0, gesamtkosten - eigenkapital);
    const beleihungsauslauf = kaufpreis > 0 ? darlehenGesamt / kaufpreis * 100 : 0;
    const eigenkapitalQuote = gesamtkosten > 0 ? eigenkapital / gesamtkosten * 100 : 0;

    const kfw = e.kfw || {};
    let kfwPlan = null;
    let kfwBetrag = 0;
    if (kfw.aktiv) {
      kfwBetrag = Math.min(Math.max(0, num(kfw.betrag)), darlehenGesamt);
      kfwPlan = annuitaetenplan({
        betrag: kfwBetrag,
        zins: kfw.zins,
        tilgung: kfw.tilgung,
        zinsbindungJahre: kfw.zinsbindungJahre,
        anschlusszins: e.anschlusszins,
        anschlussTilgung: kfw.tilgung,
        sondertilgungJahr: 0
      });
    }

    const bank = annuitaetenplan({
      betrag: darlehenGesamt - kfwBetrag,
      zins: e.zins,
      tilgung: e.tilgung,
      zinsbindungJahre: e.zinsbindungJahre,
      anschlusszins: e.anschlusszins,
      anschlussTilgung: e.anschlussTilgung,
      sondertilgungJahr: e.sondertilgungJahr
    });

    return {
      nebenkosten: nk,
      gesamtkosten,
      darlehenGesamt,
      beleihungsauslauf,
      eigenkapitalQuote,
      bank,
      kfw: kfwPlan,
      rateGesamt: bank.rate + (kfwPlan ? kfwPlan.rate : 0),
      gesamtzinsen: bank.gesamtzinsen + (kfwPlan ? kfwPlan.gesamtzinsen : 0),
      restschuldZinsbindung: bank.restschuldZinsbindung,
      tilgbar: bank.tilgbar && (kfwPlan ? kfwPlan.tilgbar : true)
    };
  }

  function stresstest(eingaben, anschlusszinsen) {
    const liste = anschlusszinsen || [3, 4, 5, 6, 7];
    return liste.map(function (az) {
      const f = finanzierung(Object.assign({}, eingaben, { anschlusszins: az }));
      return {
        anschlusszins: az,
        anschlussrate: f.bank.anschlussrate,
        gesamtzinsen: f.bank.gesamtzinsen,
        laufzeitMonate: f.bank.laufzeitMonate,
        tilgbar: f.bank.tilgbar
      };
    });
  }

  function leistbarkeit(h) {
    const o = h || {};
    const einnahmen = num(o.netto1) + num(o.netto2) + num(o.sonstigeEinnahmen);
    const freieRate = Math.max(0, einnahmen - num(o.lebenshaltung) - num(o.fixkosten) -
      num(o.bewirtschaftung) - num(o.puffer));
    const maxQuote = o.maxQuote == null ? 35 : num(o.maxQuote);
    const quotenRate = einnahmen * maxQuote / 100;
    const maxRate = Math.min(freieRate, quotenRate);
    const zinsTilgung = num(o.zins) + num(o.tilgung);
    const maxDarlehen = zinsTilgung > 0 ? maxRate * 12 * 100 / zinsTilgung : 0;
    const maxKaufpreis = (maxDarlehen + num(o.eigenkapital)) / (1 + num(o.nebenkostenQuote) / 100);
    return { einnahmen, freieRate, quotenRate, maxRate, maxDarlehen, maxKaufpreis };
  }

  function ampel(rate, einnahmen) {
    const e = num(einnahmen);
    if (e <= 0) return 'rot';
    const quote = num(rate) / e * 100;
    if (quote <= 30) return 'gruen';
    if (quote <= 40) return 'gelb';
    return 'rot';
  }

  const api = {
    GRUNDERWERBSTEUER,
    DEFAULTS,
    HAUSHALT_DEFAULTS,
    nebenkosten,
    annuitaetenplan,
    finanzierung,
    stresstest,
    leistbarkeit,
    ampel
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BaufiCalc = api;
})(typeof self !== 'undefined' ? self : this);
