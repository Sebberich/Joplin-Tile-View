# Konzept: Tabellen mit Formeln, Einkaufslisten, Teilen

Stand: 23.09.2026. Arbeitsnotiz. Entscheidungen, die noch offen sind, stehen am Ende jedes Abschnitts.

## Stand der Umsetzung

| Teil | Stand | Wo |
|---|---|---|
| Formel-Tabellen | Umgesetzt als Plugin, 60 Tests; noch nicht in einer echten Joplin-Instanz ausprobiert | `plugins/formula-tables/`, `.jpl` hängt am Release |
| Einkaufsliste: Kern (Datenmodell, SQLite, Merge pro Feld, Krypto, Einladungen) | Umgesetzt, 71 Tests | Patch 0020, `packages/app-mobile/lists/core/` |
| Einkaufsliste: Relay-Sync (offene und verwaltete Listen, Verzeichnis, Beitritt, Neuveröffentlichung) | Umgesetzt, Tests mit Fake-Relay; gegen öffentliche Relays noch nicht gelaufen | Patch 0021, `lists/sync/` |
| Einkaufsliste: Oberfläche (Übersicht, Kacheln, Teilen per QR/Link/Code, Beitritt per Scan, Mitglieder, Statuskreis, Einstellungen) | Umgesetzt; Gerätetest steht aus | Patch 0022, `lists/ui/` |
| Bluetooth-Abgleich (Android) | Umgesetzt: natives Modul, Protokoll (`lists/nearby/PROTOCOL.md`), Vordergrunddienst; CI kompiliert, Gerätetest mit zwei Handys steht aus | Patches 0026, 0028, `lists/nearby/` |
| Mengen (addierend, pro Gerät gezählt, 5-Minuten-Regel), Namen über Profil-Events, Benachrichtigungen bei Änderungen, Test-Logging | Umgesetzt | Patches 0024, 0028, 0029 |
| Chat pro Liste mit Benachrichtigungen, optional UnifiedPush (ntfy) für sofortige Zustellung übers Internet | **Geplant** nach dem Bluetooth-Gerätetest | – |
| Statistik für Artikel ohne Icon (Häufigkeit, abschaltbar, exportierbar) | **Geplant**, siehe Abschnitt 2 „Artikel ohne Icon zählen“ | – |
| Bluetooth-Mesh (Reichweite über mehrere Handys strecken) | **Geplant**, siehe Abschnitt 3 „Bluetooth-Mesh“ | – |
| Emoji von Hand festlegen (auch über die Emoji-Tastatur) | **Geplant**, siehe Abschnitt 2 „Emoji von Hand festlegen“ | – |
| Herunterziehen zum Aktualisieren (mit Kreisel) | **Geplant**, siehe Abschnitt 2 „Herunterziehen zum Aktualisieren“ | – |
| Sicherung der Listen (Export/Import als Datei) | **Nächstes Release**, siehe Abschnitt 4 | – |
| Weitere Funktionen (Rezepte, „Ich hol das“, Läden, Widget, Teilen in die App, Aktivitätsleiste, Wiederkauf-Vorschläge, Listen als Kacheln, Kacheln anheften/färben, Summenzeile/CSV) | **Notiert**, siehe Abschnitt 4 | – |

Abweichungen vom Konzept in der Umsetzung:
- **Icons sind Emoji** des Systemfonts (Katalog mit 449 Artikeln, 15 Kategorien, deutschen Synonymen in
  `lists/catalog/`), kein eigenes Bildset. Keine Lizenzfragen, kein Asset-Gewicht; ein gezeichnetes Set
  kann später denselben Katalog nutzen.
- **Beitritt zu verwalteten Listen** wird von der Admin-App beim nächsten Abgleich automatisch angenommen,
  wenn die Einladung gültig ist (Rolle, Ablauf, einmalig). Eine manuelle Bestätigung gibt es nicht.
- **Verzeichnis-Signatur:** Ein mit dem Listen-Schlüssel signiertes Verzeichnis wird immer akzeptiert
  (bei offenen Listen haben alle diesen Schlüssel, bei verwalteten nur der Ersteller); Verzeichnisse mit
  Geräteschlüssel nur von Admins des zuletzt akzeptierten Verzeichnisses.
- **Artikel-Events** tragen pro Feld einen Zeitstempel im verschlüsselten Inhalt, zusätzlich zu
  `created_at`; Relays werden mit `#L = Listen-Schlüssel` abgefragt.
- Voreingestellte Relays: relay.damus.io, nos.lol, relay.primal.net, nostr.mom, relay.nostr.band
  (Einstellung „Einkaufslisten → Relays“).

## 1. Tabellen mit Formeln

**Umsetzung: Joplin-Plugin**, keine Änderung an der App. Joplin Mobile lädt seit 3.0 Plugins; ein
markdown-it-Content-Script rechnet beim Anzeigen, eine CodeMirror-6-Erweiterung hebt die Syntax im
Editor hervor und blendet die Ergebnisse ein. Die Notiz enthält weiter reinen Markdown-Text,
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

### Zwei Punkte, die von Anfang an richtig sein müssen

