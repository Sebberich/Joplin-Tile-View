# Übergabe: Joplin Kachelansicht (Tile View)

## Ziel
Joplin Mobile (Android) soll Notizen als Kacheln im Google-Keep-Stil anzeigen – idealerweise als
**Standard-/Startansicht statt der Titel-Liste**. Joplin ist Open Source (AGPL), Mobile-App in React Native,
Monorepo: https://github.com/laurent22/joplin (Branch `dev`).

## Stand
- Migration nach Joplin ist erledigt (Notally → JEX, Google Keep → JEX). Nicht mehr relevant.
- **Plugin „Tile View“ existiert und läuft** auf Android (Version 1.0.0, Projektordner `joplin-plugin-tile-view/`). Es ist ein Plugin-Panel, kein eigener Screen. Features:
  Kacheln mit Titel/Vorschau/erstem Bild, Tippen öffnet Notiz, Suche, Multi-Select-Notizbuchfilter
  (Eltern wählt Kinder mit, einzeln abwählbar), Sortierung, Pinch-Zoom (Spaltenzahl 1–5, dann Schrift),
  Einstellungen werden gespeichert. Reines JS ohne Build-Toolchain, `npm run dist` packt die `.jpl`.
  Zum Veröffentlichen fehlt nur: `YOUR_GITHUB_USER` ersetzen, Screenshot, `npm publish`.
- **Grenze des Plugins:** Joplin Mobile erlaubt Plugins nicht, die Notizliste zu ersetzen oder beim
  Start automatisch aufzugehen (Note-List-Renderer-API gibt es nur am Desktop). Deshalb jetzt der Fork.

## Nächster Schritt: Fork mit eingebauter Kachelansicht
Reihenfolge, nicht abkürzen:
1. **Unveränderter Joplin-Build muss erst durchlaufen.** `yarn install` im Repo-Root, dann
   `cd packages/app-mobile/android && ./gradlew assembleDebug`. APK unter `app/build/outputs/apk/debug/`.
   Joplins CI nutzt Node 24, Temurin JDK 20, `corepack enable` für Yarn, `SKIP_ONENOTE_CONVERTER_BUILD=1`.
2. Einstiegspunkt finden: der Notizlisten-Screen in `packages/app-mobile/components/screens/` (Notes-Screen
   und NoteList-Komponente). Genaue Dateinamen im Repo prüfen, nicht raten.
3. Kachelansicht als React-Native-Komponente (FlatList mit `numColumns` oder zwei Spalten-Views für
   Masonry-Effekt) mit den Features des Plugins nachbauen. Bild-Thumbnails über `Resource.fullPath()`
   bzw. das bestehende Resource-Handling der App laden.
4. Umschalter in den Einstellungen (`packages/lib/models/settings/builtInMetadata.ts` o. ä.):
   Listenansicht vs. Kachelansicht, Standard = Kachel. Sortierung/Notizbuchfilter der App wiederverwenden.
5. Erst dann Feinschliff (Pinch-Zoom, Spaltenzahl).

## Erwartungen / Risiken
- Fork muss bei jedem Joplin-Release nachgezogen und neu gebaut werden.
- Alternative: Feature sauber genug bauen, um einen PR upstream zu stellen (offener Feature-Request im
  Joplin-Forum existiert). Maintainer erwarten Tests, Theme-Konformität, Barrierefreiheit.
- Plugin bleibt als Fallback installiert und funktioniert unabhängig vom Fork.

## Arbeitsweise (vom Nutzer gewünscht)
- Kritisches Feedback immer, nicht nur auf Nachfrage.
- Erst zeigen, dass die Basis läuft, dann ändern. Bei Build-Fehlern: nur die letzten ~30 Zeilen.
