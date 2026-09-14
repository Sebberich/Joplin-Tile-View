# Build

## Aufbau des Projekts

```
Joplin-Tile-View/
├── joplin/            Git-Submodule laurent22/joplin, Branch dev, auf einen Commit gepinnt
├── patches/           Eigene Änderungen an Joplin als Patch-Serie (leer = unverändertes Joplin)
├── scripts/
│   ├── setup.sh           Submodule holen, Yarn aktivieren, Patches anwenden, yarn install
│   ├── apply-patches.sh   patches/*.patch auf Branch tile-view im Submodule anwenden
│   ├── export-patches.sh  Branch tile-view im Submodule nach patches/ exportieren
│   └── build-android.sh   APK bauen (release = installierbar, debug = nur mit Metro)
├── docs/              Übergabe, Analyse, diese Datei
└── .github/workflows/android-apk.yml   Baut das APK auf GitHub-Runnern
```

Der Joplin-Quellcode wird nicht kopiert, sondern als Submodule referenziert. Die eigene Arbeit
findet im Submodule auf dem Branch `tile-view` statt und wird als Patches exportiert. Beim
nächsten Joplin-Release wird der Submodule-Commit weitergesetzt und die Patches werden neu
angewendet (`git am --3way`). Konflikte tauchen dann genau dort auf, wo Joplin die berührten
Dateien geändert hat.

## Voraussetzungen (lokal)

| Werkzeug | Version | Hinweis |
|---|---|---|
| Node.js | >= 22.12, Joplin-CI: 24 | `joplin/package.json` → `engines` |
| Yarn | wie in `joplin/package.json` → `packageManager` | kommt über Corepack, nichts manuell installieren |
| JDK | Temurin 20 | wie Joplins CI |
| Android SDK | compileSdk 36, Build-Tools 36.0.0, NDK 27.1.12297006 | `joplin/packages/app-mobile/android/build.gradle`; NDK lädt Gradle bei Bedarf selbst |
| Plattenplatz | > 30 GB frei | node_modules ~ 5 GB, Gradle/NDK-Transforms 20 GB+ |

Außerdem `rsync` (Joplins Gulp-Build kopiert damit Quellen, fehlt es, bricht `yarn install` im
Postinstall von `packages/app-cli` ab; unter Windows daher WSL benutzen) und optional
`libsecret-1-dev` (Linux) für Desktop-Pakete im Monorepo.

**Mit Android Studio:** SDK, Build-Tools 36.0.0 und NDK 27.1.12297006 über den SDK Manager
installieren (NDK lädt Gradle sonst beim ersten Build selbst nach). `ANDROID_HOME` auf das
SDK-Verzeichnis setzen (Windows: `%LOCALAPPDATA%\Android\Sdk`, Linux: `~/Android/Sdk`). Das
in Android Studio gebündelte JDK (aktuell 21) funktioniert mit Joplins Gradle-Setup, `JAVA_HOME`
darauf zeigen lassen oder Temurin 20 separat installieren. Das Projekt in Android Studio öffnen
ist nicht nötig, `scripts/build-android.sh` reicht; wer will, öffnet
`joplin/packages/app-mobile/android` für Debugging mit Emulator und Metro.

## Schritte

```bash
git clone --recurse-submodules --shallow-submodules https://github.com/sebberich/joplin-tile-view.git
cd joplin-tile-view
scripts/setup.sh              # Submodule, Yarn, Patches, yarn install
scripts/build-android.sh      # -> joplin/packages/app-mobile/android/app/build/outputs/apk/release/app-release.apk
```

Bei Build-Fehlern nur die letzten ~30 Zeilen lesen: `scripts/build-android.sh 2>&1 | tail -n 30`.

## Release statt Debug – warum?

Die Übergabe nennt `./gradlew assembleDebug`. Das erzeugt bei React Native ein APK **ohne
JS-Bundle**: Das JavaScript wird zur Laufzeit vom Metro-Server auf dem Entwicklungsrechner
geladen. Auf dem Handy ohne Metro startet die App nicht. Joplins eigene CI baut deshalb
`assembleRelease` und tauscht die Signatur auf den Debug-Keystore. `scripts/build-android.sh`
macht dasselbe über Gradle-Properties, ohne die Datei `app/build.gradle` im Submodule zu
verändern.

## Build in GitHub Actions

