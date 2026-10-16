import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTES, type MapTheme } from '../theme';
import type { NotificationPreference, RouteNotificationSettings } from './model';
import { constructionNotifications, sendDevelopmentTestAlert } from './runtime';
import type { SiteReminder } from './service';

const CHOICES: Record<NotificationPreference, string> = {
  ONE_WEEK_BEFORE: '1 week before',
  ONE_DAY_BEFORE: '1 day before',
  DISABLED: 'Off',
};

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
      (e: unknown) => { if (active) setStatus({ routeId, saving: false, message: null, error: describe(e, 'Could not load the alerts.') }); },
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
      (e: unknown) => setStatus({ routeId, saving: false, message: null, error: describe(e, 'Could not save the alerts.') }),
    ).finally(() => setVersion((count) => count + 1));
  }, [routeId]);

  const sendTest = useCallback(() => {
    if (!routeId) return;
    sendDevelopmentTestAlert(routeId).then(
      () => setStatus({ routeId, saving: false, message: 'A test alert will appear shortly. Tap it to see the site on the map.', error: null }),
      (e: unknown) => setStatus({ routeId, saving: false, message: null, error: describe(e, 'Could not send the test alert.') }),
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
  if (!alerts.settings) return null;
  const reminder = alerts.reminders.find((r) => r.siteId === siteId);
  if (reminder) return `${reminder.sent ? 'Alerted' : 'Alert'} ${when(reminder.at)}`;
  return alerts.settings.preference === 'DISABLED' ? 'Alerts are off for this route' : 'No alert scheduled';
}

/** The alerts row of the route card on the map; it opens to change when they come. */
export default function RouteAlerts({ alerts, theme }: { alerts: RouteAlertsState; theme: MapTheme }) {
  const palette = PALETTES[theme];
  const [open, setOpen] = useState(false);
  // iOS has no clock dialog, so its clock opens in the card instead
  const [clockOpen, setClockOpen] = useState(false);
  const { settings, saving } = alerts;
  const on = !!settings && settings.preference !== 'DISABLED';
  const next = alerts.reminders.filter((r) => !r.sent).sort((a, b) => a.at - b.at)[0];
  const summary = !settings
    ? 'Loading alerts…'
    : on
      ? `Alerts ${CHOICES[settings.preference]} at ${settings.notificationTime}`
      : 'Alerts off';

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
        accessibilityLabel={next ? `${summary}. Next alert ${when(next.at)}` : summary}
        accessibilityHint="Changes when the alerts for this route come"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.head}
      >
        <MaterialIcons name={on ? 'notifications-active' : 'notifications-off'} size={20} color={on ? palette.accent : palette.muted} />
        <View style={styles.headText}>
          <Text style={{ color: palette.text }}>{summary}</Text>
          {next && <Text style={{ color: palette.muted }}>Next {when(next.at)}</Text>}
        </View>
        {saving ? <ActivityIndicator size="small" color={palette.muted} /> : <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={22} color={palette.muted} />}
      </Pressable>

      {open && settings && (
        <View style={styles.body}>
          <View accessibilityRole="radiogroup" accessibilityLabel="When to alert" style={styles.choices}>
            {(Object.keys(CHOICES) as NotificationPreference[]).map((preference) => {
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
                  <Text style={{ color: chosen ? palette.text : palette.muted, fontWeight: chosen ? '600' : '400' }}>{CHOICES[preference]}</Text>
                </Pressable>
              );
            })}
          </View>
          {on && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Alert time"
              accessibilityValue={{ text: settings.notificationTime }}
              accessibilityState={{ expanded: Platform.OS === 'android' ? undefined : clockOpen, disabled: saving }}
              disabled={saving}
              onPress={pickTime}
              style={styles.timeRow}
            >
              <Text style={{ color: palette.muted }}>At</Text>
              <Text style={[styles.time, { color: palette.text }]}>{settings.notificationTime}</Text>
            </Pressable>
          )}
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
          <Text style={{ color: palette.muted }}>The phone reminds you about each construction site on this route at that time.</Text>
          {__DEV__ && (
            <Pressable accessibilityRole="button" onPress={alerts.sendTest} style={[styles.choice, styles.test, { borderColor: palette.border }]}>
              <Text style={{ color: palette.text }}>Send test alert</Text>
            </Pressable>
          )}
        </View>
      )}
      {alerts.message && <Text accessibilityLiveRegion="polite" style={{ color: palette.muted }}>{alerts.message}</Text>}
      {alerts.error && <Text accessibilityRole="alert" style={{ color: palette.status.current }}>{alerts.error}</Text>}
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

/** "Thu 23 Oct, 09:00" in the phone's language. */
function when(at: number) {
  const date = new Date(at);
  return `${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${toTime(date)}`;
}

function describe(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const styles = StyleSheet.create({
  alerts: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 6, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  headText: { flex: 1 },
  body: { gap: 10 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, alignSelf: 'flex-start', minHeight: 44, paddingVertical: 4 },
  time: { fontSize: 28, fontWeight: '600', fontVariant: ['tabular-nums'] },
  test: { alignSelf: 'flex-start' },
});
