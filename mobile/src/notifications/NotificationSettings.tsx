import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SavedRoute } from '../routes/model';
import { DEFAULT_SETTINGS, PREFERENCES, type NotificationPreference, type RouteNotificationSettings, isSettings } from './model';
import { constructionNotifications, sendDevelopmentTestAlert } from './runtime';

export default function NotificationSettings({ route, onBack }: { route: SavedRoute; onBack: () => void }) {
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
      setError('Enter the time as HH:mm, for example 18:00.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const warning = await constructionNotifications.setSettings(route.id, selected);
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
      await sendDevelopmentTestAlert(route.id);
      setMessage('A labeled test alert will appear shortly. Tap it to see the site on the map.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the test alert.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.section}>
      <Pressable accessibilityRole="button" disabled={saving} onPress={onBack} style={styles.back}><Text style={styles.backText}>← All routes</Text></Pressable>
      <Text accessibilityRole="header" style={styles.title}>Notification Preferences</Text>
      <Text style={styles.route}>{route.start.label ?? 'Starting location'} → {route.destination.label ?? 'Final destination'}</Text>
      <Text style={styles.hint}>We check your routes for construction each time you open the app, and remind you on this phone.</Text>
      <Text style={styles.label}>When should we notify you?</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Loading notification preference" color="#163f36" /> :
        (Object.entries(PREFERENCES) as [NotificationPreference, string][]).map(([value, label]) => (
          <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: selected.preference === value }} accessibilityLabel={label}
            onPress={() => { setSelected({ ...selected, preference: value }); setMessage(null); }} style={[styles.option, selected.preference === value && styles.selected]}>
            <View style={[styles.circle, selected.preference === value && styles.circleSelected]} />
            <Text style={styles.optionText}>{label}</Text>
          </Pressable>
        ))}
      <Text style={styles.label}>Notification time</Text>
      <TextInput accessibilityLabel="Notification time" value={selected.notificationTime} onChangeText={(notificationTime) => setSelected({ ...selected, notificationTime })}
        keyboardType="numbers-and-punctuation" placeholder="09:00" maxLength={5} style={styles.input} />
      <Text style={styles.hint}>HH:mm on this phone. If construction starts sooner than you chose, or has already started, we remind you the next time the clock reaches it.</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving || loading, busy: saving }} disabled={saving || loading}
        onPress={() => { void save(); }} style={styles.primary}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save Preferences'}</Text></Pressable>
      {message && <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {__DEV__ && <View style={styles.dev}>
        <Text style={styles.devTitle}>Development test</Text>
        <Pressable accessibilityRole="button" onPress={() => { void sendTest(); }} style={styles.secondary}><Text style={styles.backText}>Send Test Construction Alert</Text></Pressable>
      </View>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { padding: 20, gap: 13, width: '100%', maxWidth: 640, alignSelf: 'center' },
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
  primary: { backgroundColor: '#163f36', borderRadius: 13, padding: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { backgroundColor: '#e9eef2', borderRadius: 13, padding: 14, alignItems: 'center' },
  success: { color: '#246049', lineHeight: 21 },
  error: { color: '#a52621', lineHeight: 21 },
  dev: { borderTopWidth: 1, borderTopColor: '#dce3e8', paddingTop: 18, gap: 10, marginTop: 10 },
  devTitle: { fontWeight: '700', color: '#182332' },
});
