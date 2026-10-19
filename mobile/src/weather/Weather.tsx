import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { strings, useStrings } from '../i18n';
import { PALETTES, type MapTheme } from '../theme';
import WeatherSymbol from './WeatherSymbol';
import { CITY, clockTime, dayName, degrees, describe, fetchWeather, outlook, type Day, type Hour, type Weather } from './weather';

// Open-Meteo's current conditions change every quarter hour.
const REFRESH_MS = 15 * 60_000;
const CHECK_MS = 60_000;
const WIDTH = 48; // as wide as the compass above it
/** Rain chances below this go unmentioned in the hours and days. */
const SHOWN_CHANCE = 20;

/** The latest weather, fetched again when it is a quarter of an hour old and the app is in use. */
export function useWeather() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [failed, setFailed] = useState(false);
  const fetchedAt = useRef(0);

  const load = useCallback(() => {
    fetchedAt.current = Date.now();
    // a failed refresh keeps the last weather, whose card says how old it is
    fetchWeather().then((latest) => { setWeather(latest); setFailed(false); }, () => setFailed(true));
  }, []);

  // tapped after a failure: shows it loading again
  const reload = useCallback(() => {
    setFailed(false);
    load();
  }, [load]);

  useEffect(() => {
    load();
    const refresh = () => {
      if (AppState.currentState === 'active' && Date.now() - fetchedAt.current >= REFRESH_MS) load();
    };
    const timer = setInterval(refresh, CHECK_MS);
    const subscription = AppState.addEventListener('change', refresh);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [load]);

  return { weather, failed, reload };
}

/** The sky and temperature under the compass; opens the forecast, or tries again when there is no weather. */
export function WeatherButton({ weather, failed, open, theme, onPress }: {
  weather: Weather | null;
  failed: boolean;
  open: boolean;
  theme: MapTheme;
  onPress: () => void;
}) {
  const palette = PALETTES[theme];
  const t = useStrings().weather;
  const label = weather ? t.button(CITY, describe(weather.code, weather.day), degrees(weather.temperature)) : failed ? t.unavailable : t.loading;
  const hint = weather ? (open ? t.hide : t.show) : failed ? t.retry : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ expanded: open, busy: !weather && !failed }}
      onPress={onPress}
      android_ripple={{ color: palette.border, borderless: true, radius: WIDTH / 2 }}
      style={[styles.button, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      {weather ? (
        <>
          <WeatherSymbol code={weather.code} day={weather.day} theme={theme} size={30} background={palette.surface} />
          <Text style={[styles.buttonTemperature, { color: palette.text }]}>{degrees(weather.temperature)}</Text>
        </>
      ) : failed ? (
        <MaterialIcons name="cloud-off" size={22} color={palette.muted} />
      ) : (
        <ActivityIndicator color={palette.muted} />
      )}
    </Pressable>
  );
}

/** What goes in the forecast card: the weather now, what it does next said in words, then the hours and days ahead. */
export function WeatherForecast({ weather, theme, onClose }: { weather: Weather; theme: MapTheme; onClose: () => void }) {
  const palette = PALETTES[theme];
  const t = useStrings().weather;
  const today = weather.time.slice(0, 10);
  // every day's bar on one scale, so the warm days stand out
  const coldest = Math.min(...weather.days.map((d) => d.low));
  const warmest = Math.max(...weather.days.map((d) => d.high));

  return (
    <View style={styles.forecast}>
      <View style={styles.now}>
        <WeatherSymbol code={weather.code} day={weather.day} theme={theme} size={52} background={palette.surface} />
        <Text style={[styles.temperature, { color: palette.text }]}>{degrees(weather.temperature)}</Text>
        <View style={styles.nowText}>
          <Text style={[styles.title, { color: palette.text }]}>{describe(weather.code, weather.day)}</Text>
          <Text style={{ color: palette.muted }}>{t.feelsLike(CITY, degrees(weather.feelsLike))}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t.close} hitSlop={8} onPress={onClose} style={styles.close}>
          <MaterialIcons name="close" size={22} color={palette.muted} />
        </Pressable>
      </View>

      <Text style={[styles.outlook, { color: palette.text }]}>{outlook(weather)}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours}>
        {weather.hours.map((hour) => <HourCell key={hour.time} hour={hour} theme={theme} />)}
      </ScrollView>

      <View style={[styles.days, { borderTopColor: palette.border }]}>
        {weather.days.map((day) => (
          <DayRow key={day.date} day={day} name={dayName(day.date, today)} theme={theme} coldest={coldest} warmest={warmest} />
        ))}
      </View>

      <Text style={[styles.credit, { color: palette.muted }]}>
        {t.updated(clockTime(weather.time))}
        <Text accessibilityRole="link" onPress={() => { Linking.openURL('https://open-meteo.com/'); }} style={styles.link}>Open-Meteo.com</Text>
      </Text>
    </View>
  );
}

