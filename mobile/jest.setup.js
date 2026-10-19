// The tests run as on a phone set to reduce motion, where things appear and go at once, so none of them waits on an
// animation; src/motion.test.tsx turns motion back on to check it.
const { AccessibilityInfo } = require('react-native');

AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);

// The app starts in the phone's language; the tests read English whatever the machine running them is set to.
require('./src/i18n').setLanguage('en', false);
