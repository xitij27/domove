// The tests run as on a phone set to reduce motion, where things appear and go at once, so none of them waits on an
// animation; src/motion.test.tsx turns motion back on to check it.
const { AccessibilityInfo } = require('react-native');

AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);
