# Gerätetest: gesammelte Issues

Stand: APK aus CI-Lauf #4 (Patches 0001–0006). Noch keine Fixes, erst sammeln.

| Nr. | Beobachtung | Erwartung | Hinweis für die Umsetzung |
|---|---|---|---|
| 1 | Kacheln sitzen in einem festen Raster, alle Kacheln einer Zeile gleich hoch. | Masonry wie im Plugin: Kacheln haben ihre natürliche Höhe (Bild, Textlänge), Spalten füllen sich unabhängig. | Plugin verteilt Notizen zeilenweise auf N Spalten-Container (`notes[i % ncols]`); in RN: N vertikale Views in einer horizontalen Row innerhalb einer ScrollView, oder FlatList mit `numColumns` ersetzen. Auswahlmodus, Pinch und Leerzustand müssen erhalten bleiben. |
