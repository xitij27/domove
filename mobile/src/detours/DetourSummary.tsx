import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useStrings } from '../i18n';
import { PALETTES, type MapTheme } from '../theme';
import { describeWay, formatDuration, wayLabel } from './text';
import type { DetourState } from './useDetours';

/**
 * The route card's part on the way shown: how long it takes, what it goes around and what is still in the way,
 * and the other ways to pick, which the map also draws in grey. The card's Google Maps button opens the way picked.
 */
export default function DetourSummary({ detours, chosen, onChoose, onRetry, nameOf, theme }: {
  detours: DetourState;
  /** The way shown, as an index into the plan's options. */
  chosen: number;
  onChoose: (index: number) => void;
  onRetry: () => void;
  /** A site's name for a sentence. */
  nameOf: (siteId: string) => string;
  theme: MapTheme;
}) {
  const palette = PALETTES[theme];
  const t = useStrings();

  if (detours.status === 'planning') {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={palette.muted} />
        <Text style={{ color: palette.muted }}>{t.detours.planning}</Text>
      </View>
    );
  }
  if (detours.status === 'failed') {
    return (
      <View style={styles.box}>
        <Pressable accessibilityRole="button" onPress={onRetry}>
          <Text style={{ color: palette.status.current }}>{t.detours.failed(detours.error)}</Text>
        </Pressable>
      </View>
    );
  }

  const { plan } = detours;
  const way = describeWay(plan, chosen, nameOf);
  return (
    <View style={styles.box}>
      <View accessible accessibilityLabel={way.spoken}>
        <Text style={[styles.headline, { color: palette.text }]}>{way.headline}</Text>
        {way.avoids && <Text style={{ color: palette.muted }}>{way.avoids}</Text>}
      </View>
      {way.warning && (
        <View style={styles.row}>
          <MaterialIcons name="warning" size={16} color={palette.status.current} />
          <Text style={[styles.fill, { color: palette.text }]}>{way.warning}</Text>
        </View>
      )}
      {plan.options.length > 1 && (
        <View accessibilityRole="radiogroup" accessibilityLabel={t.detours.ways} style={styles.ways}>
          {plan.options.map((option, index) => (
            <Pressable
              key={index}
              accessibilityRole="radio"
              accessibilityState={{ checked: index === chosen }}
              accessibilityLabel={describeWay(plan, index, nameOf).spoken}
              onPress={() => onChoose(index)}
              style={[styles.way, { borderColor: index === chosen ? palette.accent : palette.border }]}
            >
              <Text style={{ color: index === chosen ? palette.text : palette.muted }}>{wayLabel(plan, index)} · {formatDuration(option.seconds)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {/* the ways come from OpenStreetMap's data, which asks for this next to anything made from it */}
      <Text style={[styles.attribution, { color: palette.muted }]}>{t.detours.credit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fill: { flex: 1 },
  headline: { fontWeight: '600' },
  ways: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  way: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  attribution: { fontSize: 11 },
});
