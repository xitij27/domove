import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { scheduleDecision } from './core';
import { DEFAULT_SETTINGS, PREFERENCES, WEEKDAYS, type NotificationPreference, type NotificationRoute, type RouteNotificationSettings, isSettings } from './model';
import { constructionNotifications, sendDevelopmentTestAlert } from './runtime';

export default function NotificationSettings({ route, onBack }: { route: NotificationRoute; onBack: () => void }) {
  const [selected, setSelected] = useState<RouteNotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    constructionNotifications.getSettings(route.id)
      .then((value) => { if (active) setSelected(value); })
      .catch((cause) => { if (active) setError(String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [route.id]);

  async function save() {
    if (saving || loading) return;
    if (!isSettings(selected)) {
      setError('Enter times as HH:mm, for example 18:00.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const warning = await constructionNotifications.setSettings(route, selected);
      setMessage(warning ?? 'Notification preference saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the preference.');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setError(null);
    setMessage(null);
    try {
      await sendDevelopmentTestAlert(route);
      setMessage('A labeled test alert will appear shortly. Tap it to open Google Maps.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the test alert.');
    }
  }

  const hypotheticalStart = new Date();
  hypotheticalStart.setDate(hypotheticalStart.getDate() + 14);
  const sampleDate = `${hypotheticalStart.getFullYear()}-${String(hypotheticalStart.getMonth() + 1).padStart(2, '0')}-${String(hypotheticalStart.getDate()).padStart(2, '0')}`;
  const preview = isSettings(selected)
    ? scheduleDecision({ routeId: route.id, obstacleId: 'preview', constructionLocation: 'Preview', constructionStartDate: sampleDate }, selected)
    : { date: null };

  function toggleDay(day: typeof WEEKDAYS[number]) {
    const days = selected.commuteDays ?? [];
    const next = days.includes(day) ? days.filter((value) => value !== day) : WEEKDAYS.filter((value) => days.includes(value) || value === day);
    setSelected({ ...selected, commuteDays: next.length ? [...next] : undefined });
  }

  return (
    <View style={styles.section}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>← All routes</Text></Pressable>
      <Text accessibilityRole="header" style={styles.title}>Notification Preferences</Text>
      <Text style={styles.hint}>Choose when to hear about construction affecting this route.</Text>
      <Text style={styles.hint}>Known construction alerts are scheduled on this device. Automatic alerts for new sites need the account and push service.</Text>
      <Text style={styles.route}>{route.start.label} → {route.destination.label}</Text>
      <Text style={styles.label}>When should we notify you?</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Loading notification preference" /> :
        (Object.entries(PREFERENCES) as [NotificationPreference, string][]).map(([value, label]) => (
          <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: selected.preference === value }} accessibilityLabel={label}
            onPress={() => { setSelected({ ...selected, preference: value }); setMessage(null); }} style={[styles.option, selected.preference === value && styles.selected]}>
            <View style={[styles.circle, selected.preference === value && styles.circleSelected]} />
            <Text style={styles.optionText}>{label}</Text>
          </Pressable>
        ))}
      <Text style={styles.label}>Preferred notification time</Text>
      <TextInput accessibilityLabel="Preferred notification time" value={selected.notificationTime} onChangeText={(notificationTime) => setSelected({ ...selected, notificationTime })}
        keyboardType="numbers-and-punctuation" placeholder="09:00" maxLength={5} style={styles.input} />
      <Text style={styles.hint}>Device-local time, HH:mm. Default: 09:00.</Text>
      <Text style={styles.label}>Regular commuting days (optional)</Text>
      <View style={styles.days}>{WEEKDAYS.map((day) => <Pressable key={day} accessibilityRole="checkbox"
        accessibilityState={{ checked: !!selected.commuteDays?.includes(day) }} onPress={() => toggleDay(day)}
        style={[styles.day, selected.commuteDays?.includes(day) && styles.selected]}><Text style={styles.dayText}>{day.slice(0, 3).toUpperCase()}</Text></Pressable>)}</View>
      <Text style={styles.hint}>Only reliable construction-day information can filter these days. Leave blank for all days.</Text>
      <Text style={styles.label}>Typical departure time (optional)</Text>
      <TextInput accessibilityLabel="Typical departure time" value={selected.departureTime ?? ''}
        onChangeText={(departureTime) => setSelected({ ...selected, departureTime: departureTime || undefined })}
        keyboardType="numbers-and-punctuation" placeholder="07:30" maxLength={5} style={styles.input} />
      <View style={styles.switchRow}><View style={styles.switchText}>
        <Text style={styles.label}>Important Last-Minute Updates</Text>
        <Text style={styles.hint}>Alert me to recent, significant changes when my reminder time has passed.</Text>
      </View><Switch accessibilityLabel="Important Last-Minute Updates" value={selected.importantUpdates}
        onValueChange={(importantUpdates) => setSelected({ ...selected, importantUpdates })} disabled={selected.preference === 'DISABLED'} /></View>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving || loading, busy: saving }} disabled={saving || loading}
        onPress={() => { void save(); }} style={styles.primary}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save Preferences'}</Text></Pressable>
      {message && <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {__DEV__ && <View style={styles.dev}>
        <Text style={styles.devTitle}>Development test</Text>
        <Text style={styles.hint}>Preview only: if construction started {hypotheticalStart.toLocaleDateString()}, this setting would remind you {preview.date?.toLocaleString() ?? 'never'}.</Text>
        <Pressable accessibilityRole="button" onPress={() => { void sendTest(); }} style={styles.secondary}><Text style={styles.backText}>Send Test Construction Alert</Text></Pressable>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 13 },
  back: { paddingVertical: 10, alignSelf: 'flex-start' },
  backText: { color: '#254636', fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '700', color: '#182332' },
  hint: { color: '#526173', lineHeight: 21 },
  route: { fontSize: 18, fontWeight: '600', color: '#163f36', paddingVertical: 8 },
  label: { fontSize: 16, fontWeight: '600', color: '#182332' },
  option: { backgroundColor: '#fff', borderColor: '#dce3e8', borderWidth: 1, borderRadius: 13, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  selected: { borderColor: '#163f36', backgroundColor: '#eef5f1' },
  circle: { width: 20, height: 20, borderWidth: 2, borderColor: '#687782', borderRadius: 10 },
  circleSelected: { borderColor: '#163f36', borderWidth: 6 },
  optionText: { fontSize: 16, color: '#182332' },
  input: { backgroundColor: '#fff', borderColor: '#dce3e8', borderWidth: 1, borderRadius: 13, padding: 14, fontSize: 16, color: '#182332' },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  day: { paddingVertical: 11, paddingHorizontal: 13, backgroundColor: '#fff', borderColor: '#dce3e8', borderWidth: 1, borderRadius: 12 },
  dayText: { color: '#182332', fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, gap: 3 },
  primary: { backgroundColor: '#163f36', borderRadius: 13, padding: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { backgroundColor: '#e9eef2', borderRadius: 13, padding: 14, alignItems: 'center' },
  success: { color: '#246049', lineHeight: 21 },
  error: { color: '#a52621', lineHeight: 21 },
  dev: { borderTopWidth: 1, borderTopColor: '#dce3e8', paddingTop: 18, gap: 10, marginTop: 10 },
  devTitle: { fontWeight: '700', color: '#182332' },
});