`.github/workflows/android-apk.yml` baut bei jedem Push das APK und hängt es als Artefakt
`joplin-tile-view-apk` an den Lauf. Damit ist Schritt 1 der Übergabe („unveränderter
Joplin-Build muss erst durchlaufen“) auch ohne lokale Android-Toolchain prüfbar. Der Lauf
dauert erfahrungsgemäß 40–80 Minuten, der Großteil ist die NDK-Kompilierung von
`react-native-quick-crypto`.

## Installation auf dem Handy – Stolperfallen

- **Gleiche Paket-ID wie das Store-Joplin** (`net.cozic.joplin`), aber andere Signatur. Android
  installiert das Fork-APK nicht über das Store-Joplin. Entweder Store-Joplin deinstallieren
  (vorher synchronisieren oder JEX exportieren!) oder in einem Patch die `applicationId`
  ändern, damit beide nebeneinander laufen.
- **Signatur konstant halten.** Alle Builds mit dem Debug-Keystore lassen sich übereinander
  installieren. Wechselt man später auf einen eigenen Keystore, ist das wieder eine
  Neuinstallation. Für Daueranwendung besser früh einen eigenen Keystore anlegen und über die
  `JOPLIN_RELEASE_*`-Variablen bzw. GitHub-Secrets einspeisen.
- Die App-Version ist die des gepinnten Upstream-Commits; Joplin-Sync mit anderen Geräten
  funktioniert ganz normal.

## Updates mit Obtainium

Jeder Push (außer reinen Doku-Änderungen) erzeugt neben dem Workflow-Artefakt ein
GitHub-Release `v<Joplin-Version>-tiles.<Build-Nr>` mit der APK als Asset. Die Build-Nummer
(`github.run_number`) fließt über `-PTILE_VIEW_BUILD_NUMBER` in `versionCode`
(`2097819 + N`) und `versionName` (`3.7.10-tiles.N`), damit Android jeden neuen Build als
Update akzeptiert und Obtainium die Version erkennt.

Einrichtung in Obtainium:

1. „App hinzufügen“, Quelle: `https://github.com/Sebberich/Joplin-Tile-View`.
2. Obtainium erkennt GitHub-Releases automatisch; Vorabversionen müssen nicht aktiviert werden.
3. Erste Installation über Obtainium durchführen. Zuvor manuell installierte APKs aus
   Workflow-Artefakten sind mit dem Debug-Keystore signiert und müssen vorher deinstalliert
   werden. Ab dem ersten Release bleibt die Signatur (eigener Keystore) konstant, App-Daten
   (Sync-Konfiguration, Notizen) bleiben bei Updates erhalten.

Hinweis: Beim Nachziehen der Joplin-Version (nächster Abschnitt) steigt die Basis von
`versionCode`, die Build-Nummer wächst weiter; die Version bleibt damit monoton.

## Eigener Keystore (Signatur)

Der Workflow signiert mit einem eigenen Keystore aus den Repo-Secrets. Fehlen die Secrets,
baut er mit dem Debug-Keystore und legt **kein** Release an (nur das Artefakt).

Einmalig lokal erzeugen (`keytool` liegt bei Android Studio unter `jbr/bin`):

```
keytool -genkeypair -v -keystore joplin-tiles.keystore -alias joplintiles \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 joplin-tiles.keystore > joplin-tiles.keystore.b64
```

Repo-Secrets (Settings → Secrets and variables → Actions):

| Secret | Inhalt |
|---|---|
| `TILES_KEYSTORE_BASE64` | Inhalt von `joplin-tiles.keystore.b64` |
| `TILES_KEYSTORE_PASSWORD` | Keystore-Passwort |
| `TILES_KEY_ALIAS` | `joplintiles` (bzw. der gewählte Alias) |
| `TILES_KEY_PASSWORD` | Key-Passwort (bei `keytool` ab JDK 9 gleich dem Keystore-Passwort) |

Keystore und Passwörter sicher aufbewahren: geht der Keystore verloren, sind alle künftigen
Builds wieder Neuinstallationen. Beim Wechsel vom Debug- auf den eigenen Keystore die App
einmal deinstallieren und aus dem ersten Release neu installieren.

## Joplin-Version nachziehen

```bash
cd joplin
git fetch --depth 1 origin dev          # oder: git fetch --depth 1 origin tag android-v3.x.y
git checkout FETCH_HEAD
cd ..
scripts/apply-patches.sh                # Konflikte lösen, dann: git am --continue
scripts/export-patches.sh               # Patches neu schreiben
git add joplin patches && git commit -m "Joplin auf <Commit/Tag> nachgezogen"
```