- **Formeln vor dem Markdown-Parser abfangen.** markdown-it liest Zelleninhalte als Markdown:
  `=B1*C1` würde den Stern als Kursiv-Markierung, `[Kommen]` als Link-Anfang lesen. Der Formeltext
  muss in einer Core-Regel nach dem Block- und vor dem Inline-Parsing aus den Zellen genommen werden.
  Sonst müsste jede Formel in Backticks stehen.
- **Ergebnisse im Editor einblenden.** Auf dem Handy sieht man entweder Editor oder Viewer. Wer eine
  Stempeltabelle ausfüllt, darf nicht für jede Summe umschalten müssen. Die CodeMirror-Erweiterung
  zeigt das Ergebnis als Dekoration neben der Formel.

### Grenzen

- Die Kachelvorschau zeigt Rohtext, also Formeln statt Ergebnisse.
- Der Rich-Text-Editor versteht die Syntax nicht; bearbeitet wird im Markdown-Editor.
- `now` wird beim Rendern ausgewertet, der Viewer rendert nicht von selbst periodisch neu.

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
{ "name": "Äpfel",
  "detail":    { "v": "1 kg, Elstar", "t": 1790000000123 },
  "kategorie": { "v": "obst",         "t": 1789990000000 },
  "offen":     { "v": true,           "t": 1790000005000 },
  "geloescht": { "v": false,          "t": 1789990000000 },
  "geraet": "a1b2c3" }
```

- **Schlüssel** des Datensatzes = normalisierter Name (klein, getrimmt, Unicode-NFC, Synonyme
  aufgelöst). Fügen zwei Personen gleichzeitig „Milch“ hinzu, landet beides im selben Datensatz.
- **Neuere Änderung gewinnt pro Feld**, nicht pro Artikel. Ergänzt A offline die Menge, während B
  abhakt, bleiben beide Änderungen erhalten. Jedes Feld trägt seinen Zeitstempel `t` (ms); bei
  Gleichstand entscheidet die Gerätekennung. Das Ergebnis hängt nicht von der Reihenfolge ab, in der
  Änderungen ankommen – deshalb funktioniert es mit beliebig vielen Mitgliedern und über beliebige
  Wege (Relay, Bluetooth, Weitergabe über ein drittes Gerät).
- **Uhren:** Gerätezeit ist maßgeblich. Schutz gegen falsch gehende Uhren: Ein Gerät setzt nie
  einen Zeitstempel, der hinter dem neuesten liegt, den es schon gesehen hat.
- **Löschen** setzt `geloescht: true` statt den Datensatz zu entfernen, damit ein Gerät, das offline
  war, den Artikel nicht wiederbelebt. Alte gelöschte Einträge werden nach einiger Zeit aufgeräumt.
- **Listen-Einstellungen** (Name, Reihenfolge der Kategorien nach Laufweg im Laden, eigene
  Synonyme) als eigener Datensatz derselben Art.

### Plugin oder App

**App (Patch in der Kachelansicht).** Ausschlaggebend ist das Teilen: Einladungslinks müssen die
App öffnen (Intent-Filter), Bluetooth, dauerhafte WebSocket-Verbindungen und Hintergrund-Sync
(WorkManager) brauchen Android-Zugriff. Ein Plugin läuft in einer WebView ohne das.

Die Liste hat mit Joplin fast nichts zu tun: keine Notizen, kein Joplin-Sync, nur die
Kachel-Oberfläche. Sie wird deshalb als **abgegrenztes Modul** gebaut (eigener Ordner, eigene
Datenbank, klare Schnittstelle zur Oberfläche), damit sie später auch als eigene App – etwa für
iOS – oder in einem anderen Fork weiterleben kann und die Patches übersichtlich bleiben.

### Lokale Speicherung

Eigene SQLite-Datei `tiles-lists.sqlite` neben der Joplin-Datenbank, geöffnet mit demselben
Treiber (`expo-sqlite` über `DatabaseDriverReactNative`), eigene Versionierung über
`PRAGMA user_version`.

**Nicht** in Joplins Datenbank: Joplin nummeriert seine Migrationen fortlaufend
(`packages/lib/JoplinDatabase.ts`, aktuell 53). Eine eigene Migration 54 würde mit Joplins nächster
54 kollidieren – auf Geräten mit unserer Version stünde bereits „54“, und Joplins Migration würde
stillschweigend übersprungen.

```sql
CREATE TABLE lists (
  id          TEXT PRIMARY KEY,   -- Listenkennung (öffentlicher Schlüssel, siehe Abschnitt 3)
  art         TEXT NOT NULL,      -- 'offen' (gleichberechtigt) oder 'verwaltet' (Admins)
  list_key    BLOB,               -- Listen-Schlüssel (nur bei 'offen')
  content_key BLOB NOT NULL,      -- aktueller Inhaltsschlüssel
  name        TEXT NOT NULL,
  settings    TEXT,               -- JSON, synchronisiert: Kategorie-Reihenfolge, Synonyme
  relays      TEXT,               -- JSON-Array, leer = Voreinstellung der App
  sort_order  INTEGER
);

