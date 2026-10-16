const { withMainApplication } = require('expo/config-plugins');

// Saves uncaught Android crashes to filesDir/last-crash.txt; App.tsx shows it on the next launch.
// shortcut: no crash-reporting service, swap for one (e.g. Sentry) once the app has real users.
module.exports = function withCrashLog(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('last-crash.txt')) {
      src = src.replace(/override fun onCreate\(\) \{\n(\s*)super\.onCreate\(\)\n/, (match, indent) =>
        match +
        `${indent}val previousHandler = Thread.getDefaultUncaughtExceptionHandler()\n` +
        `${indent}Thread.setDefaultUncaughtExceptionHandler { thread, error ->\n` +
        `${indent}  runCatching { java.io.File(filesDir, "last-crash.txt").writeText(android.util.Log.getStackTraceString(error)) }\n` +
        `${indent}  previousHandler?.uncaughtException(thread, error)\n` +
        `${indent}}\n`,
      );
      if (!src.includes('last-crash.txt')) throw new Error('withCrashLog: onCreate not found in MainApplication');
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
