# Smart Taskbar 🪟✨

Eine neu gedachte Taskleiste für Windows 10/11. Neben deinen Apps zeigt sie, **was als Nächstes ansteht** und **was deine Claude-Sitzungen gerade tun**.

```
[⊞] [📁][🌐][💬]   ▍Weekly Sync · in 4 Min · 10:00   [📹 Beitreten] │ ● family-dash · arbeitet · Bash   ● api · wartet auf dich    ◔ 18:22  ☀ 7° 9°/2°  CPU▂ RAM▅  10:56 So, 15.11.
 Start  Apps         nächster Outlook-Termin           Teams/Zoom      Claude-Code-Sitzungen                                     Fokus  Wetter    System     Uhr → Tagesübersicht
```

## Was sie kann

| Bereich | Funktion |
|---|---|
| **Apps** | Angeheftete und offene Programme, gruppiert pro App. Klick = aktivieren / minimieren, mehrere Fenster → Auswahl, Mittelklick = neues Fenster, Rechtsklick = anheften, schließen |
| **Nächster Termin** | Aus Outlook: „läuft · noch 23 Min“, „in 12 Min · 14:30 · Raum 2“. 5 Min vorher blinkt der Chip und es gibt einen Ton |
| **Beitreten** | Erkennt Teams-, Zoom-, Google-Meet- und Webex-Links im Termin und zeigt 10 Min vorher einen „Beitreten“-Knopf |
| **Tagesübersicht** | Klick auf Uhr oder Termin: alle Termine von heute und morgen, ganztägige zuerst, mit Ort, Organisator und Beitreten-Knopf |
| **Claude-Sitzungen** | Jede aktive Claude-Code-Sitzung als Chip: 🟢 arbeitet (mit aktuellem Werkzeug), 🟡 wartet auf Freigabe, 🔵 fertig, wartet auf dich. Wird eine Sitzung fertig, leuchtet der Chip auf und es gibt einen Ton. Klick: letzte Nachricht, Projektordner, Terminal, `claude --resume …` kopieren |
| **Fokus-Timer** | Klick startet 25 Min Fokus mit Fortschrittsring; danach „Pause ☕“ |
| **Wetter** | Aktuell + Tageshoch/-tief; bei Regenrisiko ab 40 % ein ☂-Hinweis (Open-Meteo, kein Schlüssel nötig) |
| **System** | Mini-Balken für CPU/RAM (rot bei Last), Akku auf Laptops. Klick: Task-Manager |
| **Start** | Klick öffnet das Startmenü, Rechtsklick: Einstellungen, Windows-Taskleiste aus-/einblenden, Beenden |

Die Leiste meldet sich bei Windows als **AppBar** an: maximierte Fenster enden darüber, Vollbild-Apps (Spiele, Videos) überdecken sie.

## Installieren

**Fertige .exe:** Bei jedem Push baut GitHub Actions die App (`Smart Taskbar (Windows)` → Artefakt `SmartTaskbar-win-x64`). Benötigt die [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0).

**Selbst bauen** (Windows, .NET 8 SDK):

```powershell
cd SmartTaskbar
dotnet run -c Release
# oder als einzelne Datei:
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o publish
```

**Autostart:** `Win + R` → `shell:startup` → Verknüpfung zu `SmartTaskbar.exe` hineinlegen.

## Einstellungen

Beim ersten Start entsteht `%APPDATA%\SmartTaskbar\settings.json` (Rechtsklick auf Start → *Einstellungen bearbeiten*). Änderungen gelten nach einem Neustart der App.

```jsonc
{
  "BarHeight": 52,
  "HideWindowsTaskbar": false,      // true = originale Taskleiste ausblenden (wird beim Beenden wiederhergestellt)
  "PinnedApps": ["C:\\Windows\\explorer.exe"],
  "OutlookEnabled": true,
  "OutlookOnlyWhenRunning": true,   // false = Outlook bei Bedarf im Hintergrund starten
  "OutlookRefreshSeconds": 120,
  "MeetingReminderMinutes": 5,
  "ClaudeEnabled": true,
  "ClaudeProjectsPath": null,       // Standard: %USERPROFILE%\.claude\projects
  "ClaudeShowIdleMinutes": 90,
  "ClaudeMaxChips": 4,
  "WeatherEnabled": true,
  "WeatherPlace": "Berlin",
  "Latitude": 52.52,
  "Longitude": 13.41,
  "FocusMinutes": 25,
  "Sounds": true
}
```

## Wie die Daten zustande kommen

- **Outlook:** über die COM-Schnittstelle des **klassischen Outlook für Windows** (Microsoft 365 / Outlook 2016+). Gelesen werden nur Termine von heute und morgen im Standardkalender, Serientermine inklusive, abgesagte nicht. Das **„neue Outlook“** hat keine COM-Schnittstelle – dafür wäre eine Anbindung über Microsoft Graph nötig (siehe Ideen).
- **Claude:** Claude Code schreibt jede Sitzung als Protokoll nach `~/.claude/projects/<projekt>/<sitzung>.jsonl`. Die Leiste liest davon nur das Ende und leitet den Zustand ab:
  - letzte Zeile ist ein Werkzeugaufruf → *arbeitet*; hängt er über 25 s → vermutlich *wartet auf Freigabe*
  - letzte Zeile ist eine neue Nachricht oder ein Werkzeug-Ergebnis → *arbeitet*
  - letzte Zeile ist eine Textantwort → *wartet auf dich*

  Es wird nichts verändert und nichts verschickt. Sitzungen in der Cloud (claude.ai/code) erscheinen nicht, nur lokale.

## Aufbau

```
SmartTaskbar/
├── App.xaml(.cs)                     Start, Einzelinstanz, Taskleiste bei Absturz wiederherstellen
├── MainWindow.xaml(.cs)              Die Leiste: Layout, Takt, Klicks, Popups
├── Settings.cs                       settings.json
├── Native/Win32.cs                   Windows-API (P/Invoke)
├── Native/AppBar.cs                  AppBar-Anmeldung + Ausblenden der Windows-Taskleiste
├── Services/WindowTracker.cs         Fenster finden, Symbole, aktivieren/minimieren/schließen
├── Services/OutlookCalendarService.cs  Outlook-Termine (eigener STA-Thread)
├── Services/ClaudeSessionService.cs  Claude-Code-Protokolle auswerten
├── Services/InfoServices.cs          Wetter, CPU/RAM/Akku
└── ViewModels/ViewModels.cs          App-Gruppen, Claude-Chips, Farben
```

## Bekannte Grenzen

- Nur der Hauptbildschirm bekommt die Leiste.
- Kein Infobereich (Tray-Symbole) – dafür die Windows-Taskleiste eingeblendet lassen oder per `Win + B` erreichen.
- Fenster werden alle 0,7 s abgefragt statt über Shell-Hooks.

## Ideen für danach

- Microsoft Graph für das neue Outlook und Teams-Status
- Claude-Code-Hooks (`Notification`, `Stop`) für exakte Zustände statt Ableitung
- Medien-Steuerung (gerade läuft …), Zwischenablage-Verlauf, Schnellsuche
- Mehrere Bildschirme, helles Design