CREATE TABLE members (
  list_id     TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  pubkey      TEXT NOT NULL,      -- Geräteschlüssel des Mitglieds
  name        TEXT,
  rolle       TEXT NOT NULL,      -- 'admin' oder 'mitglied'
  seit        INTEGER NOT NULL,
  entfernt    INTEGER,            -- Zeitpunkt, wenn entfernt (Tombstone)
  PRIMARY KEY (list_id, pubkey)
);

CREATE TABLE items (
  list_id     TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  d_tag       TEXT NOT NULL,      -- HMAC(content_key, normalisierter Name)
  name        TEXT NOT NULL,
  detail      TEXT,   detail_t    INTEGER,
  kategorie   TEXT,   kategorie_t INTEGER,
  icon        TEXT,               -- Schlüssel aus dem Icon-Grundstock
  offen       INTEGER NOT NULL,   offen_t     INTEGER NOT NULL,
  geloescht   INTEGER NOT NULL DEFAULT 0, geloescht_t INTEGER,
  geraet      TEXT NOT NULL,
  pending     INTEGER NOT NULL DEFAULT 0,  -- lokal geändert, noch nicht veröffentlicht
  PRIMARY KEY (list_id, d_tag)
);
CREATE INDEX items_anzeige ON items(list_id, geloescht, offen, kategorie);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);  -- eigener Geräteschlüssel, Anzeigename
```

- Lokale Änderung: Zeile sofort schreiben (`pending = 1`), Oberfläche aktualisiert sich,
  Veröffentlichen im Hintergrund; `pending = 0`, sobald ein Relay mit OK antwortet.
- Eingehender Datensatz: entschlüsseln, Feld für Feld gegen die Zeile vergleichen, Neueres übernehmen.
- Vorschläge beim Tippen kommen aus den Artikeln aller Listen; eine eigene Tabelle dafür ist unnötig.
- Icon-Grundstock und Synonym-Wörterbuch liegen als mitgelieferte Dateien in der App, nicht in der DB.
- Die Datei wird von Joplin weder synchronisiert noch exportiert (JEX). Deinstallation löscht sie;
  mit Einladung oder Mitgliedschaft lässt sich die Liste von Relays oder anderen Mitgliedern neu laden.
- Geräteschlüssel und Listen-Schlüssel liegen wie Joplins eigene E2EE-Schlüssel in der Datenbank.
  Android-Keystore (`expo-secure-store`) wäre sicherer, ist aber eine neue native Abhängigkeit – später.

### Herunterziehen zum Aktualisieren (geplant)

- In der Liste und in der Listenübersicht: nach unten ziehen zeigt den üblichen Android-Kreisel
  (`RefreshControl` am ScrollView, Farben aus dem Theme) und startet sofort einen Abgleich.
- **Was passiert:** Relay-Abgleich der Liste (bzw. aller Listen in der Übersicht) wie beim Öffnen;
  ist der Bluetooth-Kreis an, zusätzlich ein neuer Übersichtsabgleich mit allen verbundenen Geräten.
- **Kreisel endet**, wenn der Abgleich fertig ist, spätestens nach 15 s. Danach kurze Meldung in der
  Statuszeile: „Aktualisiert“, „Offline – Änderungen werden später gesendet“ oder der Fehler.
- **Gesten:** Pinch-Zoom (zwei Finger) und Herunterziehen (ein Finger, nur ganz oben in der Liste)
  kommen sich nicht in die Quere.
- **Test-Logging:** Start, Dauer, Ergebnis je Weg (Relays, Bluetooth).

### Emoji von Hand festlegen (geplant)

- **Wo:** Kachel lange drücken → Bearbeiten → Feld „Symbol“. Antippen öffnet die normale Tastatur;
  über deren Emoji-Taste (Gboard, Samsung, SwiftKey …) wählt man ein beliebiges Emoji. Darunter eine
  Zeile mit Vorschlägen aus dem Katalog (Emoji der erkannten Kategorie und ähnlicher Artikel) für
  schnelle Auswahl ohne Tastatur. „Zurücksetzen“ stellt das automatische Emoji wieder her.
- **Prüfung:** genau ein Emoji-Graphem (inkl. Varianten mit Hautton, ZWJ-Sequenzen wie 🧑‍🍳 und
  Flaggen); normale Buchstaben werden abgelehnt. Zählung über `Intl.Segmenter`, falls Hermes es
  kann, sonst über eine kleine Regex für Emoji-Grapheme.
- **Gilt für:** diesen Artikel sofort; Option „Für ‚<Name>‘ immer verwenden“ (Standard an) merkt die
  Zuordnung in den Listen-Einstellungen (`settings.customIcons: { normalisierterName: emoji }`).
  Die Listen-Einstellungen werden synchronisiert, also sehen alle Mitglieder dasselbe Symbol, auch
  bei künftigen Artikeln mit dem Namen. Reihenfolge beim Bestimmen des Symbols: Artikel-Feld `icon`
  (von Hand gesetzt) → `customIcons` der Liste → Katalog → Kategorie-Emoji → Anfangsbuchstabe.
- **Sync:** Das Feld `icon` ist schon ein Feld mit eigenem Zeitstempel (neuere Änderung gewinnt),
  braucht also keine Änderung am Protokoll.
- **Statistik:** Von Hand gesetzte Emoji werden in der Icon-Statistik (siehe unten) mit gezählt –
  sie zeigen direkt, welches Emoji Nutzer für einen fehlenden Katalogeintrag wählen.

### Artikel ohne Icon zählen (geplant)

Ziel: über die Zeit sehen, welche Artikel ohne Katalog-Treffer (Anfangsbuchstabe statt Emoji)
häufig vorkommen, um zu entscheiden, welche Icons und Katalogeinträge sich lohnen.

- **Was gezählt wird:** jedes Hinzufügen oder Zurückholen eines Artikels, für den `resolveCatalog`
  kein eigenes Emoji liefert – also auch Treffer, die nur das Kategorie-Emoji bekommen
  (entschieden 28.09.2026). Schlüssel ist der normalisierte Name (klein, NFC), dazu Anzeigename,
  Anzahl, erstes und letztes Vorkommen, Anzahl verschiedener Listen.
- **Wo:** eigene Tabelle `icon_misses` in `tiles-lists.sqlite`, nur lokal, nicht synchronisiert und
  nicht über Relays verschickt. Bekommt ein Name später ein Icon (Katalog-Update), fällt er aus der
  Auswertung heraus, bleibt aber gespeichert.
- **Schalter:** Einstellungen → Einkaufslisten → „Artikel ohne Icon zählen“ (Standard: aus).
  Ausschalten stoppt das Zählen; „Statistik löschen“ leert die Tabelle.
- **Auswertung:** Ansicht in den Einstellungen, sortiert nach Häufigkeit, und Export als CSV
  (`name;anzahl;listen;erstmals;zuletzt`) über das Android-Teilen-Menü, damit sich die Daten
  mehrerer Nutzer später zusammenführen lassen.
- **Später entscheiden** (nach der Testphase): ob sich Nutzer freiwillig an einer gemeinsamen
  Auswertung beteiligen können (dann nur mit ausdrücklichem Export, nie automatisch).

### Offen

- Mengen strukturiert (`2`, `l`) oder Freitext im Feld `detail`?
- Welches Icon-Set als Basis? Lizenz CC BY-SA (OpenMoji) verlangt Namensnennung in der App.

## 3. Teilen

Anforderung: für alle Nutzer, ohne Konto, ohne dass jemand (auch nicht der Projektbetreiber)
Infrastruktur betreibt oder bezahlt; wer will, kann selbst hosten. Zusätzlich ein direkter Weg
zwischen Geräten ohne Internet (schlechter Empfang im Laden), auch zu einem späteren iPhone-Client.

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

### Identitäten, Listenarten, Einladungen

**Jedes Gerät hat ein eigenes Schlüsselpaar** (beim ersten Start erzeugt) und einen Anzeigenamen
(„Sebastians Handy“). Jede Liste hat ein **Mitgliederverzeichnis** (Geräteschlüssel, Name, Rolle,
Beitritt, ggf. Entfernt-Zeitpunkt). Artikel werden mit dem eigenen Geräteschlüssel signiert;
Empfänger akzeptieren nur Datensätze von Geräten im Verzeichnis. Daraus kommen „Milch – von
Sebastian“ und die Zählung „2/7“ beim Bluetooth-Sync.

Zwei Listenarten. Sie unterscheiden sich nur darin, wer das Verzeichnis ändern darf und wie der
Inhaltsschlüssel verteilt wird; Datensätze, Relays, Bluetooth und Merge sind identisch.

| | **Offen** (gleichberechtigt) | **Verwaltet** (Admins) |
|---|---|---|
| Einladung enthält | den Listen-Schlüssel | eine vom Admin signierte Einladung (Rolle, optional einmalig / Ablaufdatum), keinen Schlüssel |
| Beitritt | sofort; Gerät trägt sich selbst ins Verzeichnis ein | Gerät schickt Geräteschlüssel + Einladung verschlüsselt an den Admin (Relay, oder direkt per Bluetooth/QR); die Admin-App prüft und trägt ein. **Der Admin muss dafür einmal online oder in der Nähe sein.** |
| Einladen darf | jedes Mitglied | nur Admins |
| Rollen | keine | `admin` (Mitglieder hinzufügen/entfernen, Rollen, Umbenennen), `mitglied` (Artikel bearbeiten). Mehrere Admins möglich; der Ersteller ist der erste. |
| Inhaltsschlüssel | aus dem Listen-Schlüssel abgeleitet | zufällig; steht im Verzeichnis, für jedes Mitglied einzeln mit dessen Geräteschlüssel verschlüsselt (NIP-44) |
| Entfernen | nur über neuen Listen-Schlüssel und neue Einladung an alle Verbleibenden | Admin nimmt Gerät aus dem Verzeichnis und erzeugt einen neuen Inhaltsschlüssel; das entfernte Gerät liest nichts Neues mehr |
| Verzeichnis signiert | vom Listen-Schlüssel (jedes Mitglied kann es) | nur von Admins |

**Einladung überbringen**, in beiden Arten gleich:
- **QR-Code** auf dem Display, der andere scannt ihn. Steht man nebeneinander, kann die Liste direkt
  per Bluetooth folgen – ganz ohne Internet.
- **Link oder Code** per Nachricht (Messenger, E-Mail, Zettel). Der Link öffnet die App; der Code
  lässt sich alternativ von Hand eintippen. Das Geheimnis steht im URL-Fragment (`#…`), das kein
  Server zu sehen bekommt.

