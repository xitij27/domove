import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useAnimatedValue, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { PALETTES, type MapTheme } from '../theme';
import { isWet, skyOf } from './weather';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type Motion = ComponentProps<typeof Animated.View>['style'];

// One slow clock drives every motion in a symbol, each repeating a whole number of times per turn,
// so the loop starting over never shows.
const TURN_MS = 12_000;
// The cloud in front has a rim in the colour behind the symbol, cutting it out of the sun or cloud it covers.
const RIM = 1.16;
// Positions and sizes from here on are fractions of the symbol's size.

/** Where each drop leaves the cloud and how far down it is at the start; how often they fall per turn, and their shape. */
type Drops = { drops: (readonly [x: number, phase: number])[]; times: number; width: number; length: number };
const DRIZZLE: Drops = { drops: [[0.3, 0.17], [0.5, 0.83], [0.7, 0.5]], times: 8, width: 0.06, length: 0.1 };
const RAIN: Drops = { drops: [[0.24, 0.1], [0.4, 0.6], [0.56, 0.35], [0.72, 0.85]], times: 12, width: 0.065, length: 0.17 };
const STORM: Drops = { drops: [[0.24, 0.3], [0.72, 0.75]], times: 12, width: 0.065, length: 0.17 };
const FLAKES = [[0.24, 0.15], [0.46, 0.65], [0.68, 0.4]] as const;
const FOG = [[0.15, 0.64, 0.7], [0.24, 0.76, 0.56], [0.12, 0.88, 0.66]] as const;
// fading in as it leaves the cloud, and out before it lands
const FADE = { inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] };

/**
 * The sky of a WMO weather `code`, drawn from layered icons: the sun or the moon, clouds, and rain, snow or lightning
 * coming out of them, gently moving unless `still` or the phone asks for less motion.
 */
export default function WeatherSymbol({ code, day, theme, size, background, still = false }: {
  code: number;
  day: boolean;
  theme: MapTheme;
  size: number;
  /** what the symbol sits on, for the rim around the cloud in front */
  background: string;
  /** small symbols in a list keep still, so only the big one moves */
  still?: boolean;
}) {
  const colors = PALETTES[theme].weather;
  const clock = useClock(!still);
  const s = size;
  const sky = skyOf(code);
  const light = (scale: number, left: number, top: number) => day
    ? <Sun clock={clock} s={s} color={colors.sun} size={scale} left={left} top={top} />
    : <Moon clock={clock} s={s} color={colors.moon} size={scale} left={left} top={top} />;

  return (
    <View style={{ width: s, height: s }} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {sky === 'clear' && (day
        ? <Sun clock={clock} s={s} color={colors.sun} size={1} left={0} top={0} glow />
        : <Moon clock={clock} s={s} color={colors.moon} size={0.84} left={0.02} top={0.1} stars />)}
      {sky === 'partly' && (
        <>
          {light(0.68, 0.32, 0)}
          <Cloud clock={clock} s={s} color={colors.cloud} rim={background} size={0.8} left={0} top={0.24} />
        </>
      )}
      {sky === 'cloudy' && (
        <>
          <Cloud clock={clock} s={s} color={colors.cloudBack} size={0.64} left={0.36} top={0.06} drift={0.75} />
          <Cloud clock={clock} s={s} color={colors.cloud} rim={background} size={0.84} left={0} top={0.22} />
        </>
      )}
      {sky === 'fog' && (
        <>
          <Cloud clock={clock} s={s} color={colors.cloud} rim={background} size={0.74} left={0.13} top={-0.04} />
          <Fog clock={clock} s={s} color={colors.cloudBack} />
        </>
      )}
      {isWet(code) && (
        <>
          {sky === 'showers' && light(0.6, 0.4, -0.02)}
          <Cloud clock={clock} s={s} color={sky === 'rain' || sky === 'thunder' ? colors.storm : colors.cloud} rim={background} size={0.84} left={0.04} top={-0.08} sway={0.02} />
          {sky === 'drizzle' && <Rain clock={clock} s={s} color={colors.drop} drops={DRIZZLE} />}
          {(sky === 'rain' || sky === 'showers') && <Rain clock={clock} s={s} color={colors.drop} drops={RAIN} />}
          {sky === 'snow' && <Snow clock={clock} s={s} color={colors.flake} />}
          {sky === 'thunder' && (
            <>
              <Rain clock={clock} s={s} color={colors.drop} drops={STORM} />
              <Bolt clock={clock} s={s} color={colors.bolt} />
            </>
          )}
        </>
      )}
    </View>
  );
}