const chance = (rainChance: number | null) => (rainChance !== null && rainChance >= SHOWN_CHANCE ? `${rainChance}%` : '');
const spoken = (rainChance: number | null) => (rainChance !== null && chance(rainChance) ? strings().weather.rainChance(rainChance) : '');

function HourCell({ hour, theme }: { hour: Hour; theme: MapTheme }) {
  const palette = PALETTES[theme];
  const time = clockTime(hour.time);
  return (
    <View accessible accessibilityLabel={`${time}: ${describe(hour.code, hour.day)}, ${degrees(hour.temperature)}${spoken(hour.rainChance)}`} style={styles.hour}>
      <Text style={[styles.small, { color: palette.muted }]}>{time}</Text>
      <WeatherSymbol code={hour.code} day={hour.day} theme={theme} size={26} background={palette.surface} still />
      <Text style={[styles.hourTemperature, { color: palette.text }]}>{degrees(hour.temperature)}</Text>
      <Text style={[styles.small, { color: palette.weather.drop }]}>{chance(hour.rainChance)}</Text>
    </View>
  );
}

function DayRow({ day, name, theme, coldest, warmest }: { day: Day; name: string; theme: MapTheme; coldest: number; warmest: number }) {
  const palette = PALETTES[theme];
  const t = useStrings().weather;
  return (
    <View
      accessible
      accessibilityLabel={`${name}: ${describe(day.code, true)}, ${t.range(degrees(day.low), degrees(day.high))}${spoken(day.rainChance)}`}
      style={styles.day}
    >
      <Text style={[styles.dayName, { color: palette.text }]}>{name}</Text>
      <WeatherSymbol code={day.code} day theme={theme} size={24} background={palette.surface} still />
      <Text style={[styles.dayChance, { color: palette.weather.drop }]}>{chance(day.rainChance)}</Text>
      <Text style={[styles.low, { color: palette.muted }]}>{degrees(day.low)}</Text>
      <View style={[styles.track, { backgroundColor: palette.border }]}>
        <View style={{ flex: day.low - coldest }} />
        <View style={[styles.range, { flex: day.high - day.low, backgroundColor: palette.weather.sun }]} />
        <View style={{ flex: warmest - day.high }} />
      </View>
      <Text style={[styles.high, { color: palette.text }]}>{degrees(day.high)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // a capsule like the day/night switch, under the compass
  button: { alignSelf: 'flex-end', width: WIDTH, height: 68, borderRadius: WIDTH / 2, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 1, elevation: 2, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  buttonTemperature: { fontSize: 13, fontWeight: '600' },
  forecast: { gap: 10 },
  now: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  temperature: { fontSize: 36, fontWeight: '300' },
  nowText: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  close: { padding: 4, alignSelf: 'flex-start' },
  outlook: { fontSize: 15, lineHeight: 21 },
  hours: { gap: 4 },
  hour: { width: 48, alignItems: 'center', gap: 3 },
  hourTemperature: { fontSize: 14, fontWeight: '600' },
  small: { fontSize: 12 },
  days: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  day: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 32 },
  dayName: { width: 84 },
  dayChance: { width: 34, fontSize: 12 },
  low: { width: 30, textAlign: 'right' },
  // the day's low to high, on a track from the coldest to the warmest of the days
  track: { flex: 1, flexDirection: 'row', height: 4, borderRadius: 2 },
  range: { borderRadius: 2, minWidth: 4 },
  high: { width: 30 },
  credit: { fontSize: 11 },
  link: { textDecorationLine: 'underline' },
});
