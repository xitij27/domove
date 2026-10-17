import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TRANSPORT_MODES, type TransportMode } from '../routes/model';
import { PALETTES, type MapTheme } from '../theme';
import { BAND_LABELS, describeReason, formatPoints, ratedFor, routeUseText, type Band, type RouteSiteRating, type SiteRating } from './model';

// Grey for little or no effect, amber for medium, red for high and severe; strong enough on white and on the night card.
export const BAND_COLORS: Record<MapTheme, Record<Band, string>> = {
  day: { none: '#6b7280', low: '#475569', medium: '#b45309', high: '#c62828', severe: '#8e0000' },
  night: { none: '#9aa4b5', low: '#a7b4c8', medium: '#ffb74d', high: '#ff7b72', severe: '#ff4d4d' },
};
const BADGE_TEXT: Record<MapTheme, string> = { day: '#ffffff', night: '#1a1d23' };
const MODES: TransportMode[] = ['car', 'bike', 'pedestrian'];

const forRoute = (r: SiteRating | RouteSiteRating): r is RouteSiteRating => 'routeUse' in r;

/**
 * A site's impact score with every point behind it: what the site closes, what is around it,
 * and what doesn't count at this time and why. Nothing is hidden behind the number.
 */
export default function ImpactScore({ rating, loading, error, onRetry, mode, onModeChange, theme, onExplain }: {
  rating: SiteRating | RouteSiteRating | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  mode: TransportMode;
  /** Lets the user switch the mode the score is for; left out on a route, which has its own. */
  onModeChange?: (mode: TransportMode) => void;
  theme: MapTheme;
  onExplain: () => void;
}) {
  const palette = PALETTES[theme];
  const color = rating ? BAND_COLORS[theme][rating.band] : palette.muted;

  return (
    <View style={[styles.box, { borderTopColor: palette.border }]}>
      {onModeChange && (
        <View accessibilityRole="radiogroup" accessibilityLabel="Impact score for" style={styles.modes}>
          {MODES.map((m) => (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ checked: m === mode }}
              onPress={() => onModeChange(m)}
              style={[styles.mode, { borderColor: m === mode ? palette.accent : palette.border }]}
            >
              <Text style={{ color: m === mode ? palette.text : palette.muted }}>{TRANSPORT_MODES[m]}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {error ? (
        <Pressable accessibilityRole="button" onPress={onRetry}>
          <Text style={{ color: palette.status.current }}>{error} — tap to retry</Text>
        </Pressable>
      ) : !rating ? (
        loading ? <ActivityIndicator color={palette.muted} accessibilityLabel="Working out the impact score" />
          : <Text style={{ color: palette.muted }}>No impact score for this site yet.</Text>
      ) : (
        <>
          <View
            style={styles.head}
            accessible
            accessibilityLabel={`Impact ${rating.rating} out of 10, ${BAND_LABELS[rating.band]}, ${ratedFor(mode, rating.ratedAt)}`}
          >
            <View style={[styles.badge, { backgroundColor: color }]}>
              <Text style={[styles.badgeNumber, { color: BADGE_TEXT[theme] }]}>{rating.rating}</Text>
              <Text style={[styles.badgeOf, { color: BADGE_TEXT[theme] }]}>/10</Text>
            </View>
            <View style={styles.headText}>
              <Text style={[styles.band, { color }]}>{BAND_LABELS[rating.band]}</Text>
              <Text style={{ color: palette.muted }}>{ratedFor(mode, rating.ratedAt)}</Text>
            </View>
          </View>

          {!rating.active && (
            <Text style={{ color: palette.muted }}>
              Not running then{rating.startsOn ? ` · runs from ${rating.startsOn}` : ''}{rating.endsOn ? ` to ${rating.endsOn}` : ''}
            </Text>
          )}
          {forRoute(rating) && <Text style={{ color: palette.text }}>{routeUseText(rating)}</Text>}

          <ScrollView style={styles.reasons} nestedScrollEnabled>
            {rating.reasons.map((reason, i) => {
              const line = describeReason(reason, mode);
              const tone = line.counted && !line.note ? palette.text : palette.muted;
              return (
                <View
                  // the server lists the reasons in a fixed order
                  key={`${reason.factor}-${i}`}
                  style={styles.reason}
                  accessible
                  accessibilityLabel={[line.label, line.detail, line.note ? null : `${formatPoints(line.points)} points`].filter(Boolean).join('. ')}
                >
                  <View style={styles.reasonText}>
                    <Text style={{ color: tone }}>{line.label}</Text>
                    {line.detail && <Text style={[styles.detail, { color: palette.muted }]}>{line.detail}</Text>}
                  </View>
                  {!line.note && <Text style={[styles.points, { color: tone }]}>{formatPoints(line.points)}</Text>}
                </View>
              );
            })}
          </ScrollView>

          <Text style={[styles.sum, { color: palette.muted }]}>
            Closure {rating.disruption.toFixed(1)} + surroundings {rating.surroundings.toFixed(1)} = {rating.score.toFixed(1)}, rounded to {rating.rating}/10
          </Text>
        </>
      )}

      <Pressable accessibilityRole="button" onPress={onExplain} hitSlop={8} style={styles.explain}>
        <Text style={{ color: palette.accent, fontWeight: '600' }}>How scores work</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  modes: { flexDirection: 'row', gap: 6 },
  mode: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { flexDirection: 'row', alignItems: 'baseline', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  badgeNumber: { fontSize: 22, fontWeight: '700' },
  badgeOf: { fontSize: 13, fontWeight: '600' },
  headText: { flex: 1 },
  band: { fontSize: 15, fontWeight: '600' },
  // the card sits over the map; a long breakdown scrolls instead of covering it
  reasons: { maxHeight: 220 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 3 },
  reasonText: { flex: 1 },
  detail: { fontSize: 12 },
  points: { minWidth: 40, textAlign: 'right', fontVariant: ['tabular-nums'] },
  sum: { fontSize: 12 },
  explain: { alignSelf: 'flex-start', paddingVertical: 2 },
});
