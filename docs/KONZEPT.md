# Konzept: Tabellen mit Formeln, Einkaufslisten, Teilen

Stand: 23.09.2026. Arbeitsnotiz, nichts davon ist umgesetzt. Entscheidungen, die noch offen sind,
stehen am Ende jedes Abschnitts.

## 1. Tabellen mit Formeln

**Umsetzung: Joplin-Plugin**, keine Änderung an der App. Joplin Mobile lädt seit 3.0 Plugins; ein
markdown-it-Content-Script rechnet beim Anzeigen, eine CodeMirror-6-Erweiterung hebt die Syntax im
Editor hervor und blendet optional Ergebnisse ein. Die Notiz enthält weiter reinen Markdown-Text,
funktioniert also auch ohne Plugin, auf dem Desktop und nach dem Sync.

### Syntax (Vorschlag)

Keine Autoerkennung: Ein Wert hat nur dann einen Typ, wenn er ihn ausdrücklich trägt, und gerechnet
wird nur in Zellen, die mit `=` beginnen.

| Schreibweise | Typ | Bemerkung |
|---|---|---|
| `12`, `1,5`, `1.5` | Zahl | Komma und Punkt als Dezimaltrenner |
| `date{23.09.2026}`, `date{23.9.26}`, `date{23.09.}` | Datum | `.` = immer T.M.J; ohne Jahr = aktuelles Jahr |
| `date{2026-09-23}` | Datum | `-` = immer ISO J-M-T |
| `date{23.09.2026 14:05}` | Zeitpunkt | Datum mit Uhrzeit |
| `time{14:05}` | Uhrzeit | |
| `time{1,5h}`, `time{1.5h}`, `time{90min}` | Dauer | |
| `eur{12,50}` | Währung | weitere Währungen nach Bedarf, kein Umrechnen |
| `now` | Zeitpunkt | live, bei jedem Anzeigen neu |
| `B3`, `B2:B9` | Zellbezug | Spalten A, B, …; Zeile 1 = erste Zeile unter der Kopfzeile |
| `[Kommen]` | Zellbezug | Spalte mit dieser Überschrift, gleiche Zeile |

Operatoren `+ - * /`, Klammern, `sqrt{…}`, dazu mindestens `sum{…}`. Mehrere Argumente werden mit `;`
getrennt (Komma ist Dezimaltrenner).

### Typregeln

- Datum − Datum = Dauer; Datum ± Dauer = Datum; Uhrzeit − Uhrzeit = Dauer
- Dauer × Zahl = Dauer; Dauer / Dauer = Zahl
- Dauer × Währung pro Stunde = Währung (`=[Dauer] * eur{12,50}`)
- Alles andere (Datum + Währung, Datum × Zahl …) ist ein Fehler und wird rot angezeigt, statt dass
  geraten wird.

### Stempeluhr-Beispiel

```markdown
| Tag              | Kommen      | Gehen       | Dauer                |
|------------------|-------------|-------------|----------------------|
| date{22.09.2026} | time{08:12} | time{16:40} | =[Gehen] - [Kommen]  |
| date{23.09.2026} | time{08:05} | now         | =[Gehen] - [Kommen]  |
| **Summe**        |             |             | =sum{D1:D2}          |
```

`now` rechnet live – gut für „läuft gerade“. Zum Ausstempeln fügt ein Editor-Befehl
„Jetzt stempeln“ den festen Wert ein (`time{16:40}` bzw. `date{23.09.2026 16:40}`); ein live
berechnetes `now` wäre bei jedem Öffnen anders.

### Grenzen

- Die Kachelvorschau zeigt Rohtext, also Formeln statt Ergebnisse.
- Der Rich-Text-Editor versteht die Syntax nicht; bearbeitet wird im Markdown-Editor.

### Offen

- Datum ohne Jahr über den Jahreswechsel: `date{28.12.} → date{03.01.}` negativ oder „nächstes Jahr“?
- Anzeigeformat von Dauern (`7:45 h` oder `7,75 h`), einstellbar pro Spalte?
- Welche Währungen, welches Rundungsverhalten?

## 2. Einkaufsliste (wie Bring)

Artikel eintippen, sie erscheinen als Kacheln mit Icon; Antippen hakt ab, abgehakte wandern in
„Zuletzt gekauft“ und lassen sich mit einem Tippen wieder aktivieren.

### Icons

- **Grundstock**, mitgeliefert: 300–500 Icons in einheitlichem Stil. Basis ein freies Emoji-Set
  (OpenMoji CC BY-SA, Noto Apache 2.0, Twemoji CC BY), oder ein einmalig vorab generiertes Set.