**Grenze, klar benannt:** Relays prüfen nichts, sie nehmen von jedem alles an. Die Rollen setzen
die **Apps** durch, indem sie Datensätze von Nicht-Mitgliedern ignorieren (wie Signal-Gruppen, nur
ohne Server). Ein entferntes Mitglied kann weiter an die Relays schicken, nur liest es niemand mehr;
was es vor dem Entfernen hatte, hat es natürlich noch.

### Transport 1: Nostr-Relays

Nostr ist ein offenes Protokoll: unabhängige Relays nehmen Nachrichten an, speichern und liefern
sie. Viele laufen kostenlos, jeder kann eines aufsetzen (strfry, nostr-rs-relay, Docker). Keine
Konten – Identität ist ein Schlüsselpaar.

- **Listenkennung** = ein aus dem Listen-Schlüssel abgeleitetes bzw. beim Anlegen erzeugtes
  Schlüsselpaar der Liste. Unter dessen Schlüssel liegt das Mitgliederverzeichnis (bei verwalteten
  Listen von den Admins signiert, das Verzeichnis nennt sie). Ein neues Gerät holt zuerst das
  Verzeichnis, dann die Artikel aller Mitglieder (`authors` = Verzeichnis).
- **Artikel** = adressierbares NIP-78-Event (kind 30078) des jeweiligen Geräts, d-Tag =
  HMAC(Inhaltsschlüssel, normalisierter Name), Inhalt NIP-44-verschlüsselt. Relays behalten pro
  Autor und d-Tag das neueste Event; da mehrere Geräte denselben Artikel schreiben, führt der Client
  die Events aller Autoren feldweise zusammen (siehe Datenmodell).
