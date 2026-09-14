# Joplin Tile View

Joplin Mobile (Android) mit eingebauter Kachelansicht im Google-Keep-Stil als Startansicht
statt der Titelliste. Das Projekt ist ein Fork von [laurent22/joplin](https://github.com/laurent22/joplin)
in Form von Submodule + Patch-Serie, damit die Änderungen bei jedem Joplin-Release nachgezogen und
später als Upstream-PR eingereicht werden können.



> ⚠️ **Disclaimer: Dieses Projekt ist „vibe-coded“.** Der Code entsteht überwiegend durch einen
> KI-Assistenten (Claude Code) nach Zuruf; nicht jede Zeile ist von Hand geprüft. Es ist ein
> privates Bastelprojekt in der Testphase – keine Garantie, keine Haftung, keine Zusage auf
> Wartung, Sicherheit oder Datenintegrität. Vor der Benutzung mit echten Notizen: Backup
> anlegen (JEX-Export in Joplin).

## Schnellstart

```bash
git clone --recurse-submodules --shallow-submodules https://github.com/sebberich/joplin-tile-view.git
cd joplin-tile-view
scripts/setup.sh
scripts/build-android.sh    # APK: joplin/packages/app-mobile/android/app/build/outputs/apk/release/app-release.apk
```

Ohne lokale Android-Toolchain: Push auslösen, der Workflow `android-apk` baut das APK und hängt
es als Artefakt an den Lauf. Details in [docs/BUILD.md](docs/BUILD.md).

## Status

- [x] Projektgerüst: Submodule, Patch-Workflow, Build-Skripte, CI
- [x] Schritt 1: Unveränderter Joplin-Build läuft durch ([CI-Lauf #3](https://github.com/Sebberich/Joplin-Tile-View/actions/runs/34762251862), APK-Artefakt)
- [x] Schritt 2: Einstiegspunkte – siehe [docs/ANALYSE.md](docs/ANALYSE.md)
- [x] Schritt 3: Kachelkomponente mit Titel/Vorschau/erstem Bild, Notizbuchfilter (Patches 0002, 0003)
- [x] Schritt 4: Einstellung und Knopf Liste/Kacheln, Standard Kacheln (Patches 0001, 0004)
- [x] Schritt 5: Pinch-Zoom, Spaltenzahl, Schriftgröße (Patch 0005); eigene App-ID `net.cozic.joplin.tileview` (Patch 0006)
- [ ] Gerätetest auf Android: Pinch vs. Scrollen, Bildladen, Filter-Performance

## Dokumente

- [docs/UEBERGABE.md](docs/UEBERGABE.md) – Ausgangslage und Reihenfolge
- [docs/ANALYSE.md](docs/ANALYSE.md) – gefundene Dateien und Einstiegspunkte in Joplin
- [docs/BUILD.md](docs/BUILD.md) – Build lokal und in CI, Stolperfallen bei der Installation

## Arbeitsweise

Änderungen an Joplin werden im Submodule auf dem Branch `tile-view` committet und mit
`scripts/export-patches.sh` nach `patches/` geschrieben. Nur `patches/` und der Submodule-Zeiger
werden hier eingecheckt.