- **Synonym-Wörterbuch**: „H-Milch“, „Hafermilch“, „Vollmilch“ → Milch. Bringt mehr als jedes Modell.
- **Fallback**: Kategorie-Icon oder Anfangsbuchstabe.
- **Keine Bildgenerierung auf dem Gerät**: Modelle wie Stable Diffusion brauchen 1–2 GB, Sekunden
  pro Bild und nativen Code (als Plugin unmöglich), und einzeln generierte Bilder passen stilistisch
  nicht zusammen. Optional später: einmalige Generierung über eine Cloud-API mit eigenem Schlüssel,
  Ergebnis wird gespeichert und nie wieder erzeugt.

### Datenmodell

Ein Datensatz pro Artikel, nicht eine Notiz mit Checkliste – sonst erzeugt jede gleichzeitige
Änderung zweier Personen einen Konflikt.

```json
{ "name": "Äpfel", "detail": "1 kg, Elstar", "kategorie": "obst",
  "offen": true, "geloescht": false,
  "geaendert": 1790000000123, "geraet": "a1b2c3" }
```

- **Schlüssel** des Datensatzes = normalisierter Name (klein, getrimmt, Unicode-NFC, Synonyme
  aufgelöst). Fügen zwei Personen gleichzeitig „Milch“ hinzu, landet beides im selben Datensatz.
- **Neuere Änderung gewinnt** (`geaendert` in Millisekunden, bei Gleichstand entscheidet `geraet`).
- **Löschen** setzt `geloescht: true` statt den Datensatz zu entfernen, damit ein Gerät, das offline
  war, den Artikel nicht wiederbelebt. Alte gelöschte Einträge werden nach einiger Zeit aufgeräumt.
- **Listen-Einstellungen** (Name, Reihenfolge der Kategorien nach Laufweg im Laden, eigene
  Synonyme) als eigener Datensatz derselben Art.

Das Modell kommt ohne Server-Logik aus: Jedes Gerät hat den vollständigen Stand, zwei Stände lassen
sich in beliebiger Reihenfolge zusammenführen. Es passt damit auf jeden Transport (Abschnitt 3).

### Plugin oder App

**App (Patch in der Kachelansicht).** Ausschlaggebend ist das Teilen: Einladungslinks müssen die
App öffnen (Intent-Filter), dauerhafte WebSocket-Verbindungen und Hintergrund-Sync (WorkManager)
brauchen Android-Zugriff. Ein Plugin läuft in einer WebView ohne das.

Die Listen liegen deshalb **nicht in Joplin-Notizen**, sondern in einer eigenen lokalen Tabelle der
App. Joplin-Suche und Desktop sehen sie nicht; ein Export als Checklisten-Notiz ist nachrüstbar.

### Offen

- Mengen strukturiert (`2`, `l`) oder Freitext im Feld `detail`?
- Welches Icon-Set als Basis? Lizenz CC BY-SA (OpenMoji) verlangt Namensnennung in der App.

## 3. Teilen

Anforderung: für alle Nutzer, ohne Konto, ohne dass jemand (auch nicht der Projektbetreiber)
Infrastruktur betreibt oder bezahlt; wer will, kann selbst hosten.

### Verworfen

| Ansatz | Grund |
|---|---|
| Joplin-Notizbuch-Freigabe | Nur mit Joplin Server/Cloud, nicht mit WebDAV, Dropbox usw. |
| Ordner auf dem eigenen Sync-Speicher freigeben (WebDAV, HiDrive …) | Je Anbieter anders, beide brauchen denselben Anbieter, für Laien zu umständlich |
| SQLite-Datei auf WebDAV | Nur ganze Dateien, gleichzeitiges Schreiben überschreibt still |
| Eigenes Backend (Supabase o. ä.) | Laufender Betrieb, Kosten, Impressum/Datenschutz für einen öffentlichen Dienst |
| Reines Peer-to-Peer übers Internet | NAT/CGNAT verhindert direkte Verbindungen, braucht doch Vermittlungs- und Relay-Server; beide Geräte müssten gleichzeitig wach sein |
| RCS, SMS, WhatsApp | Keine API für normale Apps (RCS, WhatsApp privat), SMS-Berechtigungen und Kosten |
| Matrix | Offen und föderiert, aber Konto pro Person nötig und E2EE in React Native aufwendig – höchstens als Zusatz |