- **Mehrere Relays** parallel (3–5, in den Einstellungen änderbar, eigenes möglich). Bei offener
  App WebSocket-Abo (Echtzeit), im Hintergrund WorkManager (etwa alle 15 min). Kein Push.
- **Relays sind Briefkasten, nicht Speicher.** Jedes Gerät hat den vollständigen Stand und
  veröffentlicht seine Liste regelmäßig komplett neu (z. B. wöchentlich). Relays müssen nur die
  längste Offline-Zeit eines Mitglieds überbrücken; was sie gelöscht haben, liegt kurz darauf wieder dort.
- **Zeitstempel.** `created_at` = Zeitpunkt der Änderung; die genauen Feld-Zeitstempel stehen
  verschlüsselt im Inhalt und sind fürs Zusammenführen maßgeblich. Lehnt ein Relay einen alten
  `created_at` ab (Gerät war lange offline), wird mit `created_at = jetzt` erneut veröffentlicht.
- **Was Relays sehen:** öffentliche Schlüssel, Anzahl und Zeitpunkte der Änderungen, IP-Adressen.
  Keine Namen, keine Inhalte.
- **Icons** gehen nicht über Relays (Größenlimits); Artikel verweisen auf den Grundstock.

### Transport 2: Bluetooth Low Energy (direkt, ohne Internet)

Der einzige Weg, der Android und iPhone direkt verbindet. Kein Betriebssystem-Pairing: Die App
verschlüsselt selbst mit den Schlüsseln, die die Mitglieder ohnehin haben.

**Bedienung – der Kreis oben rechts** (Nahbereichs-Sync läuft nur, wenn man ihn einschaltet):

| Zustand | Anzeige | Verhalten |
|---|---|---|
| Aus | roter Kreis | kein Signal, keine Suche; Standard beim Öffnen |
| Suchen | gelber Kreis mit drehendem Ring | Gerät sendet Token und sucht |
| Gefunden | grüner Kreis mit `2/7` | 2 von 7 Mitgliedern in Reichweite; Abgleich läuft bei jeder Änderung |
| Nicht möglich | grauer Kreis | Bluetooth aus oder Berechtigung fehlt; Antippen erklärt es |

- Antippen: rot → gelb (an); gelb/grün → rot (aus). Langes Drücken zeigt die gefundenen Geräte mit Namen.
- Ein Gerät, das 30 s nicht mehr gehört wurde, fällt aus der Zählung; bei 0 zurück auf Gelb.
  Wiederkommende Geräte werden ohne Zutun wieder gezählt.
- Automatisch aus nach einstellbarer Zeit (Vorgabe 2 h) und wenn die App länger im Hintergrund war.
- Gilt für die geöffnete Liste (das Signal trägt deren Token).

**Protokoll** (gehört auch in den späteren iOS-Client):
1. *Erkennen:* Advertising mit fester App-Service-UUID und einem rotierenden Token =
   HMAC(Inhaltsschlüssel, „adv“ ‖ aktuelle Viertelstunde), gekürzt. Nur Mitglieder können ihn
   nachrechnen; für Fremde ist es alle 15 min neues Rauschen, kein Wiedererkennen oder Verfolgen.
