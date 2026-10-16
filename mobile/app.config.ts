import type { ConfigContext } from 'expo/config';

// Extends app.json; the Google key comes from .env (gitignored) so it never lands in git.
export default ({ config }: ConfigContext) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-maps', {
      androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    }],
    './plugins/withCrashLog.js',
    './plugins/withGradleJvmArgs.js',
    ['expo-build-properties', {
      android: {
        // react-native-maps pulls in WorkManager 2.9 and with it Room 2.5, whose keep rule lets R8 full mode strip the
        // constructor Room calls by reflection; release builds then crash at launch in WorkManagerInitializer.
        extraProguardRules: '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
      },
    }],
  ],
});
