# Joplin Tile View

Joplin Mobile (Android) mit eingebauter Kachelansicht im Google-Keep-Stil als Startansicht
statt der Titelliste. Das Projekt ist ein Fork von [laurent22/joplin](https://github.com/laurent22/joplin)
in Form von Submodule + Patch-Serie, damit die Änderungen bei jedem Joplin-Release nachgezogen und
später als Upstream-PR eingereicht werden können.

Das bestehende Plugin „Tile View“ (`com.sebastian.tile-view`) bleibt davon unberührt und dient als Fallback.

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
- [ ] Schritt 1: Unveränderter Joplin-Build läuft durch (CI-Lauf abwarten)
- [ ] Schritt 2: Einstiegspunkte – siehe [docs/ANALYSE.md](docs/ANALYSE.md)
- [ ] Schritt 3: Kachelkomponente (`TileView`) mit Titel/Vorschau/erstem Bild
- [ ] Schritt 4: Einstellung Liste/Kacheln, Standard Kacheln
- [ ] Schritt 5: Pinch-Zoom, Spaltenzahl

## Dokumente

- [docs/UEBERGABE.md](docs/UEBERGABE.md) – Ausgangslage und Reihenfolge
- [docs/ANALYSE.md](docs/ANALYSE.md) – gefundene Dateien und Einstiegspunkte in Joplin
- [docs/BUILD.md](docs/BUILD.md) – Build lokal und in CI, Stolperfallen bei der Installation

## Arbeitsweise

Änderungen an Joplin werden im Submodule auf dem Branch `tile-view` committet und mit
`scripts/export-patches.sh` nach `patches/` geschrieben. Nur `patches/` und der Submodule-Zeiger
werden hier eingecheckt.