2. *Verbinden:* Wer einen passenden Token sieht, verbindet sich als Central (GATT). Beide beweisen
   sich per Challenge-Response die Kenntnis des Inhaltsschlüssels und nennen ihren Geräteschlüssel
   (gegen das Verzeichnis geprüft). Danach ist der Kanal mit einem Sitzungsschlüssel verschlüsselt.
3. *Abgleich:* Beide schicken eine Übersicht (pro Artikel d-Tag und Feld-Zeitstempel, ~50 B/Artikel);
   jeder sendet dem anderen, was der nicht oder nur älter hat. Die Nutzdaten sind **dieselben
   signierten Events wie über Nostr** – ein Merge-Code für beide Wege. Ein Gerät ohne Stand schickt
   eine leere Übersicht und bekommt alles (Erstsync ohne Internet).
4. *Fragmentierung:* Events werden in MTU-große Stücke geteilt (185–512 B); Durchsatz einige kB/s
   bis ~100 kB/s reicht für Listen, nicht für Icons.

**Reichweite:** BLE typisch 10–30 m in Innenräumen, Regale und Körper dämpfen. Für zwei Personen im
selben Laden ausreichend; wer sich entfernt und zurückkommt, wird automatisch wieder gefunden.
**Long Range (Coded PHY, BLE 5)** optional, wenn Sender und Empfänger es können
(`isLeCodedPhySupported()`): grob 2–4× Reichweite, niedrigere Datenrate. Zusätzlich muss weiter
auf 1M PHY gesendet werden, sonst sehen iPhones und ältere Androids nichts. Aufwand klein, Testen groß.

**Einschränkungen:**
- Beide Apps müssen offen sein (Listenbildschirm). Android könnte mit Vordergrund-Benachrichtigung
  weitermachen. Ein iPhone im Hintergrund sendet in einer Form, die Android **nicht** sieht (iOS-Eigenheit).
- Berechtigungen: Android Bluetooth (bis Android 11 zusätzlich Standort), iOS einmal Bluetooth.
- Suchen/Verbinden gibt es fertig (`react-native-ble-plx`); das eigene Senden (Peripheral) ist auf
  Android in den Bibliotheken schwach gepflegt – vermutlich kleines eigenes Kotlin-Modul.

**Mehr als zwei Mitglieder:** Jedes Gerät gleicht mit jedem in Reichweite ab; alle senden denselben
Listen-Token und unterscheiden sich erst beim Verbinden über den Geräteschlüssel. C bekommt A's
Änderungen auch über B. Die Reihenfolge ist egal, weil pro Feld die neuere Änderung gewinnt.

### Bluetooth-Mesh (geplant)

Ziel: Sind mehrere Handys im Laden, soll eine Änderung auch Geräte erreichen, die außerhalb der
direkten Bluetooth-Reichweite des Absenders sind – jedes Handy dazwischen reicht weiter.

**Stufe 1 – Mesh unter Listenmitgliedern.** Das Datenmodell trägt das bereits (Merge pro Feld,
Reihenfolge egal, jedes Mitglied darf Artikel-Events signieren). Stand heute (Patch 0026/0029):
Ein Gerät pusht live nur *eigene* Änderungen (`pendingItems`); was es von A empfangen hat, erreicht
C erst beim nächsten Verbindungsaufbau mit Übersichtsabgleich. Umsetzung: empfangene Änderungen
sofort an alle anderen verbundenen Mitglieder weiterreichen (außer an den Absender), Duplikate über
d-Tag + Feld-Zeitstempel erkennen, damit nichts im Kreis läuft. Aufwand klein; Nutzen z. B. für eine
Familie mit drei Handys, die sich im Laden verteilt.

**Stufe 2 – Weiterleitung über fremde Handys.** Andere Nutzer der App, die *nicht* Mitglied der
Liste sind, leiten verschlüsselte Events blind weiter („Store and Forward“). Sie können nichts
lesen (NIP-44), prüfen nur die Signatur.
- **Freiwillig:** Einstellung „Als Weiterleitung für andere helfen“, Standard aus. Nur aktiv, solange
  der eigene Kreis gelb/grün ist (kein Dauerbetrieb im Hintergrund).
- **Erkennung:** Zusätzlich zum Listen-Token ein allgemeines Weiterleitungs-Signal (feste
  Service-Kennung); Mitglieder einer Liste senden ihre Events auch an Weiterleiter in Reichweite.
- **Begrenzung:** Hop-Limit (z. B. 4), Lebensdauer (z. B. 30 min), Zwischenspeicher pro Weiterleiter
  (z. B. 200 Events / 256 KB), Ratenlimit pro Quelle, Duplikaterkennung über Event-ID.
- **Datenschutz:** Weiterleiter sehen, dass eine Liste aktiv ist. Damit man eine Liste nicht über
  Tage an ihrem festen öffentlichen Schlüssel wiedererkennt, bekommen weitergeleitete Events eine
  zusätzliche Hülle mit rotierender Kennung (aus dem Listen-Schlüssel abgeleitet, wie das Token);
  nur Mitglieder können sie auspacken.
