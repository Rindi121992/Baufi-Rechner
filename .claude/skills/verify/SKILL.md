---
name: verify
description: Baufi-Rechner im echten Browser prüfen (Playwright, file://) – Rezept für Verifikation von Änderungen.
---

# Baufi-Rechner verifizieren

Statische App ohne Build. Oberfläche = `index.html` im Browser.

## Starten
- Playwright ist in der Cloud-Umgebung vorinstalliert: `require('playwright')`, `chromium.launch()` ohne Optionen.
  Nicht `playwright install` ausführen.
- Seite: `file://<repo>/index.html`. Vor jedem Lauf `localStorage.clear()` + `reload()`, sonst stören alte Szenarien.

## Vorher/Nachher-Vergleich (bewährt)
- Alte Version: `git worktree add <tmp>/alt HEAD~1`, dasselbe Treiberskript gegen beide Ordner laufen lassen,
  sichtbare Texte (`#out-*`, `#leist-*`, `#stress-body`, `#vergleich-body`) als JSON ausgeben und `diff`en.
- Danach `git worktree remove --force <tmp>/alt`.

## Flows, die sich lohnen
- Eingaben tippen (`#kaufpreis`, `#zins`, `#zinsbindung` Select, `#sondertilgung`, `#einmalkosten`).
- Objektart: auf `label:has(#objektart-wohnung)` klicken (Radio ist optisch versteckt); Tastatur-Pfeile in der Gruppe.
- KfW: `#kfw-aktiv` an/aus → `#kfw-felder` sichtbar/unsichtbar.
- Szenario duplizieren (`#btn-duplizieren`), wechseln (`#szenario-auswahl`), Tab Vergleich/Leistbarkeit.
- Randfälle: Einmalkosten > Darlehen, Eigenkapital > Kosten, Zins 0, Tilgung 0 (Warnung `#warnung-tilgbar`), Einnahmen 0.

## Fallstricke
- Teilen-Link testen: erst `about:blank`, dann `index.html#s=…` öffnen. Nur den Hash ändern lädt die Seite nicht neu.
- Konsolen- und `pageerror`-Ereignisse mitschneiden; die App soll fehlerfrei laufen.
