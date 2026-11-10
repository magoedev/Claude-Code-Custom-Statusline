# claude-statusline

Eine schlanke, konfigurierbare Statusline für [Claude Code](https://code.claude.com/docs/en/statusline) im Terminal. Sie zeigt unter anderem, wie lange der Prompt-Cache noch warm ist, wie voll das Context-Window ist und wie viel Budget verbraucht wurde.

```
Sonnet 5.5 medium · webshop · ⎇ main · PR #1234 pending
ctx ███░░░░░░░ 34% · cache ⏱ 53m 91% hit · budget $314/$500 monthly · ≈$1.23 · +156 -23
```

## Warum dieses Projekt

Die Statusline ist bewusst klein gehalten, damit man sie vollständig lesen und prüfen kann:

- **Eine Datei, keine Abhängigkeiten.** Nur Node.js-Bordmittel, kein `npm install`.
- **Kein Netzwerkzugriff.** Es werden keine Daten gesendet oder geladen.
- **Liest keine Zugangsdaten** und schreibt keine Dateien.
- **Einzige externe Aktionen:** Lesen der eigenen Config-Datei und, wenn das Segment `branch` aktiv ist, ein lokales `git branch --show-current`.

Alle angezeigten Werte stammen aus den Session-Daten, die Claude Code selbst per stdin an das Skript übergibt.

## Voraussetzungen

- Claude Code v2.1.251 oder neuer (für die Cache-Daten)
- Node.js (jede aktuelle LTS-Version)
- Optional: `git` im `PATH` für das Branch-Segment

## Installation

### 1. Repository klonen

```bash
git clone https://github.com/<DEIN-ACCOUNT>/claude-statusline.git ~/.claude/claude-statusline
```

Unter Windows (PowerShell oder Git Bash) funktioniert derselbe Befehl, `~` steht dann für `C:/Users/<du>`.

### 2. In Claude Code eintragen

In `~/.claude/settings.json` ergänzen:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/claude-statusline/statusline.js",
    "refreshInterval": 30
  }
}
```

`refreshInterval` sorgt dafür, dass der Cache-Countdown auch dann weiterläuft, wenn gerade keine Antwort kommt. Unter Windows Pfade immer mit Vorwärts-Slashes (`/`) schreiben.

Claude Code lädt die Einstellungen automatisch neu. Die Statusline erscheint ab der nächsten Aktualisierung.

### 3. Testen (optional)

```bash
node ~/.claude/claude-statusline/examples/demo.js
```

Zeigt die Statusline mit Beispieldaten an, ohne Claude Code zu starten.

## Konfiguration

Ohne Config-Datei gelten sinnvolle Standardwerte. Zum Anpassen die Beispieldatei kopieren:

```bash
cp statusline.config.example.json statusline.config.json
```

Die Config wird an diesen Orten gesucht, der erste Treffer gewinnt:

1. Pfad aus der Umgebungsvariable `CLAUDE_STATUSLINE_CONFIG`
2. `statusline.config.json` im selben Ordner wie `statusline.js`
3. `~/.claude/statusline.config.json`

Die Datei muss nur die Werte enthalten, die du ändern willst. Alles andere wird mit den Standardwerten ergänzt. `statusline.config.json` steht in der `.gitignore`, damit persönliche Einstellungen nicht im Repository landen.

Änderungen wirken ab der nächsten Aktualisierung der Statusline, ein Neustart ist nicht nötig. Ist die Datei kein gültiges JSON, werden die Standardwerte verwendet und unter der Statusline erscheint ein Hinweis.

### Optionen

| Option | Standard | Beschreibung |
|---|---|---|
| `lines` | siehe unten | Liste von Zeilen, jede Zeile eine Liste von Segment-Namen. Reihenfolge = Anzeigereihenfolge. |
| `separator` | `" · "` | Trennzeichen zwischen Segmenten |
| `color` | `true` | Farben an/aus. Die Umgebungsvariable `NO_COLOR` schaltet sie ebenfalls ab. |
| `barWidth` | `10` | Breite des Context-Balkens in Zeichen |
| `thresholds.warn` | `70` | Ab diesem Prozentwert gelb (Context, Limits, Budget) |
| `thresholds.crit` | `90` | Ab diesem Prozentwert rot |
| `segments.<name>` | | Feineinstellungen pro Segment, siehe Tabelle |

Standard-Layout:

```json
"lines": [
  ["model", "project", "branch", "pr"],
  ["context", "cache", "limits", "budget", "cost", "lines"]
]
```

Alles in einer Zeile, nur das Wichtigste:

```json
{ "lines": [["model", "context", "cache"]] }
```

### Segmente

| Segment | Zeigt | Optionen unter `segments.<name>` |
|---|---|---|
| `model` | Modell, Effort-Stufe, Fast Mode | `showEffort` |
| `project` | Repository-Name, sonst Ordnername | |
| `branch` | Aktueller Git-Branch (ruft lokal `git` auf) | |
| `pr` | Offener Pull Request / Merge Request mit Review-Status | |
| `context` | Auslastung des Context-Windows als Balken und Prozent | |
| `cache` | Restlaufzeit des Prompt-Caches, Hit-Ratio, bei kaltem Cache die neu zu cachenden Tokens | `showHitRatio`, `showRecacheTokens` |
| `limits` | 5-Stunden- und 7-Tage-Limit mit Zeit bis zum Reset | `showFiveHour`, `showSevenDay`, `showResetIn` |
| `budget` | Ausgabenlimit hinter einem Claude-Apps-Gateway | `showPeriod` |
| `cost` | Geschätzte Session-Kosten zum Listenpreis | `decimals` |
| `lines` | In der Session hinzugefügte und entfernte Codezeilen | |
| `duration` | Laufzeit der Session | |
| `session` | Name der Session (`--name` / `/rename`) | |
| `agent` | Name des Agents bei `--agent` | |
| `version` | Claude-Code-Version | |

Segmente ohne Daten werden automatisch ausgeblendet. Ein unbekannter Segment-Name erscheint als `?name`, damit Tippfehler auffallen.

## Hinweise für Team- und Enterprise-Accounts

- **`limits`** (5h/7d) liefert Claude Code laut Doku nur für claude.ai-Pro- und Max-Abos oder hinter einem Claude-Apps-Gateway mit Ausgabenlimit. Bei Team-Accounts bleibt das Segment daher meist leer.
- **`budget`** erscheint nur, wenn deine Organisation ein Claude-Apps-Gateway mit Ausgabenlimit betreibt.
- **`cost`** ist eine clientseitige Schätzung zum Listenpreis und entspricht nicht der Abrechnung deiner Organisation. Bei Abos mit festen Plätzen ist das Segment eher eine Orientierung und kann aus `lines` entfernt werden.
- Setzt deine IT in den verwalteten Einstellungen `allowManagedHooksOnly`, wird eine selbst eingerichtete Statusline nicht angezeigt. In dem Fall bei der IT nachfragen.

## Fehlerbehebung

- **Statusline bleibt leer:** Skript manuell mit `node examples/demo.js` testen. Prüfen, ob der Ordner in Claude Code als vertrauenswürdig bestätigt wurde. `claude --debug` zeigt Fehler des Skripts.
- **Windows: Befehl wird nicht gefunden:** Im `command` Vorwärts-Slashes verwenden, keine Backslashes.
- **Cache-Countdown bleibt stehen:** `refreshInterval` in der `statusLine`-Einstellung setzen.
- **Seltsame Zeichen statt Farben:** `"color": false` in der Config setzen.
- **Branch fehlt:** `git` muss im `PATH` liegen, und der Ordner muss ein Git-Repository sein.

Alle verfügbaren Eingabefelder beschreibt die offizielle Doku: <https://code.claude.com/docs/en/statusline>

## Lizenz

MIT, siehe [LICENSE](LICENSE).