- **Missbrauch/Akku:** Ohne Mitgliedschaft keine Priorität; Weiterleitung wird bei niedrigem Akku
  (< 20 %) ausgesetzt.
- **Voraussetzung:** Es muss genug App-Nutzer im selben Laden geben. Solange die App wenige nutzen,
  bringt Stufe 2 praktisch nichts – daher erst Stufe 1, Stufe 2 nach Bedarf.

**Bestehende Mesh-Protokolle (Recherche 29.09.2026):**
- *Bluetooth Mesh (Bluetooth SIG):* für IoT (Lampen, Sensoren) mit Provisioning; Handys sind dort
  nur Proxy, keine frei weiterleitenden Knoten. Passt nicht.
- *bitchat* (permissionlesstech, gemeinfrei, Android und iOS): BLE-Mesh mit Weiterleitung über bis
  zu 7 Sprünge, Duplikaterkennung, Fragmente zu ~469 Byte, Noise-Verschlüsselung, Nostr als
  Internet-Weg. Am nächsten an unserer Idee. Aber: laut Whitepaper nicht für Fremd-Apps gedacht
  („interoperates only with BitChat clients“), keine Aussage, ob unbekannte Nachrichtentypen
  weitergeleitet werden; eigene Pakete als bitchat-Nachrichten zu tarnen wäre fragil und würde bei
  öffentlichen Typen in deren Chats auftauchen. Wir müssten zudem ihren kompletten Stack sprechen und
  fremden Verkehr weiterleiten (Akku, Verantwortung). Nutzen nur, wo viele bitchat-Nutzer mit
  laufender App im selben Laden sind.
- *Briar/Bramble, Berty/Wesh, Bridgefy:* Briar synchronisiert direkt ohne fremde Weiterleiter;
  Berty ist ein schwerer Go-Stack mit kleiner Nutzerbasis; Bridgefy ist ein kostenpflichtiges,
  proprietäres SDK.
- **Folgerung:** eigenes Protokoll (wie oben), Parameter an bitchat angelehnt (TTL, Duplikate,
  Fragmentgröße). Eine optionale „bitchat-Brücke“ erst prüfen, wenn deren Weiterleitungscode
  (`BluetoothMeshService` im Android-Repo) gelesen ist und klar ist, ob gerichtete Pakete an
  unbekannte Empfänger-IDs weitergeleitet werden.

**Offen:** Hop-Limit und Speichergrenzen nach dem Gerätetest festlegen (hängt von gemessener
Verbindungsdauer und Durchsatz ab); ob iPhones (Hintergrund-Advertising nur eingeschränkt) als
Weiterleiter taugen.

### Ideen, bewusst nicht umgesetzt

- **Wi-Fi Direct** (nur Android): 50–100 m und MB/s statt kB/s, aber kein iPhone, ein eigener
  Transport (Suche, Gruppenbildung, IP, TCP), ein Bestätigungsdialog auf dem Gegengerät zumindest
  beim ersten Mal, und herstellerabhängiges Verhalten. Geschätzt das 1,5- bis 2-fache des
  BLE-Aufwands. Bleibt als Idee, falls BLE-Reichweite im Alltag nicht reicht.
- **Google Nearby Connections** (nur Android, braucht Google-Play-Dienste): findet über BLE,
  wechselt selbst auf Wi-Fi Direct/Hotspot, ohne Dialoge. Weniger Aufwand als eigenes Wi-Fi Direct,
  fällt aber auf Geräten ohne Google aus. Denkbar als Zusatz für Android mit Google.
- **Push-Benachrichtigungen** („Milch wurde hinzugefügt“) bräuchten einen Server; ohne den bleibt es
  beim Abgleich, wenn die App nachfragt.
- **Feinere Rechte** (nur lesen, Rechte pro Person) wären mit den Geräteschlüsseln möglich, für
  Haushalt/WG unnötig.

### Relay-Test

Skript: [experiments/nostr-relay-probe](../experiments/nostr-relay-probe/README.md). Es
simuliert noch das ältere Modell (ein gemeinsamer Schlüssel für alle); für die Relay-Fragen
(Ersetzen, alte Zeitstempel, Größen, Echtzeit, Löschen) ist das gleichwertig.

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
- Die App darf sich nicht darauf verlassen, dass Relays ersetzen; sie führt selbst zusammen.
- Events klein halten (typischer Artikel verschlüsselt: 176–260 Zeichen).
- Ausbleibende OK-Antworten mit Timeout behandeln.

**Ausstehend:** Lauf gegen die öffentlichen Relays in `relays.txt` (in der Cloud-Umgebung gesperrt),
danach mit `--keep` / `--check` über mehrere Tage prüfen, wie lange Relays die Events behalten.

### Offen

- Link-Format: eigenes Schema (`joplintiles://`) ist in Messengern oft nicht anklickbar; ein
  `https://`-Link bräuchte eine Domain mit `assetlinks.json` (z. B. GitHub Pages des Repos).
  Der manuell eintippbare Code muss kurz genug sein (Listenkennung + Geheimnis, Base32?).