/** Goes from `from` to `to` and back, `times` per turn, `phase` (0–1) of the way through its first go. */
function swing(clock: Animated.Value, times: number, from: number, to: number, phase = 0) {
  const steps = times * 8;
  const inputRange = Array.from({ length: steps + 1 }, (_, i) => i / steps);
  return clock.interpolate({
    inputRange,
    outputRange: inputRange.map((t) => from + ((to - from) * (1 - Math.cos(2 * Math.PI * (t * times + phase)))) / 2),
  });
}

/** How far along its fall something is, 0–1, falling `times` per turn and `phase` of the way down at the start. */
const falling = (clock: Animated.Value, times: number, phase: number) =>
  Animated.modulo(Animated.add(Animated.multiply(clock, times), phase), 1);

/** An icon `size` wide, its top left corner at `left`, `top`. */
function Glyph({ name, color, s, size, left, top, style }: {
  name: IconName; color: string; s: number; size: number; left: number; top: number; style?: Motion;
}) {
  return (
    <Animated.View style={[styles.layer, { left: left * s, top: top * s, width: size * s, height: size * s }, style]}>
      <MaterialCommunityIcons name={name} size={size * s} color={color} />
    </Animated.View>
  );
}

type Part = { clock: Animated.Value; s: number; color: string };
type Placed = Part & { size: number; left: number; top: number };

function Sun({ clock, s, color, size, left, top, glow = false }: Placed & { glow?: boolean }) {
  const motion = useMemo(() => ({
    // eight rays, so a quarter turn looks the same as none
    turn: { transform: [{ rotate: clock.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }] },
    glow: { opacity: swing(clock, 2, 0.2, 0.4), transform: [{ scale: swing(clock, 2, 0.9, 1.12) }] },
  }), [clock]);
  const halo = size * 0.62;
  return (
    <>
      {glow && (
        <Animated.View
          style={[styles.layer, {
            left: (left + (size - halo) / 2) * s, top: (top + (size - halo) / 2) * s, width: halo * s, height: halo * s,
            borderRadius: (halo * s) / 2, backgroundColor: color,
          }, motion.glow]}
        />
      )}
      <Glyph name="white-balance-sunny" color={color} s={s} size={size} left={left} top={top} style={motion.turn} />
    </>
  );
}

function Moon({ clock, s, color, size, left, top, stars = false }: Placed & { stars?: boolean }) {
  const twinkle = useMemo(() => [{ opacity: swing(clock, 3, 1, 0.3) }, { opacity: swing(clock, 2, 0.35, 0.9, 0.5) }], [clock]);
  return (
    <>
      <Glyph name="moon-waning-crescent" color={color} s={s} size={size} left={left} top={top} />
      {stars && (
        <>
          <Glyph name="star-four-points" color={color} s={s} size={0.26} left={0.66} top={0.04} style={twinkle[0]} />
          <Glyph name="star-four-points" color={color} s={s} size={0.17} left={0.78} top={0.44} style={twinkle[1]} />
        </>
      )}
    </>
  );
}

