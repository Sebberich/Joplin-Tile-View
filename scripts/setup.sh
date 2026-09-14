#!/usr/bin/env bash
# Einmalige Einrichtung: Submodule holen, Yarn aktivieren, Abhängigkeiten installieren.
# Voraussetzungen: Node >= 22.12 (Joplin-CI nutzt 24), git, JDK 20 (Temurin) für Android.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Submodule joplin/ (flach) holen"
git submodule update --init --depth 1 joplin

echo "==> Yarn (Version aus joplin/package.json) über Corepack aktivieren"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable
(cd joplin && corepack prepare --activate)

echo "==> Patches anwenden (falls vorhanden)"
"$ROOT/scripts/apply-patches.sh"

echo "==> yarn install (OneNote-Converter-Build wird übersprungen, braucht sonst Rust)"
export SKIP_ONENOTE_CONVERTER_BUILD=1
# Nur Android wird gebaut; das Electron-Binary für app-desktop spart den Download.
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
(cd joplin && yarn install)

echo "==> Fertig. Android-APK bauen mit: scripts/build-android.sh"
