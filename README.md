# Joplin Tile View

Joplin Mobile (Android) with a built-in Google-Keep-style tile view as the start screen
instead of the note list. The project is a fork of [laurent22/joplin](https://github.com/laurent22/joplin)
in the form of a submodule + patch series, so the changes can be rebased onto every Joplin
release and later submitted as an upstream PR.



> ⚠️ **Disclaimer: This project is "vibe-coded".** The code is written mostly by an AI
> assistant (Claude Code) from prompts; not every line has been reviewed by hand. It is a
> private hobby project in the test phase – no warranty, no liability, no commitment to
> maintenance, security, or data integrity. Back up your data before using this with real
> notes (JEX export in Joplin).

## Quick Start

```bash
git clone --recurse-submodules --shallow-submodules https://github.com/sebberich/joplin-tile-view.git
cd joplin-tile-view
scripts/setup.sh
scripts/build-android.sh    # APK: joplin/packages/app-mobile/android/app/build/outputs/apk/release/app-release.apk
```

Without a local Android toolchain: trigger a push, and the `android-apk` workflow builds the
APK and attaches it as an artifact to the run. Details in [docs/BUILD.md](docs/BUILD.md).

## Status

- [x] Project scaffolding: submodule, patch workflow, build scripts, CI
- [x] Step 1: Unmodified Joplin build passes ([CI run #3](https://github.com/Sebberich/Joplin-Tile-View/actions/runs/34762251862), APK artifact)
- [x] Step 2: Entry points – see [docs/ANALYSE.md](docs/ANALYSE.md) (German)
- [x] Step 3: Tile component with title/preview/first image, notebook filter (patches 0002, 0003)
- [x] Step 4: Setting and button for list/tiles, tiles as default (patches 0001, 0004)
- [x] Step 5: Pinch zoom, column count, font size (patch 0005); own app ID `net.cozic.joplin.tileview` (patch 0006)
- [ ] Device testing on Android: pinch vs. scrolling, image loading, filter performance

## Documents

- [docs/UEBERGABE.md](docs/UEBERGABE.md) (German) – starting point and order of steps
- [docs/ANALYSE.md](docs/ANALYSE.md) (German) – files and entry points found in Joplin
- [docs/BUILD.md](docs/BUILD.md) – building locally and in CI, installation pitfalls

## Workflow

Changes to Joplin are committed in the submodule on the `tile-view` branch and written to
`patches/` with `scripts/export-patches.sh`. Only `patches/` and the submodule pointer are
checked in here.
