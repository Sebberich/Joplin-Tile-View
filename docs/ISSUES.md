# Gerätetest: gesammelte Issues

Stand: APK aus CI-Lauf #4 (Patches 0001–0006). Issues 1–2 werden in Patches 0007–0008 umgesetzt.

| Nr. | Beobachtung | Erwartung | Hinweis für die Umsetzung |
|---|---|---|---|
| 1 | Kacheln sitzen in einem festen Raster, alle Kacheln einer Zeile gleich hoch. | Masonry wie im Plugin: Kacheln haben ihre natürliche Höhe (Bild, Textlänge), Spalten füllen sich unabhängig. | Plugin verteilt Notizen zeilenweise auf N Spalten-Container (`notes[i % ncols]`); in RN: N vertikale Views in einer horizontalen Row innerhalb einer ScrollView, oder FlatList mit `numColumns` ersetzen. Auswahlmodus, Pinch und Leerzustand müssen erhalten bleiben. |
| 2 | Schrift in den Kacheln ist deutlich größer als im Notiz-Viewer (Titel ca. 1,5× so groß wie der Fließtext der geöffneten Notiz). | Kacheltext auf dem Niveau der angezeigten Notiz: Titel = Viewer-Schriftgröße, Vorschautext etwas kleiner. | Kachel nutzt `theme.fontSize` (16) × `notes.tileFontScale`. Der Viewer nutzt die Einstellung `style.viewer.fontSize`. Kachel soll sich an `style.viewer.fontSize` orientieren; Skala 100 % = Viewer-Größe. Möglich, dass die Pinch-Geste beim Scrollen unbeabsichtigt `tileFontScale` hochgesetzt hat – prüfen. |
