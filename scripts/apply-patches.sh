#!/usr/bin/env bash
# Wendet patches/*.patch der Reihe nach auf das Submodule joplin/ an und legt
# dort den Branch "tile-view" auf dem gepinnten Upstream-Commit an.
# Idempotent: ein bereits vorhandener Branch tile-view wird neu aufgesetzt.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/joplin"

BASE="$(git rev-parse HEAD)"
if git rev-parse --verify --quiet tile-view >/dev/null; then
	echo "Branch tile-view existiert, wird auf $BASE neu aufgesetzt (alte Commits bleiben als Reflog erhalten)."
fi
git checkout -q -B tile-view "$BASE"

shopt -s nullglob
PATCHES=("$ROOT"/patches/*.patch)
if [ ${#PATCHES[@]} -eq 0 ]; then
	echo "Keine Patches in patches/ – unveränderter Joplin-Stand ($BASE)."
	exit 0
fi

git -c user.name="tile-view" -c user.email="tile-view@localhost" am --3way "${PATCHES[@]}"
echo "${#PATCHES[@]} Patch(es) angewendet. HEAD: $(git rev-parse --short HEAD)"
