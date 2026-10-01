#!/usr/bin/env bash
# Smoke test: installs the APK on the running emulator/device and plays the Maestro flows
# from .maestro/. Used by the "smoke-test" CI job and locally.
#
#   scripts/smoke-test.sh [path/to/app-release.apk]
#
# Needs: adb (device or emulator already running, locale en-US because the flows look for English
# strings) and Maestro (https://maestro.mobile.dev). Results (screenshots, Maestro report,
# logcat) go to $SMOKE_RESULTS_DIR (default: smoke-test-results/).
#
# The application id is defined here, in one place, and handed to the flows as APP_ID.
# When the id changes (e.g. to io.github.sebberich.forklin), change it here only.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="${1:-$ROOT/joplin/packages/app-mobile/android/app/build/outputs/apk/release/app-release.apk}"
export APP_ID="${APP_ID:-io.github.sebberich.forklin}"
OUT="${SMOKE_RESULTS_DIR:-$ROOT/smoke-test-results}"
mkdir -p "$OUT/screenshots"

collect_logs() {
	adb logcat -d > "$OUT/logcat.txt" 2>&1 || true
}
trap collect_logs EXIT

test -f "$APK" || { echo "APK not found: $APK" >&2; exit 2; }

adb logcat -c || true
echo "Locale: $(adb shell getprop persist.sys.locale | tr -d '\r') / $(adb shell getprop ro.product.locale | tr -d '\r')"
# Best effort: force English for the app (Android 13+). The emulator default is en-US anyway.
adb shell cmd locale set-app-locales "$APP_ID" --locales en-US >/dev/null 2>&1 || true

# Make sure no previous install with another signature is in the way.
adb uninstall "$APP_ID" >/dev/null 2>&1 || true
adb install -r "$APK" || exit 1

# takeScreenshot writes relative to the working directory.
cd "$OUT/screenshots" || exit 1
maestro test \
	-e APP_ID="$APP_ID" \
	--format junit --output "$OUT/maestro-report.xml" \
	--debug-output "$OUT/maestro-debug" \
	--test-output-dir "$OUT/maestro-output" \
	"$ROOT/.maestro" 2>&1 | tee "$OUT/maestro.log"
STATUS=${PIPESTATUS[0]}
echo "Maestro exit code: $STATUS"
exit "$STATUS"
