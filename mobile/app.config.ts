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
  ],
});
