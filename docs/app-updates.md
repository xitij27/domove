# App updates

The Android app updates itself from GitHub releases. You don't need to download APKs by hand.

## For people using the app

1. Open **Settings** (the gear at the bottom of the round buttons on the right of the map).
2. Under **App updates**, tap **Check for updates**.
3. If a newer release exists, tap **Download and install**. The app downloads the APK itself and shows its progress.
4. Android then asks you to confirm the update. The first time, it also asks you to allow Do.Move to install apps: turn that on and go back.

Your data stays, because the update installs over the current app.

The app only checks when you tap the button. It doesn't check at launch or in the background. Settings is also where you switch between English and German.

**One manual install is still needed.** Releases up to v0.1.37 have no Settings screen, and they all carry version 1.0.0 with version code 1. Install the first release with Settings by hand once. From then on, updates go through the app.

## How it works

- **Version.** On every push to `main`, [android-apk.yml](../.github/workflows/android-apk.yml) picks the next tag (v0.1.37 → v0.1.38) before building. It passes the tag to the build as `DOMOVE_VERSION`. [app.config.ts](../mobile/app.config.ts) turns that into the app's version name (`0.1.38`) and a version code that grows with each release (`1038`). Android refuses to install a lower version code over a higher one. Local and manual builds keep app.json's `0.0.0`, which Settings shows as a development build. A development build treats any release as newer.
- **Check.** The app asks `https://api.github.com/repos/xitij27/domove/releases/latest` and takes the `.apk` asset. It offers the release only if its tag is newer than the installed version. GitHub allows 60 unauthenticated checks per hour per IP address. Above that, the app shows GitHub's 403 error.
- **Install.** The APK is downloaded into the app's cache (`updates/`), replacing any earlier download. Android's installer opens on it through the app's file provider. This needs the `REQUEST_INSTALL_PACKAGES` permission, which app.json declares. If you back out of the installer, **Install** opens it again without downloading again.
- **Signing.** An update only installs over the app if both APKs are signed with the same key. Every release is signed with the standard debug key from `expo prebuild`, so that holds. If signing ever changes to a real release key, everyone has to uninstall and reinstall once.
- **iOS.** iOS has no Updates section, because only Android can install a downloaded app.

Code: [release.ts](../mobile/src/updates/release.ts) (reading the release and comparing versions), [updater.ts](../mobile/src/updates/updater.ts) (download, installer, and the check's states), [Settings.tsx](../mobile/src/settings/Settings.tsx) (the screen).
