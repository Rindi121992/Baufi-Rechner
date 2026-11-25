# Baufinanzierungsrechner

Ein privater Baufinanzierungsrechner für Deutschland als statische Web-App
(nur HTML, CSS und JavaScript, keine Abhängigkeiten, kein Build).

## Was die App kann

- **Rechner:** Kaufnebenkosten (Grunderwerbsteuer für Baden-Württemberg (5,0 %, änderbar), Notar und Grundbuch, Makler),
  Darlehenssumme, Monatsrate, Restschuld nach Zinsbindung, Anschlussrate, Gesamtlaufzeit,
  Gesamtzinsen, Beleihungsauslauf und Eigenkapitalquote.
- **Tilgungsplan:** Jahresübersicht mit Zinsen, Tilgung, Sondertilgung und Restschuld,
  Phase-2-Zeilen nach Ende der Zinsbindung abgesetzt. Bei aktivem KfW-Darlehen eine zweite Tabelle.
- **Stresstest:** Anschlussrate, Gesamtzinsen und Laufzeit für Anschlusszinsen von 3 bis 7 %.
- **Szenarien:** bis zu 6 Szenarien nebeneinander, Tab **Vergleich** mit bestem Wert je Kennzahl
  und Diagramm der Restschuld aller Szenarien.
- **Leistbarkeit:** freie Rate, tragbare Rate laut Quote, maximales Darlehen und maximaler Kaufpreis
  aus dem Haushalt. Ampel für das aktive Szenario (grün bis 30 %, gelb bis 40 %, darüber rot).
  Der Button übernimmt den maximalen Kaufpreis (auf 1000 € abgerundet) in das aktive Szenario.
- **Speichern:** Alles wird im Browser (localStorage) gehalten. Export und Import als JSON-Datei,
  Teilen-Link mit den Daten eines Szenarios in der URL.

## Lokal öffnen

Die Datei `index.html` per Doppelklick im Browser öffnen. Es ist kein Server nötig,
die Scripts werden klassisch über `<script src>` geladen.

## Tests starten

Die Rechenfunktionen (`js/calc.js`) werden mit dem eingebauten Test-Runner von Node 22 geprüft:

```
node --test "tests/*.test.cjs"
```

Der Browser-Test `tests/e2e.cjs` braucht Playwright mit installiertem Chromium und läuft mit

```
node tests/e2e.cjs
```

## Veröffentlichen über GitHub Pages

In den Repository-Einstellungen unter „Pages“ als Quelle „Deploy from a branch“, Branch `main`
und Ordner `/ (root)` wählen. Danach ist die App unter `https://<benutzer>.github.io/<repo>/` erreichbar.
Hinweis: Mit einem kostenlosen GitHub-Konto funktioniert Pages nur für öffentliche Repositorys.
Alle Pfade in der App sind relativ, deshalb funktioniert sie sowohl per `file://` als auch über Pages.

## Rechenannahmen

- Monatliche Annuität: Die Rate bleibt in der Zinsbindung konstant. Der Zins wird monatlich
  auf die Restschuld berechnet (Sollzins / 12).
- Sondertilgung: jährlich, jeweils am Ende eines Jahres (Monat 12, 24, …) innerhalb der Zinsbindung,
  maximal bis zur Restschuld.
- Nach der Zinsbindung wird die Anschlussrate aus der Restschuld mit Anschlusszins und
  Anschlusstilgung neu berechnet.
- Ist die Rate nicht höher als der erste Monatszins, wird das Darlehen nie getilgt; die App zeigt dann eine Warnung.
- KfW-Darlehen: eigener Plan mit eigenem Zins, eigener Tilgung und eigener Zinsbindung, ohne Sondertilgung.
  Die Anschlussrate, die Restschuld nach Zinsbindung und der Stresstest beziehen sich auf das Bankdarlehen.
- Sollzins, kein Effektivzins. Der Grunderwerbsteuersatz (Baden-Württemberg, 5,0 %) ist Stand der Vorlage und kann im Feld
  überschrieben werden.
- Alle Beträge werden ungerundet gerechnet; gerundet wird nur in der Anzeige.

## Datenschutz

Alle Daten bleiben im Browser. Die App sendet keine Daten an Server, lädt keine externen
Bibliotheken und enthält keine Tracker. Der Teilen-Link enthält die Szenariodaten im Hash der
Adresse und wird nicht an einen Server übertragen.

## Hinweis

Unverbindliche Modellrechnung, keine Finanzberatung. Sollzins, kein Effektivzins.

## Dateien

```
./
  index.html
  css/style.css
  js/calc.js      Rechenkern (UMD, ohne DOM)
  js/storage.js   localStorage, Export/Import, Teilen-Link
  js/chart.js     SVG-Diagramm ohne Bibliothek
  js/app.js       UI-Logik
  tests/calc.test.cjs
  tests/e2e.cjs
  README.md
```
