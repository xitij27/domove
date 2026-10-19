# Do.Move v0.1 launch crash

Incident report · Do.Move (Android) · 16 Oct 2026

The Android APK released as v0.1.0 closes immediately on every launch, and v0.1.1 has the same defect. The cause is in the build, not the phones and not the API keys: R8 removes a constructor that WorkManager's database needs, and the app dies while Android is still starting the process. Commit `7cb0a30` fixes it, and the fixed APK runs on both test phones.

| | |
|---|---|
| **Affected** | Release APKs v0.1.0 and v0.1.1, on any phone |
| **Fix** | `7cb0a30` on `mobile-app-backend`, 16 Oct 16:09 |
| **Verified on** | HONOR X6c (Android 15) and Samsung Galaxy Note10 Lite (Android 13) |
| **Released** | Not yet. The fixed APK exists only as a GitHub Actions artifact. |

## At a glance

| # | Issue | Status |
|---|---|---|
| 1 | [Release APKs crash at launch](#1-release-apks-crash-at-launch) | Fixed |
| 2 | [The v0.1.1 crash screen cannot record this crash](#2-the-v011-crash-screen-cannot-record-this-crash) | Open |
| 3 | [Release builds don't fit on the 8 GB laptop](#3-release-builds-dont-fit-on-the-8-gb-laptop) | Worked around with CI |
| 4 | [Smaller problems found along the way](#4-smaller-problems-found-along-the-way) | Open |
| 5 | [Debugging setup and gotchas](#5-debugging-setup-and-gotchas) | Reference |

## 1. Release APKs crash at launch

**Status: fixed in `7cb0a30`.**

### What testers see

The app opens and closes straight away, on every launch. On the HONOR X6c running v0.1.0, `adb logcat` caught this:

```text
E AndroidRuntime: FATAL EXCEPTION: main
E AndroidRuntime: Process: com.domove.radar, PID: 30377
E AndroidRuntime: java.lang.RuntimeException: Unable to get provider androidx.startup.InitializationProvider: hh: java.lang.RuntimeException: Failed to create an instance of class androidx.work.impl.WorkDatabase.canonicalName
E AndroidRuntime:     at android.app.ActivityThread.installProvider(ActivityThread.java:9930)
E AndroidRuntime:     at android.app.ActivityThread.installContentProviders(ActivityThread.java:9429)
E AndroidRuntime:     at android.app.ActivityThread.handleBindApplication(ActivityThread.java:9013)
                      …
E AndroidRuntime: Caused by: hh: java.lang.RuntimeException: Failed to create an instance of class androidx.work.impl.WorkDatabase.canonicalName
E AndroidRuntime:     at z30.y(r8-map-id-7578fc4e…:104)
E AndroidRuntime:     at z30.x(r8-map-id-7578fc4e…:86)
E AndroidRuntime:     at androidx.startup.InitializationProvider.onCreate(r8-map-id-7578fc4e…:57)
                      …
E AndroidRuntime: Caused by: java.lang.RuntimeException: Failed to create an instance of class androidx.work.impl.WorkDatabase.canonicalName
E AndroidRuntime:     at co1.m(r8-map-id-7578fc4e…:1088)
E AndroidRuntime:     at androidx.work.WorkManagerInitializer.create(r8-map-id-7578fc4e…:90)
```

HONOR X6c, v0.1.0, 16 Oct 15:14. Timestamps and some frames removed, r8-map-id hashes shortened. `hh`, `z30` and `co1` are class names obfuscated by R8.

### Why it happens

1. **react-native-maps brings in WorkManager.** react-native-maps 1.29.11 declares `implementation "androidx.work:work-runtime:2.9.1"` in its `android/build.gradle`.
2. **WorkManager 2.9.1 brings Room 2.5.0.** Its Maven POM depends on `androidx.room:room-ktx:2.5.0`, and the APK ships `room-runtime` 2.5.0.
3. **WorkManager starts before any app code.** It initializes through androidx.startup's `InitializationProvider`, which is a content provider. Android creates content providers while it starts the process, before `Application.onCreate()`.
4. **Room creates WorkManager's database by reflection.** It looks up the generated class `androidx.work.impl.WorkDatabase_Impl` by name and calls its no-argument constructor. No code calls that constructor directly, so the shrinker keeps it only if a keep rule says so.
5. **Room 2.5.0's keep rule doesn't cover the constructor.** Room 2.5.0 ships `-keep class * extends androidx.room.RoomDatabase` with no member list. Release builds run R8: the generated `gradle.properties` sets `android.enableMinifyInReleaseBuilds=true`, and R8 full mode has been the default since AGP 8.0 (this project uses AGP 9.2.1 with no override). In full mode, "the default constructor (`<init>()`) is not implicitly kept when a class is kept." So R8 kept `WorkDatabase_Impl` and removed its constructor.
6. **Instantiation fails and kills the process.** Room reports "Failed to create an instance of class androidx.work.impl.WorkDatabase.canonicalName". The `.canonicalName` ending is literal text in Room 2.5.0's message, not part of a class name. The exception escapes the content provider, so Android stops the process before React Native or any of the app's JavaScript runs.

**Who is affected:** every R8-minified release APK built from this project before `7cb0a30`, on any phone, because the constructor is missing from the APK itself. The debug build type isn't minified, so `npx expo run:android` and development builds don't hit this.

**Not the cause:** the API keys, because the crash happens before any JavaScript runs, and the phone model.

### Evidence in the APKs

Both APKs were checked by reading `classes.dex` directly.

| APK | Constructor of `WorkDatabase_Impl` |
|---|---|
| `construction-site-radar-v0.1.1-arm64.apk` (release asset) | Missing. The class has no direct methods at all. |
| Fixed build, CI run 38913536813 | Present: `public <init>()V` |

The v0.1.0 APK file wasn't inspected. Its crash log above shows the same failure.

### Which Room versions keep the constructor

| Room | Keep rule shipped in the library | Keeps constructor |
|---|---|---|
| 2.5.0 (ours) | `-keep class * extends androidx.room.RoomDatabase` | No |
| 2.6.0, 2.6.1 | Same as 2.5.0 | No |
| 2.7.0 | `-keep class * extends androidx.room.RoomDatabase { void <init>(); }` | Yes |
| 2.8.5 | Same as 2.7.0 | Yes |

From 2.7.0 the Android library is published as `room-runtime-android`. 2.7.0 is the first stable release with the constructor rule.

### The fix

Commit `7cb0a30` adds `expo-build-properties` 58.0.10 and this entry to the plugins in `mobile/app.config.ts`:

```ts
['expo-build-properties', {
  android: {
    extraProguardRules: '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
  },
}],
```

`npx expo prebuild` appends the rule to `android/app/proguard-rules.pro`. It matches the rule Room itself ships from 2.7.0, so it becomes redundant once the app resolves Room 2.7.0 or later. Room 2.6.1 isn't enough.

### Verification

- GitHub Actions run [38913536813](https://github.com/xitij27/domove/actions/runs/38913536813), attempt 2: success. The build step took 10 min 38 s (14:13:22 to 14:24:00 UTC).
- The fixed APK contains the `WorkDatabase_Impl` constructor (table above).
- Its JS bundle contains the Mapbox token, the Supabase URL and the publishable key. These were checked by prefix only; the values weren't printed.
- On each phone: install, launch, wait 15 s, then check that the process is still running and read logcat.

| Phone | Android | Before the fix | With the fix |
|---|---|---|---|
| HONOR X6c (NIC-LX2) | 15 | v0.1.0 crashed on launch (log above) | Installed over v0.1.0 without uninstalling, so the signing key matches. Runs; the map shows 158 current and 54 planned sites. No AndroidRuntime, React Native or Mapbox errors. The 17 error-level lines in the app's process come from the phone's system components: HONOR performance hooks (RtgSchedIpcFile, VipSchedProxy, FASProxy, GamesAware, iGraphics, plus two untagged "open file error" lines on the iGraphics thread) and one Android feature-flag lookup. |
| Samsung Galaxy Note10 Lite (SM-N770F) | 13 | Not tested | Runs; the map shows 158 current and 54 planned sites. No error-level lines from the app's process. |

## 2. The v0.1.1 crash screen cannot record this crash

**Status: open.**

v0.1.1 added `mobile/plugins/withCrashLog.js`. It saves uncaught Java and Kotlin exceptions to `last-crash.txt` so the app can show them on the next launch. The handler is installed in `MainApplication.onCreate()`, which runs too late for this crash. The JavaScript handler in `App.tsx` runs later still and only sees JavaScript errors.

Android process start order:

| Order | Stage | Relevance |
|---|---|---|
| 1 | `Application.attachBaseContext()`: the app object gets its context | Proposed place for the crash handler |
| 2 | Content providers are created: `InitializationProvider` → `WorkManagerInitializer` → Room | **Crash happens here** |
| 3 | `Application.onCreate()`: Expo and React Native set up | v0.1.1 installs its crash handler here. Never reached. |
| 4 | `MainActivity`, JS bundle: `App.tsx` runs | JS error handler in `App.tsx` |

> "Called when the application is starting, before any activity, service, or receiver objects (excluding content providers) have been created."
>
> Javadoc of `Application.onCreate()`, AOSP `frameworks/base`

So with this crash, v0.1.1 closes on every launch and never shows a report. The v0.1.1 release notes promise the opposite: "If it crashes, open it again: it now shows the error instead of crashing again." This follows from the startup order above; v0.1.1 itself wasn't run on a phone.

**Proposed fix:** install the handler in `attachBaseContext()`, after `super.attachBaseContext(base)`. In AOSP's `ActivityThread.handleBindApplication()`, the Application is created and attached (`makeApplicationInner`, which leads to `attachBaseContext`) before `installContentProviders`, and `callApplicationOnCreate` comes last. Not implemented or tested yet.

## 3. Release builds don't fit on the 8 GB laptop

**Status: worked around with CI.**

The first local build (`gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`) on the Windows 11 laptop (Intel Core i5-1035G4, 7.6 GB RAM) had only 0.4 GB RAM free while running. After 13 minutes (15:52 to 16:05) Gradle had run 26 tasks and was still compiling React Native's and Expo's Gradle settings plugins, so it was stopped. Two more things to know before building locally: Windows long paths are disabled on this laptop (`LongPathsEnabled = 0`), which can break native builds with deep paths, and the disk had 13.5 GB free just before the build.

### The GitHub Actions workflow

Commit `7cb0a30` adds `.github/workflows/android-apk.yml`. It builds the same kind of APK as the v0.1.x releases and finished in about 11 minutes.

| | |
|---|---|
| **Runs on** | Pushes to `main`, or by hand (`workflow_dispatch`), since `f3ec3f3`. `7cb0a30` originally ran it on any push that changed `mobile/**`. GitHub only runs `workflow_dispatch` "if the workflow file exists on the default branch", so the workflow doesn't run at all until it is merged to `main`. |
| **Steps** | Node 24, Temurin JDK 17, Gradle setup, `npm ci`, `npx expo prebuild --platform android`, `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` |
| **Output** | Artifact `domove-arm64-apk` (`construction-site-radar-arm64-apk` before the rename to Do.Move) containing `app-release.apk`: arm64 only, signed with the debug key like the v0.1.x releases |
| **Secrets** | `EXPO_PUBLIC_MAPBOX_TOKEN`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set. `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is optional and not set, so the Google ⇄ Mapbox toggle stays hidden. `SUPABASE_DB_URL` is deliberately not on GitHub. |

**Gotcha:** a run reads secrets when it starts. The first run started at 14:09:48 UTC, before the secrets were added at 14:11 UTC, so it was cancelled and re-run.

### Gradle runs out of metaspace

The fix build (CI run 38913536813) ran with the template's JVM settings and Gradle logged:

```text
The currently configured max heap space is '2 GiB' and the configured max metaspace is '512 MiB'.
Daemon will be stopped at the end of the build after running out of JVM Metaspace
```

The build still succeeded, but Gradle can't reuse a daemon that ran out of metaspace. `mobile/plugins/withGradleJvmArgs.js`, committed after this report, raises the metaspace limit to 1024 MB and keeps the heap at 2048 MB (`org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m`). It isn't part of `7cb0a30` or of the tested APK.

## 4. Smaller problems found along the way

**Status: open.**

- **Every build has the same version.** v0.1.0, v0.1.1 and the fixed APK all report `versionName 1.0.0`, `versionCode 1`. The release tags don't change that, so testers can't tell builds apart on the phone. Bump `version` and `android.versionCode` in `app.json` for each release.
- **Light mode isn't applied on Android.** `app.json` sets `"userInterfaceStyle": "light"`, but prebuild warns: "android: userInterfaceStyle: Install expo-system-ui in your project to enable this feature." The HONOR runs in system dark mode. Any visible effect wasn't checked.
- **Inconsistent env file name.** The Mapbox "missing token" screen says to set the token in `mobile/.env.local`. The README, `.env.example` and `src/sites.ts` all say `mobile/.env`.
- **npm install warnings.** `npm ci` skipped the install scripts of `@parcel/watcher` 2.6.0 and `unrs-resolver` 1.12.2 (npm's allow-scripts check), and warned that `glob` 10.5.0 and `eslint` 9.39.5 are deprecated. Typecheck, lint and tests still passed.
- **Mapbox setter warnings in release builds.** The HONOR log shows `ViewManagerPropertyUpdater: Could not find generated setter for class com.rnmapbox…` for many Mapbox components. The map and pins render normally. Not investigated.

## 5. Debugging setup and gotchas

**Status: reference.**

### Catching a launch crash with adb

A crash this early leaves no trace inside the app, so logcat is the only place to see it.

```sh
adb logcat -c
adb shell monkey -p com.domove.radar -c android.intent.category.LAUNCHER 1
adb logcat -d -v threadtime | grep -A 30 "FATAL EXCEPTION"
```

### Installed on the laptop

| Tool | Version | Where / how |
|---|---|---|
| Android platform-tools (adb) | 37.0.1 | `winget install Google.PlatformTools`, and again inside the SDK |
| Eclipse Temurin JDK | 17.0.20.1 | `winget install EclipseAdoptium.Temurin.17.JDK` |
| Android command-line tools | build 16111833 | `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest` |
| SDK packages | | `platforms/android-37.0`, `build-tools/37.0.0`, `ndk/27.1.12297006`, `cmake/3.22.1` |
| User environment | | `JAVA_HOME`, `ANDROID_HOME`, and `PATH` entries for `platform-tools` and `cmdline-tools\latest\bin` |

### Gotchas

- **`sdkmanager` no longer takes the old package names.** In this command-line tools build it's deprecated and forwards to the new `android` CLI. `sdkmanager "platforms;android-37"` failed with "Package platforms not found. Package android-37 not found." from both Git Bash and PowerShell. This worked: `android sdk install platforms/android-37.0 build-tools/37.0.0 ndk/27.1.12297006 cmake/3.22.1`.
- **Authorize the phone.** The HONOR showed as `unauthorized` until "Allow USB debugging?" was accepted on the phone.
- **USB debugging can drop out.** Later the HONOR's ADB interface disappeared while the phone stayed connected for file transfer. If `adb devices` comes back empty, check that USB debugging is still on. The cause wasn't determined.
- **`gh run download` stalled.** It made no visible progress for about 4 minutes on the 21 MB artifact. Downloading the artifact zip from the REST API worked: `curl -L -H "Authorization: Bearer $(gh auth token)" -o apk.zip https://api.github.com/repos/xitij27/domove/actions/artifacts/<artifact-id>/zip`.
- **No git identity on the laptop.** `user.name` and `user.email` aren't configured, so `git commit` fails until they're set. `7cb0a30` was committed with a one-off identity.

## Timeline

16 Oct 2026, CEST (UTC+2).

| Time | Event |
|---|---|
| 14:46 | v0.1.0 published |
| 15:02 | v0.1.1 published with the crash screen |
| 15:14 | Launch crash captured with adb logcat on the HONOR (v0.1.0) |
| 15:52 | Local release build started; 26 tasks done by 16:05, then stopped |
| 16:09 | Fix committed and pushed (`7cb0a30`); first CI run started |
| 16:12 | First run cancelled because it started before the secrets existed; re-run started |
| 16:24 | CI build finished and the APK was uploaded |
| 16:31 | Fixed APK verified on the Samsung |
| 16:33 | Fixed APK verified on the HONOR |
| 16:46 | Workflow limited to pushes to `main` (`f3ec3f3`) |

## Next steps

- Merge `mobile-app-backend` to `main` so the APK workflow can run again (issue 3).
- Release the fixed APK as v0.1.2 so testers on v0.1.0 or v0.1.1 can update, with a bumped version (issue 4).
- Move the crash handler into `attachBaseContext()` and test it with a deliberate startup crash (issue 2).
- Fix the smaller items in issue 4.

## Sources

1. R8 compatibility FAQ, full mode: <https://r8.googlesource.com/r8/+/refs/heads/main/compatibility-faq.md>
2. AGP 8.0.0 release notes ("AGP 8.0 enables R8 full mode by default"): <https://developer.android.com/build/releases/past-releases/agp-8-0-0-release-notes>
3. AOSP `frameworks/base`: [`Application.java`](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/app/Application.java), [`ActivityThread.java`](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/app/ActivityThread.java)
4. GitHub Docs, `workflow_dispatch`: <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>
5. Google Maven: `work-runtime-2.9.1.pom`, and `proguard.txt` in `room-runtime` 2.5.0, 2.6.0 and 2.6.1 and `room-runtime-android` 2.7.0 and 2.8.5: <https://maven.google.com/web/index.html>
6. CI run: <https://github.com/xitij27/domove/actions/runs/38913536813>