- Welche Relays als Voreinstellung – nach dem Testlauf entscheiden.
- Eigene Icons teilen: später evtl. verschlüsselt über Blossom (Nostr-Dateiablage) oder gar nicht.
- Reihenfolge der Umsetzung: Datenmodell + lokale DB + Oberfläche → Relays → Einladungen/Rollen →
  Bluetooth → Long Range.

## 4. Weitere Funktionen (notiert 29.09.2026)

Aus der Ideenrunde; nichts davon ist umgesetzt. Reihenfolge nach dem Bluetooth-Gerätetest festlegen.

### Nächstes Release

- **Sicherung der Listen.** JEX-Export und Joplin-Sync enthalten die Einkaufslisten nicht. In der
  Listenübersicht (⋮) „Listen exportieren“ → eine Datei (`joplin-tiles-listen-<datum>.json`, optional
  mit Passwort verschlüsselt, da sie Listen-Schlüssel enthält) über das Teilen-Menü; „Listen
  importieren“ liest sie wieder ein und führt mit vorhandenen Listen zusammen (gleicher Merge wie
  beim Sync, nichts wird überschrieben). Enthalten: Listen, Artikel, Mitglieder, eigene
  Einstellungen, Geräteschlüssel nur auf ausdrücklichen Wunsch (Umzug aufs neue Handy).

### Einkaufslisten

- **Rezepte aus Joplin-Notizen.** In einer Notiz mit Zutaten (Checkliste oder Liste) ein Befehl
  „Zutaten auf Einkaufsliste“ → Auswahl der Liste, Vorschau mit Häkchen pro Zutat, Mengen werden
  addiert (gleiche Eingabe-Logik wie beim Tippen). Einstieg über das ⋮-Menü der Notiz.
- **„Ich hol das“.** Kachel lange drücken → „Ich hol das“; die anderen sehen den Namen klein auf der
  Kachel. Beim Abhaken oder nach 2 h verfällt die Markierung. Feld mit Zeitstempel wie die anderen,
  also ohne Protokolländerung.
- **Laufweg pro Laden.** Mehrere Läden mit eigener Kategorie-Reihenfolge. Bewusst versteckt: ein
  Symbol oben in der Kopfzeile wie Joplins Sortier-/Filter-Symbol, dahinter Ladenauswahl und
  „Reihenfolge bearbeiten“ (Kategorien ziehen). Die Läden liegen in den Listen-Einstellungen und
  werden synchronisiert; welcher Laden gerade gewählt ist, bleibt pro Gerät.
- **Android-Widget.** Liste auf dem Startbildschirm (offene Artikel mit Emoji, Antippen hakt ab) und
  Schnell-Eingabe; Auswahl der Liste beim Einrichten. Nativer Teil (AppWidgetProvider), Daten aus
  der Listen-Datenbank.
- **Teilen in die App.** Text aus anderen Apps (z. B. WhatsApp „bring Milch und Eier mit“) über das
  Android-Teilen-Menü an „Einkaufsliste“ schicken → Vorschau, welche Artikel erkannt wurden
  (Trennung an Kommas, „und“, Zeilen), Liste wählen, übernehmen.
- **Aktivitätsleiste.** Statt „Rückgängig“: ein schmales Band am unteren Rand (Snackbar), das
  Änderungen anderer anzeigt – „Karl hat Milch 🥛 entfernt“, „Julia hat Spaghetti 🍝 hinzugefügt“.
  Mehrere Änderungen kurz hintereinander werden zusammengefasst oder nacheinander gezeigt
  (je ~3 s), Antippen zeigt die letzten Änderungen als Liste. Gleiche Quelle wie die
  Benachrichtigungen (`remoteChanges`), aber nur solange die Liste offen ist.
- **Wiederkauf-Vorschläge.** Aus dem lokalen Verlauf lernen, in welchem Abstand etwas gekauft wird
  („Milch etwa alle 5 Tage“); fällige Artikel erscheinen als Vorschlags-Chips über der Eingabe
  („Milch fällig?“). Nur lokal, baut auf derselben Zähltabelle wie die Icon-Statistik auf.
- **Listen als Kacheln.** Die Listenübersicht als Kachelraster wie die Notizen: pro Liste eine Kachel
  mit Name, Anzahl offener Artikel und den ersten Emoji als Vorschau.
- *Verworfen:* Checklisten direkt in der Notiz-Kachel abhaken (führt zu versehentlichem Abhaken).

### Kachelansicht und Notizen

- **Kacheln anheften und einfärben** wie in Google Keep: angeheftete Notizen oben, Farbe über ein Tag
  (z. B. `farbe:gelb`), damit sie mit Joplin synchron bleibt und auf dem Desktop sichtbar ist.

### Formel-Tabellen (Plugin)

- **Automatische Summenzeile** (Befehl „Summenzeile einfügen“, erkennt Spaltentyp) und
  **CSV-Export** einer Tabelle mit berechneten Werten, z. B. für die Stempeluhr-Abrechnung.

### Noch nicht entschieden

- Eigener Signaturschlüssel für die APK (bisher Debug-Keystore; ein späterer Wechsel erzwingt eine
  Neuinstallation) und ein automatischer App-Test im Emulator in CI.
