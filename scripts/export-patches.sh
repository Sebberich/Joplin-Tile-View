#!/usr/bin/env bash
# Exportiert alle Commits des Branches tile-view im Submodule (gegenüber dem
# gepinnten Upstream-Commit) als patches/NNNN-*.patch. Vorher alte Patches löschen,
# damit patches/ exakt dem Branch entspricht.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/joplin"

# Gepinnter Commit aus dem Index (funktioniert auch vor dem ersten Commit des Superprojekts).
BASE="$(git -C "$ROOT" ls-files -s -- joplin | awk '{print $2}')"
if [ -z "$BASE" ]; then
	echo "Konnte gepinnten Submodule-Commit nicht ermitteln." >&2
	exit 1
fi

rm -f "$ROOT"/patches/*.patch
git format-patch --no-stat --zero-commit --no-signature -o "$ROOT/patches" "$BASE..tile-view"
echo "Patches gegenüber $BASE:"
ls -1 "$ROOT/patches"/*.patch 2>/dev/null || echo "(keine – Branch tile-view hat keine eigenen Commits)"
