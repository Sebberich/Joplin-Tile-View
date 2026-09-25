# Nostr-Relay-Probe

Prüft, ob öffentliche Nostr-Relays als Transport für geteilte Einkaufslisten taugen
(Konzept: [docs/KONZEPT.md](../../docs/KONZEPT.md), Abschnitt „Teilen“).

Das Skript simuliert das geplante Datenmodell: Aus einem zufälligen Listen-Schlüssel werden ein
Nostr-Schlüsselpaar, ein NIP-44-Schlüssel und die d-Tags der Artikel abgeleitet; jeder Artikel ist
ein adressierbares NIP-78-Event (kind 30078) mit verschlüsseltem Inhalt. Es werden nur Testdaten
geschrieben und am Ende per NIP-09 wieder gelöscht.

## Ausführen

```bash
cd experiments/nostr-relay-probe
npm install
node probe.mjs                        # alle Relays aus relays.txt
node probe.mjs wss://nos.lol          # einzelne Relays
node probe.mjs --keep                 # Testdaten liegen lassen, Schlüssel wird ausgegeben
node probe.mjs --check <schlüssel>    # Tage später: was ist davon noch da?
```

Braucht Node 18+. Hinter einem Proxy wird `HTTPS_PROXY` verwendet. Die Detailergebnisse landen in
`results-*.json` (nicht eingecheckt).

## Spalten

| Spalte | Prüft | Warum es zählt |
|---|---|---|
| conn | WebSocket-Verbindung | – |
| write | Artikel speichern | Relay nimmt kind 30078 überhaupt an |
| repl | Neuere Version ersetzt die alte, Relay liefert genau eine | „Neuere Änderung gewinnt“ macht das Relay für uns |
| stale | Verspätet eintreffende ältere Version wird verworfen | Sonst muss der Client auswählen (tut er ohnehin, kostet nur Bandbreite) |
| off3d | Event mit drei Tage altem Zeitstempel wird angenommen | Gerät war offline und reicht Änderungen nach |
| live | Zweite Verbindung sieht einen neuen Artikel (Latenz) | Echtzeit bei offener App |
| .5k … 64k | Größe des verschlüsselten Inhalts | Typischer Artikel: 0,2–0,5 kB. Icons gehören nicht in Events |
| load | Frische Verbindung lädt die ganze Liste, Signaturen gültig | Kaltstart auf neuem Gerät |
| del | NIP-09-Löschung entfernt die Testdaten | Artikel endgültig löschen, Aufräumen |

Zusätzlich wird NIP-11 abgefragt; `auth_required`, `payment_required` und `restricted_writes`
werden in den Fehlerdetails gemeldet.

## Stand

Lokal gegen `nostr-relay` 1.14 (Python) geprüft, siehe docs/KONZEPT.md. Der Lauf gegen die
öffentlichen Relays steht noch aus – die Cloud-Umgebung, in der das Skript entstand, sperrt
ausgehende Verbindungen zu Nostr-Relays.
