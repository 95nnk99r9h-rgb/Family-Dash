# Family Dash 🏡

Ein Familien-Dashboard als **PWA für iPad und iPhone** im Liquid-Glass-Design: Glasflächen, ein unscharfes Hintergrundbild (Pfälzerwald mit Burg Trifels in vier Tageszeit-Stimmungen oder ein eigenes Foto), fließende Animationen, Hover-Effekte und eigene Symbole.

| Bereich | Was es kann |
|---|---|
| **Startseite** | Uhr & Begrüßung, Wetter, heutige Termine, Vorschau für morgen (Wetter, Termine, Essen), To-dos, Essensplan, Einkaufsliste |
| **Kalender** | Monatsansicht mit Tagesagenda aus eurem **Apple-/iCloud-Kalender** (nur Anzeige; eingetragen wird im iPhone-Kalender). Serientermine, Ganztägiges, mehrere Kalender mit Farben |
| **Wetter** | Annweiler am Trifels (76855): aktuell, 24 Stunden, 7 Tage, Wind, UV, Sonnenauf- und -untergang (Open-Meteo, kein API-Schlüssel nötig) |
| **To-dos** | Einfache eigene Liste: hinzufügen, abhaken, doppelt tippen zum Bearbeiten, löschen. Ohne Zuweisung und ohne Frist |
| **Essensplan** | Wochenplan mit Mittag & Abend, Vorschläge aus früheren Gerichten, Zutaten mit einem Tipp auf die Bring!-Liste |
| **Einkaufsliste** | Live-Synchronisation mit **Bring!**: Artikel hinzufügen, abhaken, „Zuletzt verwendet“ wieder hinzufügen |

To-dos und Essensplan liegen auf dem Server, damit iPad und iPhones dieselben Daten sehen. Änderungen erscheinen auf allen Geräten nach spätestens 15 Sekunden.

## Schnellstart

Voraussetzung ist Node.js 18 oder neuer. Es gibt keine weiteren Abhängigkeiten.

```bash
npm run demo     # mit Beispielterminen & Beispiel-Einkaufsliste
npm start        # normaler Betrieb → http://localhost:8080
npm test         # Tests für den Kalender-Parser
```

### Mit Docker (z. B. auf NAS oder Raspberry Pi)

```bash
docker compose up -d --build
```

Die Daten liegen in `./data/db.json`.

## Einrichtung

Alles lässt sich in der App unter **Mehr → Einstellungen** eintragen. Alternativ geht es per Umgebungsvariablen (siehe `.env.example`).

### Apple-Kalender verbinden
1. Auf dem iPhone die Kalender-App öffnen und unten auf **Kalender** tippen.
2. Beim gewünschten Kalender auf **ⓘ** tippen und **Öffentlicher Kalender** einschalten.
3. **Link teilen → Kopieren** und den `webcal://…`-Link in den Einstellungen einfügen.

Für mehrere Kalender (Familie, Schule, Arbeit …) einfach mehrere Links hinzufügen. iCloud aktualisiert veröffentlichte Kalender mit wenigen Minuten Verzögerung, und das Dashboard fragt alle 5 Minuten neu ab.

> Hinweis: Ein öffentlicher Kalender ist für alle lesbar, die den (langen, zufälligen) Link kennen.

### Bring! verbinden
E-Mail und Passwort eures Bring!-Kontos eintragen und auf **Verbinden** tippen. Danach die gewünschte Liste auswählen.
- Wer sich bei Bring! mit Apple oder Google angemeldet hat, legt zuerst in der Bring!-App unter *Profil → Konto* ein Passwort fest.
- Das Passwort bleibt auf dem Server und wird nie an den Browser zurückgegeben.
- Bring! hat keine offizielle öffentliche API. Family Dash nutzt dieselbe Schnittstelle wie die Bring!-Web-App. Sollte Bring! diese ändern, muss `lib/bring.js` angepasst werden.

### Als App installieren (iPhone/iPad)
Die Seite in **Safari** öffnen, auf **Teilen** tippen und **Zum Home-Bildschirm** wählen. Die App startet dann im Vollbild. Für den Offline-Modus (Service Worker) muss die Seite über **HTTPS** erreichbar sein.

## Betrieb & Sicherheit

Family Dash hat keine Benutzeranmeldung und ist fürs Heimnetz gedacht. Empfehlungen:
- Betrieb zu Hause (NAS, Raspberry Pi) und Zugriff von unterwegs über **Tailscale** oder einen **Cloudflare Tunnel mit Zugriffsschutz**. Beides bringt HTTPS gleich mit.
- Mit `ADMIN_PIN=…` lassen sich die Einstellungen (Kalender-Links, Bring!-Zugang) zusätzlich schützen.

## Aufbau

```
server.js            HTTP-Server + API (ohne Abhängigkeiten)
lib/ics.js           iCalendar-Parser inkl. Serientermine & Zeitzonen
lib/bring.js         Bring!-Anbindung
lib/store.js         JSON-Speicher (data/db.json)
lib/demo.js          Beispieldaten für DEMO=1
public/              PWA (Vanilla-JS-Module, CSS, Service Worker, Manifest, Icons)
scripts/make-icons.mjs  rendert die App-Icons aus icon.svg (Playwright)
```
