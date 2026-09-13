# patches/

Hier liegen die Änderungen an Joplin als Git-Patch-Serie (`0001-…patch`, `0002-…patch`, …).
Sie werden mit `scripts/apply-patches.sh` auf den im Submodule `joplin/` gepinnten
Upstream-Commit angewendet und mit `scripts/export-patches.sh` aus dem Branch `tile-view`
im Submodule wieder exportiert.

Solange dieses Verzeichnis keine `.patch`-Datei enthält, wird unverändertes Joplin gebaut.
