# Gerätetest: gesammelte Issues

Stand: Issues 1–2 in Patches 0007–0008 (CI-Lauf #5), Issues 3–5 in Patches 0009–0011.

| Nr. | Beobachtung | Erwartung | Hinweis für die Umsetzung |
|---|---|---|---|
| 1 | Kacheln sitzen in einem festen Raster, alle Kacheln einer Zeile gleich hoch. | Masonry wie im Plugin: Kacheln haben ihre natürliche Höhe (Bild, Textlänge), Spalten füllen sich unabhängig. | Plugin verteilt Notizen zeilenweise auf N Spalten-Container (`notes[i % ncols]`); in RN: N vertikale Views in einer horizontalen Row innerhalb einer ScrollView, oder FlatList mit `numColumns` ersetzen. Auswahlmodus, Pinch und Leerzustand müssen erhalten bleiben. |
| 2 | Schrift in den Kacheln ist deutlich größer als im Notiz-Viewer (Titel ca. 1,5× so groß wie der Fließtext der geöffneten Notiz). | Kacheltext auf dem Niveau der angezeigten Notiz: Titel = Viewer-Schriftgröße, Vorschautext etwas kleiner. | Kachel nutzt `theme.fontSize` (16) × `notes.tileFontScale`. Der Viewer nutzt die Einstellung `style.viewer.fontSize`. Kachel soll sich an `style.viewer.fontSize` orientieren; Skala 100 % = Viewer-Größe. Möglich, dass die Pinch-Geste beim Scrollen unbeabsichtigt `tileFontScale` hochgesetzt hat – prüfen. |
| 3 | Textgröße bleibt über die Zoomstufen nicht konsistent. | Gleiche Zoomstufe = gleiche Darstellung, egal auf welchem Weg man dort hinkommt. | Ursache: `zoomIn`/`zoomOut` ändern erst Spalten, dann `tileFontScale`, aber ohne Rückweg: von 1 Spalte/160 % zurück auf 5 Spalten bleibt die Schrift bei 160 %. Fix: feste Zoom-Leiter (Spalten, Schriftskala) und Pinch bewegt sich auf dieser Leiter. |
| 4 | OLED-Dark-Theme: Kacheln sind grau statt schwarz. | Kachelhintergrund = Theme-Hintergrund (bei OLED #000000), Abgrenzung nur über Rahmen. | Kachel nutzt `theme.backgroundColor2`, das OLED von Dark erbt (#181A1D). Auf `theme.backgroundColor` + `theme.dividerColor` als Rahmen umstellen. |
| 5 | Vorschautext ignoriert die Formatierung der Notiz (Zeilenumbrüche, Listen). | Vorschau spiegelt die Struktur wider: Absätze, Zeilenumbrüche, Listenpunkte, Checkboxen. | `stripMarkdown` in NoteTile.tsx ersetzt alle Zeilenumbrüche durch Leerzeichen. Zeilenumbrüche erhalten, Listen als „• “, Checkboxen als ☐/☑, restliches Markup weiter entfernen. |

## Ideen (Machbarkeit bewertet, nicht umgesetzt)

### Themes und Layouts installierbar machen

**Themes: machbar, mittlerer Aufwand.** Ein Joplin-Theme ist eine flache Farbtabelle (`packages/lib/themes/*.ts`, 20–70 Zeilen), registriert in `packages/lib/theme.ts` unter einer festen ID und im Setting `theme` als Enum. Ein installierbares Theme wäre eine JSON-Datei mit denselben Schlüsseln, per Dateiauswahl importiert, im Profilordner abgelegt und beim Start zusätzlich registriert. Offene Punkte: Theme-IDs sind Zahlen (Setting-Enum), für importierte Themes bräuchte es dynamische IDs; `themeStyle()` cached pro ID; unvollständige JSONs müssen auf ein Basistheme zurückfallen. Ein separater Kanal (Custom-CSS für gerenderte Notizen) existiert in Joplin bereits, betrifft aber nur den Viewer, nicht die App-Oberfläche.

**Layouts als Presets: machbar, geringer Aufwand.** Alle Kachel-Parameter sind Settings (Spalten, Schriftskala, künftig Abstände, angezeigte Felder). Ein „Layout“ ist dann ein Settings-Bündel als JSON, importierbar wie ein Theme.

**Layouts als Code (beliebige Renderer wie Desktop-Plugins): nicht empfehlenswert.** Die Desktop-API `joplin.views.noteList.registerRenderer` rendert HTML-Templates in Electron; Mobile hat diese API nicht, und pro Kachel ein WebView wäre auf Android zu langsam. Alternative wäre eine eigene Template-Sprache (JSON-Schema → RN-Komponenten), das ist ein eigenes Teilprojekt und erhöht die Abweichung von Upstream deutlich.

**Kosten unabhängig von der Variante:** Jede Erweiterung wächst als Patch auf Upstream mit. Themes/Presets als Daten (JSON) halten die Patches klein; ein Renderer-System nicht. „Installieren“ per Dateiauswahl ist trivial, ein Katalog (Index-JSON auf GitHub, Download in der App) ist eine kleine Zusatzschicht mit Pflegeaufwand.

**Empfehlung:** Zuerst Presets (Layout-Settings-Bündel) und JSON-Themes per Dateiimport, kein eigenes Renderer-System.
