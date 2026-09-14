#!/usr/bin/env bash
# Baut das Android-APK aus dem Submodule joplin/.
#
#   scripts/build-android.sh            -> Release-Variante, mit Debug-Keystore signiert (installierbar, ohne Metro)
#   scripts/build-android.sh debug      -> Debug-Variante (braucht laufenden Metro-Server, NICHT standalone lauffähig)
#
# Warum nicht einfach assembleDebug? React Native bündelt das JS im Debug-Build nicht ins APK
# (debuggableVariants = ["debug"] ist der Default). Ein Debug-APK lädt das JS von Metro auf dem
# Entwicklungsrechner. Fürs Handy braucht man daher den Release-Build. Ohne eigenen Keystore
# wäre der unsigniert, deshalb wird hier der in Joplin mitgelieferte Debug-Keystore benutzt.
# Für eigene Signatur: JOPLIN_RELEASE_STORE_FILE, JOPLIN_RELEASE_STORE_PASSWORD,
# JOPLIN_RELEASE_KEY_ALIAS, JOPLIN_RELEASE_KEY_PASSWORD als Umgebungsvariablen setzen.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VARIANT="${1:-release}"
cd "$ROOT/joplin/packages/app-mobile/android"

if [ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]; then
	echo "ANDROID_HOME/ANDROID_SDK_ROOT ist nicht gesetzt – Android SDK fehlt?" >&2
	exit 1
fi

case "$VARIANT" in
	debug)
		./gradlew assembleDebug
		echo "APK: app/build/outputs/apk/debug/app-debug.apk (nur mit Metro-Server nutzbar)"
		;;
	release)
		: "${JOPLIN_RELEASE_STORE_FILE:=debug.keystore}"
		: "${JOPLIN_RELEASE_STORE_PASSWORD:=android}"
		: "${JOPLIN_RELEASE_KEY_ALIAS:=androiddebugkey}"
		: "${JOPLIN_RELEASE_KEY_PASSWORD:=android}"
		./gradlew assembleRelease \
			-PJOPLIN_RELEASE_STORE_FILE="$JOPLIN_RELEASE_STORE_FILE" \
			-PJOPLIN_RELEASE_STORE_PASSWORD="$JOPLIN_RELEASE_STORE_PASSWORD" \
			-PJOPLIN_RELEASE_KEY_ALIAS="$JOPLIN_RELEASE_KEY_ALIAS" \
			-PJOPLIN_RELEASE_KEY_PASSWORD="$JOPLIN_RELEASE_KEY_PASSWORD" \
			-PTILE_VIEW_BUILD_NUMBER="${TILE_VIEW_BUILD_NUMBER:-0}"
		echo "APK: app/build/outputs/apk/release/app-release.apk"
		;;
	*)
		echo "Unbekannte Variante: $VARIANT (release|debug)" >&2
		exit 1
		;;
esac
