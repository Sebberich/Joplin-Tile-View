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
