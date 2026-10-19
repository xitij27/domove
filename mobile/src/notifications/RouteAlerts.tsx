import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { shortDate, strings, useStrings } from '../i18n';
import { Reveal, useTween } from '../motion';
import { PALETTES, type MapTheme } from '../theme';
import type { NotificationPreference, RouteNotificationSettings } from './model';
import { constructionNotifications, sendDevelopmentTestAlert } from './runtime';
import type { SiteReminder } from './service';

// Between the rows of the open choices.
const BODY_GAP = 10;

const CHOICES: NotificationPreference[] = ['ONE_WEEK_BEFORE', 'ONE_DAY_BEFORE', 'DISABLED'];

export type RouteAlertsState = {
  /** null until the phone's stored choice has loaded. */
  settings: RouteNotificationSettings | null;
  reminders: SiteReminder[];
  saving: boolean;
  message: string | null;
  error: string | null;
  save: (settings: RouteNotificationSettings) => void;
  sendTest: () => void;
};

type Status = { routeId: string; saving: boolean; message: string | null; error: string | null };

/** A route's alert choice and the reminders it scheduled, as kept on this phone. */
export function useRouteAlerts(routeId: string | null): RouteAlertsState | null {
  // Each result names its route, so a late answer for the previous one never shows.
  const [loaded, setLoaded] = useState<{ routeId: string; settings: RouteNotificationSettings; reminders: SiteReminder[] } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!routeId) return;
    let active = true;
    Promise.all([constructionNotifications.getSettings(routeId), constructionNotifications.remindersOn(routeId)]).then(
      ([settings, reminders]) => { if (active) setLoaded({ routeId, settings, reminders }); },
      (e: unknown) => { if (active) setStatus({ routeId, saving: false, message: null, error: describe(e, strings().alerts.loadFailed) }); },
    );
    return () => { active = false; };
  }, [routeId, version]);

  const save = useCallback((settings: RouteNotificationSettings) => {
    if (!routeId) return;
    // Shown at once; the reload after saving puts back what was really stored.
    setLoaded((current) => (current?.routeId === routeId ? { ...current, settings } : current));
    setStatus({ routeId, saving: true, message: null, error: null });
    constructionNotifications.setSettings(routeId, settings).then(
      (warning) => setStatus({ routeId, saving: false, message: warning, error: null }),
      (e: unknown) => setStatus({ routeId, saving: false, message: null, error: describe(e, strings().alerts.saveFailed) }),
    ).finally(() => setVersion((count) => count + 1));
  }, [routeId]);

  const sendTest = useCallback(() => {
    if (!routeId) return;
    sendDevelopmentTestAlert(routeId).then(
      () => setStatus({ routeId, saving: false, message: strings().alerts.testSent, error: null }),
      (e: unknown) => setStatus({ routeId, saving: false, message: null, error: describe(e, strings().alerts.testFailed) }),
    );
  }, [routeId]);

  if (!routeId) return null;
  const mine = loaded?.routeId === routeId ? loaded : null;
  const shown = status?.routeId === routeId ? status : null;
  return {
    settings: mine?.settings ?? null,
    reminders: mine?.reminders ?? [],
    saving: shown?.saving ?? false,
    message: shown?.message ?? null,
    error: shown?.error ?? null,
    save,
    sendTest,
  };
}

/** What a site's card on the route says about its alert; null while that is unknown. */
export function siteAlert(alerts: RouteAlertsState, siteId: string): string | null {
  const t = strings().alerts;
  if (!alerts.settings) return null;
  const reminder = alerts.reminders.find((r) => r.siteId === siteId);
  if (reminder) return reminder.sent ? t.alerted(when(reminder.at)) : t.alert(when(reminder.at));
  return alerts.settings.preference === 'DISABLED' ? t.offForRoute : t.noneScheduled;
}

