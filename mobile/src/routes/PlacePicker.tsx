import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { strings, useStrings } from '../i18n';
import { STOP_COLORS } from '../maps/routeOverlay';
import { Appear, DURATION, useTween } from '../motion';
import { PALETTES, type MapTheme } from '../theme';
import type { Coordinate, PlacePick } from './model';
import { placeNameAt } from './places';

const PIN = 48;
// The pin glyph's tip, from its top: 22 of its 24 units.
const PIN_TIP = (PIN * 22) / 24;
const LIFT = 12;
// Leaves the map's logo in sight below the card.
const LOGO_ROOM = 40;

/** What a place chosen where Photon knows no name is called. */
export function pinLabel({ latitude, longitude }: Coordinate) {
  return strings().picker.pinAt(latitude.toFixed(5), longitude.toFixed(5));
}

/**
 * Chooses a place by moving the map under a pin fixed at its middle, the way ride apps do; the card names
 * the place under it and hands it to the form.
 */
export default function PlacePicker({ pick, center, theme, onDone }: {
  pick: PlacePick;
  /** The map's middle where it settled; null while it moves. */
  center: Coordinate | null;
  theme: MapTheme;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useStrings();
  const palette = PALETTES[theme];
  const color = STOP_COLORS[pick.kind];
  // A null label: Photon knows no name there, or could not be asked.
  const [found, setFound] = useState<{ at: Coordinate; label: string | null } | null>(null);
  const latitude = center?.latitude;
  const longitude = center?.longitude;
  // The pin lifts briskly as the map starts to move, and settles more gently once it stops.
  const lifted = useTween(center ? 0 : 1, center ? DURATION.medium : DURATION.short);
  const lift = useMemo(() => [{ translateY: lifted.interpolate({ inputRange: [0, 1], outputRange: [0, -LIFT] }) }], [lifted]);

  // By value: the map reports the same middle again when it idles after loading tiles.
  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;
    const at = { latitude, longitude };
    const controller = new AbortController();
    placeNameAt(at, controller.signal).then(
      (label) => setFound({ at, label }),
      () => { if (!controller.signal.aborted) setFound({ at, label: null }); },
    );
    return () => controller.abort();
  }, [latitude, longitude]);

  // Mounted after the sheet's, so it comes first and back cancels the choice instead.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onDone(); return true; });
    return () => subscription.remove();
  }, [onDone]);

  // undefined while the name is being looked up; only ever for the point under the pin
  const label = center && found?.at.latitude === center.latitude && found.at.longitude === center.longitude ? found.label : undefined;
  // What the card shows is what the form gets.
  const place = center && { label: label ?? pinLabel(center), coordinate: center };

  return (
    <>
      <View style={styles.pinArea} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {/* The pin's tip and this spot mark the chosen point; the pin lifts off it while the map moves. */}
        <View style={styles.middle}>
          <View style={[styles.spot, { backgroundColor: color }]} />
          <Animated.View style={[styles.pin, { transform: lift }]}>
            <MaterialIcons name="place" size={PIN} color={color} style={styles.pinShadow} />
          </Animated.View>
        </View>
      </View>

      <Appear from={{ y: 24 }} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, bottom: insets.bottom + LOGO_ROOM }]}>
        <View style={styles.head}>
          <MaterialIcons name="place" size={20} color={color} />
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{pick.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t.picker.stop} hitSlop={8} onPress={onDone} style={styles.close}>
            <MaterialIcons name="close" size={22} color={palette.muted} />
          </Pressable>
        </View>
        <View accessibilityLiveRegion="polite" style={styles.placeRow}>
          <Text numberOfLines={2} style={[styles.place, { color: place ? palette.text : palette.muted }]}>
            {place ? place.label : t.picker.moving}
          </Text>
          {place && label === undefined && <ActivityIndicator accessibilityLabel={t.picker.lookingUp} size="small" color={palette.muted} />}
        </View>
        <Text style={{ color: palette.muted }}>{t.picker.hint}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !place }}
          disabled={!place}
          onPress={() => { if (place) { pick.onPick(place); onDone(); } }}
          style={[styles.use, !place && styles.disabled]}
        >
          <Text style={styles.useText}>{t.picker.use}</Text>
        </Pressable>
      </Appear>
    </>
  );
}

const styles = StyleSheet.create({
  pinArea: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  // zero-sized, at the map's exact middle, so what hangs off it is placed from that point
  middle: { width: 0, height: 0 },
  spot: { position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: '#ffffff' },
  pin: { position: 'absolute', left: -PIN / 2, top: -PIN_TIP },
  pinShadow: { textShadowColor: 'rgba(0, 0, 0, 0.35)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 2 } },
  card: { position: 'absolute', left: 12, right: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8, elevation: 4, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: '600' },
  close: { padding: 4 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  place: { flex: 1, fontSize: 17, fontWeight: '600' },
  use: { backgroundColor: '#a8520e', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 4 },
  useText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
});
