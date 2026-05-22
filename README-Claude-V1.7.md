# PR Explorer Madeira — Claude V1.7

Mobile-first PWA für private Madeira-PR-Planung.

## Neue Features in Claude V1.7

### Fixes
- **Status-Filter** – Jetzt kleine runde Ampel-Dots (grün/gelb/rot/grau). Beim Aktivieren farbig ausgefüllt.
- **Concelhos-Layer** – Grenzen jetzt direkt eingebettet (kein API-Aufruf), funktioniert immer zuverlässig.

### UI / Icons
- **Fußleiste** – SVG-Icons im Geory-Stil: Haus / Buch / Karte / Globus / Optionen-Linien
- **Oben rechts** – Navigations-Pill (⚡ Standort) + Duo-Pill (⚙️ Einstellungen | ↑ Teilen)
- **Teilen-Button** – sichtbar, aber noch nicht aktiv (kommt V1.8)
- **View-Dropdown** – Geory-Stil mit SVG-Icons: Standort / Gesamte Route / Vollbild

### Status-System (neu)
- 4 Status: 🟢 Offen / 🟡 Eingeschränkt / 🔴 Geschlossen / ⚫ Kein Interesse
- **Standard beim ersten Laden: alle PR = Grün (offen)**
- "Kein Interesse" versteckt den PR komplett (kein Pin, nicht im Journal)
- Status-Buttons in Detailansicht: 4 Felder mit farbigen Dots

### Einstellungs-Panel (⚙️ Zahnrad)
Geory-Stil: weiße Karten-Gruppen mit Icon + Label + Wert + Pfeil

- **Reisezeitraum** – Von/Bis mit Kalender-Picker (Bereichsauswahl blau)
- **GPX Wanderweg** – Linienfarbe mit Farbpicker (Gitter + RGB-Regler + Hex)
- **KML Anfahrt** – Linienfarbe mit Farbpicker
- **Pin Farbe** – Kartenpin-Farbe wählbar
- **Pin Icon** – Emoji-Picker (Wandern / Navigation / Transport / Aktivitäten)
- **Pin Form** – Tropfen / Kreis / Quadrat / Raute
- **Layer-Toggles** – GPX / KML / Pins / Concelhos

### Reise-Banner
Sobald ein Zeitraum gesetzt ist, erscheint in Übersicht + Reisen ein Banner mit Datum, Countdown und Gesamttagen.

### Aktiver Pin
Beim Öffnen der Detailansicht leuchtet der zugehörige Kartenpin mit blauem Glow-Effekt auf.

## Dateistruktur

```
PR-Explorer-Claude-V1.7/
├── index.html
├── style-claude-v1.7.css
├── app-claude-v1.7.js
├── service-worker.js
├── pr-data.js          ← unveränderter Datenstand aus V1.6
├── manifest.webmanifest
├── icon-180.png
├── icon-192.png
└── icon-512.png
```

## Deployment (GitHub Pages)
Entpackten Inhalt hochladen (nicht die ZIP), alle Dateien im Root.
pr-data.js, manifest.webmanifest und Icons aus der V1.6 übernehmen.