/** The alerts row of the route card on the map; it opens to change when they come. */
export default function RouteAlerts({ alerts, theme }: { alerts: RouteAlertsState; theme: MapTheme }) {
  const palette = PALETTES[theme];
  const t = useStrings().alerts;
  const [open, setOpen] = useState(false);
  // iOS has no clock dialog, so its clock opens in the card instead
  const [clockOpen, setClockOpen] = useState(false);
  // The chevron turns over as the choices open, rather than flipping.
  const turn = useTween(open ? 1 : 0);
  const chevron = useMemo(() => [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }], [turn]);
  const { settings, saving } = alerts;
  const on = !!settings && settings.preference !== 'DISABLED';
  const next = alerts.reminders.filter((r) => !r.sent).sort((a, b) => a.at - b.at)[0];
  const summary = !settings ? t.loading : on ? t.summary(t.choices[settings.preference], settings.notificationTime) : t.off;

  function pickTime() {
    if (!settings) return;
    if (Platform.OS !== 'android') return setClockOpen(!clockOpen);
    DateTimePickerAndroid.open({
      mode: 'time', value: clockValue(settings.notificationTime), is24Hour: true,
      onValueChange: (_, date) => alerts.save({ ...settings, notificationTime: toTime(date) }),
    });
  }

  return (
    <View style={[styles.alerts, { borderTopColor: palette.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={next ? t.summaryNext(summary, when(next.at)) : summary}
        accessibilityHint={t.hint}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.head}
      >
        <MaterialIcons name={on ? 'notifications-active' : 'notifications-off'} size={20} color={on ? palette.accent : palette.muted} />
        <View style={styles.headText}>
          <Text style={{ color: palette.text }}>{summary}</Text>
          {next && <Text style={{ color: palette.muted }}>{t.next(when(next.at))}</Text>}
        </View>
        {saving ? (
          <ActivityIndicator size="small" color={palette.muted} />
        ) : (
          <Animated.View style={{ transform: chevron }}>
            <MaterialIcons name="expand-more" size={22} color={palette.muted} />
          </Animated.View>
        )}
      </Pressable>

      {/* Each part below opens and closes smoothly, bringing the space above it. */}
      <Reveal space={8} clip>
        {open && settings && (
          <View>
            <View accessibilityRole="radiogroup" accessibilityLabel={t.whenLabel} style={styles.choices}>
              {CHOICES.map((preference) => {
                const chosen = settings.preference === preference;
                return (
                  <Pressable
                    key={preference}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: chosen, disabled: saving }}
                    disabled={saving}
                    onPress={() => alerts.save({ ...settings, preference })}
                    style={[styles.choice, { borderColor: palette.border }, chosen && { backgroundColor: palette.thumb }]}
                  >
                    <Text style={{ color: chosen ? palette.text : palette.muted, fontWeight: chosen ? '600' : '400' }}>{t.choices[preference]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Reveal space={BODY_GAP} clip>
              {on && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.time}
                  accessibilityValue={{ text: settings.notificationTime }}
                  accessibilityState={{ expanded: Platform.OS === 'android' ? undefined : clockOpen, disabled: saving }}
                  disabled={saving}
                  onPress={pickTime}
                  style={styles.timeRow}
                >
                  <Text style={{ color: palette.muted }}>{t.at}</Text>
                  <Text style={[styles.time, { color: palette.text }]}>{settings.notificationTime}</Text>
                </Pressable>
              )}
            </Reveal>
            <Reveal space={BODY_GAP} clip>
              {on && clockOpen && Platform.OS !== 'android' && (
                <DateTimePicker
                  value={clockValue(settings.notificationTime)}
                  mode="time"
                  display="spinner"
                  is24Hour
                  themeVariant={theme === 'night' ? 'dark' : 'light'}
                  onValueChange={(_, date) => alerts.save({ ...settings, notificationTime: toTime(date) })}
                />
              )}
            </Reveal>
            <Text style={[styles.spaced, { color: palette.muted }]}>{t.explain}</Text>
            {__DEV__ && (
              <Pressable accessibilityRole="button" onPress={alerts.sendTest} style={[styles.choice, styles.spaced, styles.test, { borderColor: palette.border }]}>
                <Text style={{ color: palette.text }}>{t.sendTest}</Text>
              </Pressable>
            )}
          </View>
        )}
      </Reveal>
      <Reveal space={8} clip>{alerts.message && <Text accessibilityLiveRegion="polite" style={{ color: palette.muted }}>{alerts.message}</Text>}</Reveal>
      <Reveal space={8} clip>{alerts.error && <Text accessibilityRole="alert" style={{ color: palette.status.current }}>{alerts.error}</Text>}</Reveal>
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const toTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

function clockValue(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const value = new Date();
  value.setHours(hours, minutes, 0, 0);
  return value;
}

/** "Thu 23 Oct, 09:00" in the app's language. */
function when(at: number) {
  const date = new Date(at);
  return `${shortDate(date)}, ${toTime(date)}`;
}

function describe(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const styles = StyleSheet.create({
  alerts: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  headText: { flex: 1 },
  spaced: { marginTop: BODY_GAP },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, alignSelf: 'flex-start', minHeight: 44, paddingVertical: 4 },
  time: { fontSize: 28, fontWeight: '600', fontVariant: ['tabular-nums'] },
  test: { alignSelf: 'flex-start' },
});