/** A cloud drifting `sway` either way; with a `rim`, cut out of what lies behind it. */
function Cloud({ clock, s, color, size, left, top, rim, sway = 0.03, drift = 0.25 }: Placed & { rim?: string; sway?: number; drift?: number }) {
  // `drift` 0.25 starts it in the middle, so a still cloud sits where it is placed
  const motion = useMemo(() => ({ transform: [{ translateX: swing(clock, 1, -sway * s, sway * s, drift) }] }), [clock, s, sway, drift]);
  const outer = size * RIM;
  const inset = (outer - size) / 2;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, motion]}>
      {rim && <Glyph name="cloud" color={rim} s={s} size={outer} left={left - inset} top={top - inset} />}
      <Glyph name="cloud" color={color} s={s} size={size} left={left} top={top} />
    </Animated.View>
  );
}

function Rain({ clock, s, color, drops }: Part & { drops: Drops }) {
  const width = Math.max(1.5, drops.width * s);
  const motion = useMemo(() => drops.drops.map(([, phase]) => {
    const fall = falling(clock, drops.times, phase);
    return {
      opacity: fall.interpolate(FADE),
      // slanting, as if blown, and falling the way it slants
      transform: [
        { translateX: fall.interpolate({ inputRange: [0, 1], outputRange: [0, -0.09 * s] }) },
        { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [0, 0.34 * s] }) },
        { rotate: '15deg' },
      ],
    };
  }), [clock, s, drops]);
  return <>{drops.drops.map(([x], i) => (
    <Animated.View
      key={x}
      style={[styles.layer, { left: x * s, top: 0.58 * s, width, height: drops.length * s, borderRadius: width / 2, backgroundColor: color }, motion[i]]}
    />
  ))}</>;
}

function Snow({ clock, s, color }: Part) {
  const motion = useMemo(() => FLAKES.map(([, phase]) => {
    const fall = falling(clock, 4, phase);
    return {
      opacity: fall.interpolate(FADE),
      transform: [
        { translateX: fall.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 0.05 * s, 0, -0.05 * s, 0] }) },
        { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3 * s] }) },
      ],
    };
  }), [clock, s]);
  const flake = 0.11 * s;
  return <>{FLAKES.map(([x], i) => (
    <Animated.View
      key={x}
      style={[styles.layer, { left: x * s, top: 0.58 * s, width: flake, height: flake, borderRadius: flake / 2, backgroundColor: color }, motion[i]]}
    />
  ))}</>;
}

function Fog({ clock, s, color }: Part) {
  const motion = useMemo(() => FOG.map((_, i) => ({ transform: [{ translateX: swing(clock, 1, -0.04 * s, 0.04 * s, 0.25 + i / 3) }] })), [clock, s]);
  const height = 0.075 * s;
  return <>{FOG.map(([left, top, width], i) => (
    <Animated.View
      key={top}
      style={[styles.layer, { left: left * s, top: top * s, width: width * s, height, borderRadius: height / 2, backgroundColor: color }, motion[i]]}
    />
  ))}</>;
}

function Bolt({ clock, s, color }: Part) {
  // two flickers per turn, each a double flash
  const flash = useMemo(() => ({
    opacity: clock.interpolate({
      inputRange: [0, 0.3, 0.31, 0.33, 0.35, 0.37, 0.8, 0.81, 0.83, 1],
      outputRange: [1, 1, 0.2, 1, 0.3, 1, 1, 0.2, 1, 1],
    }),
  }), [clock]);
  return <Glyph name="flash" color={color} s={s} size={0.42} left={0.32} top={0.52} style={flash} />;
}

function useClock(running: boolean) {
  const clock = useAnimatedValue(0);
  const reduceMotion = useReduceMotion();
  const moving = running && reduceMotion === false;
  useEffect(() => {
    if (!moving) return;
    const loop = Animated.loop(Animated.timing(clock, { toValue: 1, duration: TURN_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      clock.setValue(0);
    };
  }, [clock, moving]);
  return clock;
}

// null until the phone says, so nothing starts moving only to stop again
function useReduceMotion() {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => { if (live) setReduce(on); }, () => { if (live) setReduce(false); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
