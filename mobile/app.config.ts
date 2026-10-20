import type { ConfigContext } from 'expo/config';

// A release build is numbered after its GitHub release tag (DOMOVE_VERSION, set by .github/workflows/android-apk.yml),
// so Settings can tell whether a newer release exists. Anything else stays 0.0.0: a development build.
const release = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(process.env.DOMOVE_VERSION ?? '');

// Extends app.json; the Google key comes from .env (gitignored) so it never lands in git.
export default ({ config }: ConfigContext) => ({
  ...config,
  ...(release && {
    version: release.slice(1).join('.'),
    // Android installs an update only over a lower or equal version code, so it grows with every release.
    android: { ...config.android, versionCode: Number(release[1]) * 1_000_000 + Number(release[2]) * 1_000 + Number(release[3]) },
  }),
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-maps', {
      androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    }],
    ['expo-location', { locationWhenInUsePermission: 'Shows where you are among the construction sites.' }],
    './plugins/withCrashLog.js',
    './plugins/withGradleJvmArgs.js',
    ['expo-notifications', { defaultChannel: 'construction-reminders', color: '#a8520e' }],
    ['expo-build-properties', {
      android: {
        // react-native-maps pulls in WorkManager 2.9 and with it Room 2.5, whose keep rule lets R8 full mode strip the
        // constructor Room calls by reflection; release builds then crash at launch in WorkManagerInitializer.
        extraProguardRules: '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
      },
    }],
  ],
});
