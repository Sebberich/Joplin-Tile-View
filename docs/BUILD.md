# Build

> ⚠️ **Disclaimer: This project is "vibe-coded".** The code is written mostly by an AI
> assistant (Claude Code) from prompts; not every line has been reviewed by hand. It is a
> private hobby project in the test phase – no warranty, no liability, no commitment to
> maintenance, security, or data integrity. Back up your data before using this with real
> notes (JEX export in Joplin).

## Project Layout

```
Joplin-Tile-View/
├── joplin/            Git submodule laurent22/joplin, dev branch, pinned to a commit
├── patches/           Own changes to Joplin as a patch series (empty = unmodified Joplin)
├── scripts/
│   ├── setup.sh           Fetch submodule, enable Yarn, apply patches, yarn install
│   ├── apply-patches.sh   Apply patches/*.patch onto the tile-view branch in the submodule
│   ├── export-patches.sh  Export the tile-view branch in the submodule to patches/
│   └── build-android.sh   Build the APK (release = installable, debug = requires Metro)
├── docs/              Handover, analysis, this file
└── .github/workflows/android-apk.yml   Builds the APK on GitHub runners
```

The Joplin source is not copied but referenced as a submodule. The actual work happens in the
submodule on the `tile-view` branch and is exported as patches. On the next Joplin release, the
submodule commit is advanced and the patches are reapplied (`git am --3way`). Conflicts then
show up exactly where Joplin changed the affected files.

## Requirements (local)

| Tool | Version | Note |
|---|---|---|
| Node.js | >= 22.12, Joplin CI: 24 | `joplin/package.json` → `engines` |
| Yarn | as in `joplin/package.json` → `packageManager` | comes via Corepack, nothing to install manually |
| JDK | Temurin 20 | same as Joplin's CI |
| Android SDK | compileSdk 36, Build Tools 36.0.0, NDK 27.1.12297006 | `joplin/packages/app-mobile/android/build.gradle`; Gradle downloads the NDK itself if needed |
| Disk space | > 30 GB free | node_modules ~ 5 GB, Gradle/NDK transforms 20 GB+ |

Also `rsync` (Joplin's Gulp build uses it to copy sources; if it's missing, `yarn install` fails
in the postinstall step of `packages/app-cli` – use WSL on Windows for this reason) and
optionally `libsecret-1-dev` (Linux) for desktop packages in the monorepo.

**With Android Studio:** install the SDK, Build Tools 36.0.0, and NDK 27.1.12297006 via the SDK
Manager (otherwise the NDK downloads Gradle itself on the first build). Point `ANDROID_HOME` at
the SDK directory (Windows: `%LOCALAPPDATA%\Android\Sdk`, Linux: `~/Android/Sdk`). The JDK
bundled with Android Studio (currently 21) works with Joplin's Gradle setup – point `JAVA_HOME`
at it, or install Temurin 20 separately. Opening the project in Android Studio is not required,
`scripts/build-android.sh` is enough; anyone who wants to can open
`joplin/packages/app-mobile/android` for debugging with the emulator and Metro.

## Steps

```bash
git clone --recurse-submodules --shallow-submodules https://github.com/sebberich/joplin-tile-view.git
cd joplin-tile-view
scripts/setup.sh              # submodule, Yarn, patches, yarn install
scripts/build-android.sh      # -> joplin/packages/app-mobile/android/app/build/outputs/apk/release/app-release.apk
```

On build failures, read only the last ~30 lines: `scripts/build-android.sh 2>&1 | tail -n 30`.

## Release instead of Debug – why?

The handover document mentions `./gradlew assembleDebug`. With React Native, that produces an
APK **without a JS bundle**: the JavaScript is loaded at runtime from the Metro server on the
development machine. On a phone without Metro, the app won't start. Joplin's own CI therefore
builds `assembleRelease` and swaps the signature for the debug keystore.
`scripts/build-android.sh` does the same via Gradle properties, without modifying the
`app/build.gradle` file in the submodule.

## Building in GitHub Actions

`.github/workflows/android-apk.yml` builds the APK on every push and attaches it as the
artifact `joplin-tile-view-apk` to the run. That means step 1 of the handover ("the unmodified
Joplin build must pass first") can be verified even without a local Android toolchain. The run
usually takes 40–80 minutes, most of which is the NDK compilation of
`react-native-quick-crypto`.

## Installing on the Phone – Pitfalls

- **Same package ID as the Store Joplin** (`net.cozic.joplin`), but a different signature.
  Android won't install the fork APK over the Store Joplin. Either uninstall the Store Joplin
  (sync or export a JEX first!) or change the `applicationId` in a patch so both can run side
  by side.
- **Keep the signature constant.** All builds signed with the debug keystore can be installed
  over each other. Switching to your own keystore later means a fresh install again. For
  long-term use, it's better to create your own keystore early and feed it in via the
  `JOPLIN_RELEASE_*` variables / GitHub secrets.
- The app version is that of the pinned upstream commit; Joplin sync with other devices works
  as usual.

## Updates with Obtainium

Every push (except pure documentation changes) creates a GitHub release
`v<Joplin-version>-tiles.<build number>` with the APK as an asset, alongside the workflow
artifact. The build number (`github.run_number`) flows through `-PTILE_VIEW_BUILD_NUMBER` into
`versionCode` (`2097819 + N`) and `versionName` (`3.7.10-tiles.N`), so Android accepts every new
build as an update and Obtainium recognizes the version.

Setup in Obtainium:

1. "Add App", source: `https://github.com/Sebberich/Joplin-Tile-View`.
2. Obtainium detects GitHub releases automatically; pre-releases don't need to be enabled.
3. Do the first install through Obtainium. As long as the keystore secrets are missing, the
   releases are signed with the debug keystore just like the workflow artifacts; Obtainium can
   then update directly from a manually installed artifact APK. App data (sync configuration,
   notes) is preserved as long as the signature stays the same. Switching to your own keystore
   later requires a one-time fresh install.

Note: when the Joplin version is advanced (next section), the base for `versionCode`
increases while the build number keeps growing; the version therefore stays monotonic.

## Own Keystore (Signing)

The workflow signs with your own keystore from the repo secrets. If the secrets are missing, it
builds with the debug keystore; the release is still created (test phase), and the release
notes state which signature was used.

Generate once locally (`keytool` ships with Android Studio under `jbr/bin`):

```
keytool -genkeypair -v -keystore joplin-tiles.keystore -alias joplintiles \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 joplin-tiles.keystore > joplin-tiles.keystore.b64
```

Repo secrets (Settings → Secrets and variables → Actions):

| Secret | Content |
|---|---|
| `TILES_KEYSTORE_BASE64` | Content of `joplin-tiles.keystore.b64` |
| `TILES_KEYSTORE_PASSWORD` | Keystore password |
| `TILES_KEY_ALIAS` | `joplintiles` (or whichever alias you chose) |
| `TILES_KEY_PASSWORD` | Key password (with `keytool` from JDK 9 on, same as the keystore password) |

Keep the keystore and passwords safe: if the keystore is lost, all future builds require a
fresh install again. When switching from the debug keystore to your own, uninstall the app once
and reinstall from the first release.

## Advancing the Joplin Version

```bash
cd joplin
git fetch --depth 1 origin dev          # or: git fetch --depth 1 origin tag android-v3.x.y
git checkout FETCH_HEAD
cd ..
scripts/apply-patches.sh                # resolve conflicts, then: git am --continue
scripts/export-patches.sh               # rewrite the patches
git add joplin patches && git commit -m "Advance Joplin to <commit/tag>"
```
