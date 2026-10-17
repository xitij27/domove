import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const weights = useWeights(visible, api);
  const w = (key: string) => weights.value?.[key] ?? DEFAULT_WEIGHTS[key];
  const n = (key: string) => String(w(key));
  const pts = (key: string) => `+${w(key)}`;
  const text = { color: palette.text };
  const muted = { color: palette.muted };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.fill, { backgroundColor: palette.surface, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.top}>
          <Text accessibilityRole="header" style={[styles.title, text]}>How impact scores work</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose}>
            <MaterialIcons name="close" size={24} color={palette.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={text}>
            Each construction site gets a score from 0 to 10 for the way you travel, at the time you travel. It adds up what the
            site closes and what is around it. Every point is listed on the site&apos;s card, including the ones that don&apos;t
            count at that time and why.
          </Text>

          <Section color={palette.text} title={`What it closes · up to ${n('disruption_max')} points`}>
            <Text style={muted}>{n('disruption_max')} × closure share × road factor</Text>
            <Row color={palette.text} label="Blocks the way (full closure for cars and bikes, closed sidewalk on foot)" value={`× ${n('closure_blocked')}`} />
            <Row color={palette.text} label="Slows you by 2 minutes or more (half closure for cars)" value={`× ${n('closure_slowed_120')}`} />
            <Row color={palette.text} label="Slows you by about a minute (narrowing, temporary lights)" value={`× ${n('closure_slowed_60')}`} />
            <Row color={palette.text} label="Slows you a little" value={`× ${n('closure_slowed_30')}`} />
            <Row color={palette.text} label="Main road, by car or bike / on foot" value={`× ${n('road_main')} / ${n('road_main_walk')}`} />
            <Row color={palette.text} label="Through road" value={`× ${n('road_through')} / ${n('road_through_walk')}`} />
            <Row color={palette.text} label="Any other street" value={`× ${n('road_other')} / ${n('road_other_walk')}`} />
            <Row
              color={palette.text}
              label={`Cars at rush hour (Mon–Fri ${n('rush_morning_from_h')}–${n('rush_morning_to_h')} and ${n('rush_evening_from_h')}–${n('rush_evening_to_h')}) on main and through roads, when the site slows rather than blocks`}
              value={`× ${n('rush_hour_factor')}`}
            />
            <Text style={muted}>What a site closes is read from its title in the city&apos;s data, e.g. &quot;// Vollsperrung&quot;.</Text>
          </Section>

          <Section color={palette.text} title={`What is around it · up to ${n('surroundings_max')} points`}>
            <Text style={muted}>Only when the site changes something for you: a closed parking lane next to a school stays at 0.</Text>
            <Row color={palette.text} label={`Primary or special school within ${n('school_radius_m')} m, on school days ${n('school_from_h')}–${n('school_to_h')}`} value={pts('school_primary_points')} />
            <Row color={palette.text} label="Any other school, the same way" value={pts('school_other_points')} />
            <Row
              color={palette.text}
              label={`Crossings within ${n('crossing_radius_m')} m of the site and ${n('school_route_radius_m')} m of a primary or special school, on school days`}
              value={pts('school_route_crossing_points')}
            />
            <Row color={palette.text} label="Other crossings with lights, markings or a zebra, by car or bike / on foot" value={`${pts('crossing_points')} / ${pts('crossing_points_walk')}`} />
            <Row color={palette.text} label={`Kindergarten (working days) or care home within ${n('care_radius_m')} m`} value={`${pts('care_points')} / ${pts('care_points_walk')}`} />
            <Row color={palette.text} label={`Fire and rescue station within ${n('fire_station_radius_m')} m or hospital within ${n('hospital_radius_m')} m, for cars`} value={pts('emergency_points')} />
            <Row color={palette.text} label={`Bus stop within ${n('bus_stop_radius_m')} m or Stadtbahn stop within ${n('rail_stop_radius_m')} m`} value={`${pts('transit_points')} / ${pts('transit_points_walk')}`} />
            <Row color={palette.text} label={`Other serious works within ${n('nearby_works_radius_m')} m on the same day, by car or bike`} value={pts('nearby_works_points')} />
          </Section>

          <Section color={palette.text} title="What the number means">
            <Row color={palette.text} label="No effect" value="0" />
            <Row color={palette.text} label="Low" value="1–3" />
            <Row color={palette.text} label="Medium" value="4–6" />
            <Row color={palette.text} label="High" value="7–8" />
            <Row color={palette.text} label="Severe" value="9–10" />
            <Text style={muted}>
              Works marked &quot;tagsüber&quot; count only {n('daytime_from_h')}:00–{n('daytime_to_h')}:00. A route&apos;s sites are scored for its
              mode at its next leaving time.
            </Text>
          </Section>

          <Section color={palette.text} title="On your route">
            <Text style={text}>
              A site counts in full when your route runs more than {n('uses_street_m')} m through it. If the route only crosses it,{' '}
              {Math.round(w('crossing_weight') * 100)} % of a site that slows you counts, and none of one that blocks the side
              street you cross. Sites the route only passes don&apos;t count.
            </Text>
          </Section>

          <Section color={palette.text} title="Where the data comes from">
            <Text style={text}>Construction sites: Stadt Dortmund open data, checked every hour.</Text>
            <Text style={text}>
              Schools, kindergartens, care homes, hospitals, fire stations, Stadtbahn stops and road classes: Stadt Dortmund open data
              (Datenlizenz Deutschland – Zero), every month.
            </Text>
            <Text style={text}>Crossings and bus stops: © OpenStreetMap contributors (ODbL), every month.</Text>
            <Text style={text}>School and public holidays in NRW: OpenHolidays API.</Text>
          </Section>

          <Section color={palette.text} title="What it can't know">
            <Text style={text}>
              The weights are our judgement, not measurements, and we tune them as we learn. We don&apos;t know where crossing guards
              stand or where school entrances are, so distances are to a school&apos;s address. A site&apos;s title can be vague or
              wrong. Live traffic isn&apos;t part of the score.
            </Text>
          </Section>

          <Text style={muted}>
            {weights.error ? 'Couldn\'t load the current values, so these are the starting values.'
              : weights.loading ? 'Loading the current values…'
                : 'These are the values the server uses right now.'}
          </Text>
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
