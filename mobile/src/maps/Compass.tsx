import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Coordinate } from '../routes/model';
import { PALETTES, type MapTheme } from '../theme';
import type { FollowView } from './navigation';

// What the app needs from either map, besides what it reports through `onHeadingChange`, `onCenterChange` and `onUserMove`.
export type MapHandle = {
  pointNorth: () => void;
  /** Zooms in to street level on `center`, or on the map's middle, unpadded; resolves to the point now in the middle. */
  zoomTo: (center: Coordinate | null) => Promise<Coordinate>;
  /** While navigating: tilts the map and puts `view.center` low on screen, the way ahead above it. */
  follow: (view: FollowView) => void;
};
export const POINT_NORTH_MS = 500;
export const STREET_ZOOM = 16;
export const MOVE_MS = 600;

const SIZE = 48; // as wide as the day/night switch above it
const NEEDLE = 10; // length of each half
const LETTER = 12; // height of the "N"

/** How far the map is turned from north, either way, as a screen reader says it. */
export function compassLabel(heading: number) {
  const degrees = Math.round(((heading % 360) + 360) % 360);
  const off = degrees > 180 ? 360 - degrees : degrees;
  return off === 0 ? 'Compass: map points north' : `Compass: map turned ${off}° from north`;
}

// `heading` is set on every frame of a gesture; the needle follows it without a render, and the label only
// renders when the whole degree changes, so turning the map never re-renders the overlay around it.
export default function Compass({ heading, theme, onPress }: {
  heading: Animated.Value;
  theme: MapTheme;
  onPress: () => void;
}) {
  const palette = PALETTES[theme];
  const [label, setLabel] = useState(() => compassLabel(0));
  // A map turned clockwise by its heading puts north that far counter-clockwise on screen.
  const rotate = useMemo(() => heading.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '-360deg'] }), [heading]);

  useEffect(() => {
    const id = heading.addListener(({ value }) => setLabel(compassLabel(value)));
    return () => heading.removeListener(id);
  }, [heading]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Turns the map back to north"
      onPress={onPress}
      android_ripple={{ color: palette.border, borderless: true, radius: SIZE / 2 }}
      style={[styles.compass, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <Animated.View testID="compass-needle" style={[StyleSheet.absoluteFill, styles.rose, { transform: [{ rotate }] }]}>
        <Text style={[styles.letter, { color: palette.north }]}>N</Text>
        <View style={[styles.north, { borderBottomColor: palette.north }]} />
        <View style={[styles.south, { borderTopColor: palette.muted }]} />
      </Animated.View>
    </Pressable>
  );
}

const half = { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderLeftColor: 'transparent', borderRightColor: 'transparent' } as const;

const styles = StyleSheet.create({
  compass: { alignSelf: 'flex-end', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: StyleSheet.hairlineWidth, elevation: 2, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  // turns as a whole around the circle's centre, which is where the two halves meet
  rose: { alignItems: 'center', justifyContent: 'center' },
  letter: { height: LETTER, lineHeight: LETTER, fontSize: 10, fontWeight: '700', includeFontPadding: false },
  north: { ...half, borderBottomWidth: NEEDLE },
  // as far below the needle as the "N" is above it, to keep the needle centred
  south: { ...half, borderTopWidth: NEEDLE, marginBottom: LETTER },
});
