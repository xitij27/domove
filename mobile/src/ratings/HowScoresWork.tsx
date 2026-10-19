import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { number, useStrings } from '../i18n';
import { PALETTES, type MapTheme } from '../theme';
import type { RatingsApi } from './api';
import { useWeights } from './useRatings';

// The values the ratings migration starts with, shown until the server's arrive (or if they can't).
export const DEFAULT_WEIGHTS: Record<string, number> = {
  disruption_max: 6, closure_blocked: 1, closure_slowed_120: 0.6, closure_slowed_60: 0.4, closure_slowed_30: 0.25,
  road_main: 1, road_through: 0.6, road_other: 0.3, road_main_walk: 1, road_through_walk: 0.8, road_other_walk: 0.6,
  rush_hour_factor: 1.3, rush_morning_from_h: 7, rush_morning_to_h: 9, rush_evening_from_h: 16, rush_evening_to_h: 18,
  surroundings_max: 4, school_radius_m: 150, school_from_h: 7, school_to_h: 17, school_primary_points: 1.5, school_other_points: 1,
  crossing_radius_m: 20, school_route_radius_m: 300, school_route_crossing_points: 1.5, crossing_points: 0.5, crossing_points_walk: 1,
  care_radius_m: 100, care_points: 0.5, care_points_walk: 1, fire_station_radius_m: 500, hospital_radius_m: 300, emergency_points: 1,
  bus_stop_radius_m: 30, rail_stop_radius_m: 50, transit_points: 0.5, transit_points_walk: 1,
  nearby_works_radius_m: 300, nearby_works_min_disruption: 3, nearby_works_points: 1,
  daytime_from_h: 6, daytime_to_h: 22, uses_street_m: 20, crossing_weight: 0.3,
};

/** What goes into an impact score, with the numbers the server uses right now. */
export default function HowScoresWork({ visible, onClose, theme, api }: {
  visible: boolean;
  onClose: () => void;
  theme: MapTheme;
  api?: RatingsApi;
}) {
  const palette = PALETTES[theme];
  const insets = useSafeAreaInsets();
  const t = useStrings();
  const h = t.howScores;
  const weights = useWeights(visible, api);
  const w = (key: string) => weights.value?.[key] ?? DEFAULT_WEIGHTS[key];
  const n = (key: string) => number(w(key));
  const pts = (key: string) => `+${n(key)}`;
  const text = { color: palette.text };
  const muted = { color: palette.muted };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.fill, { backgroundColor: palette.surface, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.top}>
          <Text accessibilityRole="header" style={[styles.title, text]}>{h.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t.common.close} hitSlop={8} onPress={onClose}>
            <MaterialIcons name="close" size={24} color={palette.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={text}>{h.intro}</Text>

          <Section color={palette.text} title={h.closes(n('disruption_max'))}>
            <Text style={muted}>{h.formula(n('disruption_max'))}</Text>
            <Row color={palette.text} label={h.blocks} value={`× ${n('closure_blocked')}`} />
            <Row color={palette.text} label={h.slowsTwo} value={`× ${n('closure_slowed_120')}`} />
            <Row color={palette.text} label={h.slowsOne} value={`× ${n('closure_slowed_60')}`} />
            <Row color={palette.text} label={h.slowsLittle} value={`× ${n('closure_slowed_30')}`} />
            <Row color={palette.text} label={h.mainRoad} value={`× ${n('road_main')} / ${n('road_main_walk')}`} />
            <Row color={palette.text} label={h.throughRoad} value={`× ${n('road_through')} / ${n('road_through_walk')}`} />
            <Row color={palette.text} label={h.otherStreet} value={`× ${n('road_other')} / ${n('road_other_walk')}`} />
            <Row
              color={palette.text}
              label={h.rushHour(n('rush_morning_from_h'), n('rush_morning_to_h'), n('rush_evening_from_h'), n('rush_evening_to_h'))}
              value={`× ${n('rush_hour_factor')}`}
            />
            <Text style={muted}>{h.fromTitle}</Text>
          </Section>

          <Section color={palette.text} title={h.around(n('surroundings_max'))}>
            <Text style={muted}>{h.aroundNote}</Text>
            <Row color={palette.text} label={h.primarySchool(n('school_radius_m'), n('school_from_h'), n('school_to_h'))} value={pts('school_primary_points')} />
            <Row color={palette.text} label={h.otherSchool} value={pts('school_other_points')} />
            <Row color={palette.text} label={h.schoolCrossings(n('crossing_radius_m'), n('school_route_radius_m'))} value={pts('school_route_crossing_points')} />
            <Row color={palette.text} label={h.crossings} value={`${pts('crossing_points')} / ${pts('crossing_points_walk')}`} />
            <Row color={palette.text} label={h.care(n('care_radius_m'))} value={`${pts('care_points')} / ${pts('care_points_walk')}`} />
            <Row color={palette.text} label={h.emergency(n('fire_station_radius_m'), n('hospital_radius_m'))} value={pts('emergency_points')} />
            <Row color={palette.text} label={h.transit(n('bus_stop_radius_m'), n('rail_stop_radius_m'))} value={`${pts('transit_points')} / ${pts('transit_points_walk')}`} />
            <Row color={palette.text} label={h.nearbyWorks(n('nearby_works_radius_m'))} value={pts('nearby_works_points')} />
          </Section>

          <Section color={palette.text} title={h.meaning}>
            <Row color={palette.text} label={h.none} value="0" />
            <Row color={palette.text} label={h.low} value="1–3" />
            <Row color={palette.text} label={h.medium} value="4–6" />
            <Row color={palette.text} label={h.high} value="7–8" />
            <Row color={palette.text} label={h.severe} value="9–10" />
            <Text style={muted}>{h.daytime(n('daytime_from_h'), n('daytime_to_h'))}</Text>
          </Section>

          <Section color={palette.text} title={h.onRoute}>
            <Text style={text}>{h.onRouteText(n('uses_street_m'), Math.round(w('crossing_weight') * 100))}</Text>
          </Section>

          <Section color={palette.text} title={h.sources}>
            <Text style={text}>{h.sourceSites}</Text>
            <Text style={text}>{h.sourcePlaces}</Text>
            <Text style={text}>{h.sourceOsm}</Text>
            <Text style={text}>{h.sourceHolidays}</Text>
          </Section>

          <Section color={palette.text} title={h.limits}>
            <Text style={text}>{h.limitsText}</Text>
          </Section>

          <Text style={muted}>{weights.error ? h.valuesFailed : weights.loading ? h.valuesLoading : h.valuesLive}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.heading, { color }]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      <Text style={[styles.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 20, fontWeight: '700', flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 18 },
  section: { gap: 6 },
  heading: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12 },
  rowLabel: { flex: 1 },
  rowValue: { minWidth: 64, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
