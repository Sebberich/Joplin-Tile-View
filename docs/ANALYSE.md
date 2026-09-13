# Analyse: Einstiegspunkte in Joplin Mobile

Stand: Joplin `dev` @ 468c40d09bbc41774105411f7d9cb0065aa1da64 (13.09.2026).
Pfade relativ zu `joplin/`.

## Notizliste (Schritt 2 der Übergabe)

| Datei | Rolle |
|---|---|
| `packages/app-mobile/components/screens/Notes/Notes.tsx` | Notizen-Screen (Startansicht). Rendert in Zeile ~326 `<NoteList />`. Hier wird später zwischen Liste und Kacheln umgeschaltet. |
| `packages/app-mobile/components/NoteList.tsx` | Klassenkomponente mit `FlatList`, Redux-connected. Props: `items` (NoteEntity[]), `folders`, `noteSelectionEnabled`, `selectedFolderId`, `notesSource`. Leere-Ordner-Meldung über `getEmptyFolderMessage`. |
| `packages/app-mobile/components/NoteItem.tsx` | Einzelne Listenzeile: Checkbox im Auswahlmodus, Titel, Suchwort-Hervorhebung, Note-Lock, Long-Press über `useOnLongPressProps`, Tippen → `NAV_GO` zur Notiz. Gute Vorlage für die Kachel (gleiche Props, gleiches Dispatch). |
| `packages/app-mobile/components/screens/Notes/TextWrapCalculator.tsx` | Hilfskomponente zur Textbreite, evtl. für Vorschau-Kürzung nützlich. |
| `packages/app-mobile/components/global-style.ts` | `themeStyle(themeId)` – Farben/Abstände, Pflicht für Theme-Konformität. |

Sortierung und Notizbuchfilter laufen bereits über Redux (`notesSource`, `notes.sortOrder.*`),
die Kachelansicht bekommt also dieselben `items` wie die Liste und muss nichts neu filtern.

## Einstellungen (Schritt 4)

`packages/lib/models/settings/builtInMetadata.ts`:

- `notes.listRendererId` (Zeile ~1387) existiert nur für Desktop (`appTypes: [AppType.Desktop]`)
  und wählt dort den Note-List-Renderer. Für Mobile braucht es einen neuen Schlüssel, z. B.
  `notes.mobileLayout` mit `'list' | 'tiles'`, `appTypes: [AppType.Mobile]`, `section: 'appearance'`,
  `isGlobal: true`. Standard = `'tiles'` laut Übergabe.
- Spaltenzahl für Pinch-Zoom später als zweiter Schlüssel (`notes.tileColumns`, 1–5).

## Ressourcen / Bilder (Schritt 3)

- `@joplin/lib/models/Resource` → `Resource.fullPath(resource)` liefert den lokalen Pfad.
- Ressourcen einer Notiz: `Note.linkedResourceIds(body)` bzw. `Note.linkedItems`.
- Bild nur anzeigen, wenn die Ressource lokal vorhanden ist (`Resource.isReady`), sonst
  Platzhalter; Ressourcen werden beim Sync nachgeladen.

## Was Joplin für Upstream-PRs erwartet

- Tests: `packages/app-mobile` nutzt Jest, Beispiele `NewNoteButton.test.tsx`,
  `NoteRevisionViewer.test.tsx`. Eine Kachelkomponente braucht mindestens einen Render-Test.
- Lint/Typen: `yarn linter` (eslint --fix) und `yarn tsc` im Repo-Root, Regeln in `eslint.config.js`. Mobile-Tests: `cd packages/app-mobile && yarn test`.
- Barrierefreiheit: `accessibilityRole`, `accessibilityLabel`, `accessibilityState` wie in `NoteItem.tsx`.
- Übersetzungen über `_()` aus `@joplin/lib/locale`; neue Strings landen in `packages/tools/locales`.
