import { memo, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/** How long things take to move, in ms: on the slow side of Material's durations, so nothing snaps. */
export const DURATION = {
  /** A chip dimming, a pin lifting. */
  short: 180,
  /** Something coming or going. */
  medium: 280,
  /** Something making room, or crossing the screen. */
  long: 360,
} as const;

/** Material's curves: motion starts briskly and settles slowly; what leaves picks up speed as it goes. */
export const EASING = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  enter: Easing.bezier(0.05, 0.7, 0.1, 1),
  exit: Easing.bezier(0.3, 0, 0.8, 0.15),
};

// The phone's "reduce motion" or "remove animations" setting: things then appear and go at once.
let reduced = false;
const listeners = new Set<() => void>();
function setReduced(on: boolean) {
  reduced = on;
  listeners.forEach((listener) => listener());
}
AccessibilityInfo.isReduceMotionEnabled().then(setReduced, () => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Whether the phone asks for less motion, for code outside components. */
export const motionReduced = () => reduced;

/** Whether the phone asks for less motion, rendering again when that changes. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, motionReduced);
}

/** A native-driven value that glides to `target` each time it changes, for a transform or an opacity. */
export function useTween(target: number, duration: number = DURATION.medium) {
  const still = useReducedMotion();
  const [value] = useState(() => new Animated.Value(target));
  useEffect(() => {
    if (still) {
      value.setValue(target);
      return;
    }
    const animation = Animated.timing(value, { toValue: target, duration, easing: EASING.standard, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [value, target, duration, still]);
  return value;
}

type Offset = { x?: number; y?: number };

/** Fades its children in as they mount, gliding them `from` that far off (dp) into place; with null they are just there. */
export function Appear({ children, from = { y: 8 }, delay = 0, style }: {
  children: ReactNode;
  from?: Offset | null;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const still = useReducedMotion();
  // Only how they came in counts.
  const [start] = useState(() => (still ? null : from));
  const [progress] = useState(() => new Animated.Value(start ? 0 : 1));
  useEffect(() => {
    if (!start) return;
    const animation = Animated.timing(progress, { toValue: 1, duration: DURATION.long, delay, easing: EASING.enter, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [progress, start, delay]);
  const motion = useMemo(() => start && {
    opacity: progress,
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [start.x ?? 0, 0] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [start.y ?? 0, 0] }) },
    ],
  }, [progress, start]);
  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}

// Keeps what it rendered last while `frozen`, so content on its way out stays as it was after its parent has moved on.
const Frozen = memo(function Frozen({ children }: { children: ReactNode; frozen: boolean }) {
  return children;
}, (_, next) => next.frozen);

const isShown = (children: ReactNode) => children !== null && children !== undefined && children !== false && children !== '';

/** Whether to render: from when `shown` turns on until `setPresent(false)`, once what was shown has animated away. */
function usePresence(shown: boolean) {
  const [present, setPresent] = useState(shown);
  if (shown && !present) setPresent(true);
  return [present || shown, setPresent] as const;
}

/**
 * Shows its children while there are any: it grows to their height as they fade in, and when they go it keeps the
 * last of them while it shrinks and fades away, so what lies around glides aside instead of jumping. `space` above
 * the children grows and shrinks with them. `clip` hides what is not uncovered yet, where it would lie over what
 * follows; without it, a growing card seems to come out from behind what lies below it.
 */
export function Reveal({ children, space = 0, clip = false, style }: {
  children: ReactNode;
  space?: number;
  clip?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const still = useReducedMotion();
  const shown = isShown(children);
  const [present, setPresent] = usePresence(shown);
  const [progress] = useState(() => new Animated.Value(0));
  // The children's own height, which the room follows as it changes.
  const [height] = useState(() => new Animated.Value(0));
  const motion = useMemo(() => ({
    room: Animated.multiply(progress, height),
    // Comes in once there is some room for it, and is gone before the room is.
    opacity: progress.interpolate({ inputRange: [0.25, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
  }), [progress, height]);

  useEffect(() => {
    if (still || !present) return;
    // JS-driven, as a height can't be animated natively.
    const animation = Animated.timing(progress, {
      toValue: shown ? 1 : 0,
      duration: shown ? DURATION.long : DURATION.medium,
      easing: EASING.standard,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => { if (finished && !shown) setPresent(false); });
    return () => animation.stop();
  }, [progress, shown, present, still, setPresent]);

  if (still) return shown ? <View style={[style, styles.passThrough, { paddingTop: space }]}>{children}</View> : null;
  if (!present) return null;
  return (
    // On its way out it is out of reach, and out of a screen reader's.
    <Animated.View
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={[style, { height: motion.room, pointerEvents: shown ? 'box-none' : 'none' }, clip && styles.clip]}
    >
      <Animated.View
        onLayout={(e) => height.setValue(e.nativeEvent.layout.height)}
        style={[styles.measured, styles.passThrough, { paddingTop: space, opacity: motion.opacity }]}
      >
        <Frozen frozen={!shown}>{children}</Frozen>
      </Animated.View>
    </Animated.View>
  );
}

/** Fades its children in while there are any, and the last of them out when they go, taking no room meanwhile. */
export function Fade({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const still = useReducedMotion();
  const shown = isShown(children);
  const [present, setPresent] = usePresence(shown);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (still || !present) return;
    const animation = Animated.timing(opacity, {
      toValue: shown ? 1 : 0,
      duration: shown ? DURATION.medium : DURATION.short,
      easing: EASING.standard,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished && !shown) setPresent(false); });
    return () => animation.stop();
  }, [opacity, shown, present, still, setPresent]);

  if (still) return shown ? <View style={[style, styles.passThrough]}>{children}</View> : null;
  if (!present) return null;
  return (
    <Animated.View
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={[style, { opacity, pointerEvents: shown ? 'box-none' : 'none' }]}
    >
      <Frozen frozen={!shown}>{children}</Frozen>
    </Animated.View>
  );
}

/** Glides its children's opacity to `opacity` each time that changes. */
export function FadeTo({ opacity, children, style }: { opacity: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const value = useTween(opacity, DURATION.short);
  return <Animated.View style={[style, styles.passThrough, { opacity: value }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  // the wrappers themselves never catch a touch, so the map between the cards still pans
  passThrough: { pointerEvents: 'box-none' },
  // laid out at the children's own height, whatever room has been made for them so far
  measured: { position: 'absolute', top: 0, left: 0, right: 0 },
  clip: { overflow: 'hidden' },
});