### Gewählt: Nostr-Relays + lokales WLAN

**Einladung.** Teilen erzeugt einen Link oder QR-Code mit einem zufälligen 32-Byte-Listen-Schlüssel
im Fragment (`…#k=<base64url>`); das Fragment wird von keinem Server gesehen. Wer den Link hat, kann
lesen und schreiben. Ausschließen = neuer Schlüssel, Link neu an die Verbleibenden.

**Schlüsselableitung** (HKDF-SHA256 aus dem Listen-Schlüssel):
- Nostr-Schlüsselpaar der Liste – alle Mitglieder schreiben unter derselben Identität
- NIP-44-Schlüssel für den Inhalt
- d-Tag eines Artikels = HMAC(Listen-Schlüssel, normalisierter Name) – das Relay sieht keinen Namen

**Transport 1: Nostr.** Jeder Artikel ist ein adressierbares NIP-78-Event (kind 30078), Inhalt
NIP-44-verschlüsselt. Relays behalten pro d-Tag nur das neueste Event – das ist genau „neuere
Änderung gewinnt“. Die App schreibt parallel auf 3–5 Relays; Relays sind in den Einstellungen
änderbar, eigenes Relay (strfry, nostr-rs-relay, Docker) möglich. Bei offener App WebSocket-Abo
(Echtzeit), im Hintergrund WorkManager (etwa alle 15 min). Kein Push.

**Transport 2: lokales WLAN.** Geräte finden sich per Android NSD (`_joplintiles._tcp`) und tauschen
dieselben signierten, verschlüsselten Events aus. Ohne Internet, ohne Relay.

**Zeitstempel.** Relays ersetzen nach `created_at` (Sekunden). Die App setzt `created_at` auf den
Zeitpunkt der Änderung und führt die genaue Zeit zusätzlich verschlüsselt im Inhalt (`geaendert`).
Vor dem Nachreichen alter Änderungen (Gerät war offline) wird der Relay-Stand gelesen; nur wenn die
eigene Änderung neuer ist, wird veröffentlicht. Lehnt ein Relay den alten Zeitstempel ab, wird mit
`created_at = jetzt` erneut veröffentlicht – maßgeblich für das Zusammenführen bleibt `geaendert`.

**Was Relays sehen:** einen öffentlichen Schlüssel pro Liste, Anzahl und Zeitpunkte der
Änderungen, IP-Adressen. Keine Namen, keine Inhalte.

**Icons** werden nicht über Relays übertragen (Größenlimits, siehe unten). Artikel verweisen auf
ein Icon des Grundstocks; eigene Icons bleiben vorerst lokal.

### Relay-Test

Skript: [experiments/nostr-relay-probe](../experiments/nostr-relay-probe/README.md).

Lokal gegen `nostr-relay` 1.14 (Python, Standardkonfiguration):

| Prüfung | Ergebnis |
|---|---|
| Schreiben, Ersetzen durch neuere Version | ✓ |
| Verspätete ältere Version | ✗ – Relay speichert sie zusätzlich und liefert beide |
| Drei Tage alter Zeitstempel | ✓ (dieses Relay lehnt erst ab 1 Jahr ab, andere strenger) |
| Echtzeit zu zweiter Verbindung | ✓, ~10 ms |
| Inhaltsgröße | 0,5 und 1 kB ✓, ab 4 kB abgelehnt (`max_event_size` 4096), ohne OK-Antwort |
| Kaltstart, Löschen per NIP-09 | ✓ |

Folgerungen, die schon ohne öffentliche Relays feststehen:
- Die App darf sich nicht darauf verlassen, dass Relays ersetzen; sie wählt selbst das neueste
  Event pro d-Tag.
- Events klein halten (typischer Artikel verschlüsselt: 176–260 Zeichen).
- Ausbleibende OK-Antworten mit Timeout behandeln.

**Ausstehend:** Lauf gegen die öffentlichen Relays in `relays.txt` (in der Cloud-Umgebung gesperrt),
danach mit `--keep` / `--check` über mehrere Tage prüfen, wie lange Relays die Events behalten.

### Offen

- Link-Format: eigenes Schema (`joplintiles://`) ist in Messengern oft nicht anklickbar; ein
  `https://`-Link bräuchte eine Domain mit `assetlinks.json` (z. B. GitHub Pages des Repos).
- Welche Relays als Voreinstellung – nach dem Testlauf entscheiden.
- Eigene Icons teilen: später evtl. verschlüsselt über Blossom (Nostr-Dateiablage) oder gar nicht.
