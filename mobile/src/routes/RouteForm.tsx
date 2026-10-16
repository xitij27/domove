import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_LOCATION_LENGTH, MAX_WAYPOINTS, TRANSPORT_MODES, validateRoute, type RouteDraft, type RouteErrors } from './model';

type Props = { onSave: (draft: RouteDraft) => Promise<void>; onCancel: () => void; loading: boolean; onBusyChange: (busy: boolean) => void };

export default function RouteForm({ onSave, onCancel, loading, onBusyChange }: Props) {
  const [start, setStart] = useState('');
  const [destination, setDestination] = useState('');
  const [mode, setMode] = useState<RouteDraft['mode']>('');
  const [stops, setStops] = useState<{ id: number; label: string }[]>([]);
  const nextId = useRef(0);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<RouteErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    if (submitting.current || loading) return;
    const draft = { start, destination, mode, waypoints: stops.map((stop) => stop.label) };
    const validation = validateRoute(draft);
    setErrors(validation);
    setSaveError(null);
    if (Object.keys(validation).length) return;
    submitting.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      await onSave(draft);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this route. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">Create Route</Text>
        <Text style={styles.hint}>Plan your next journey. Add an address or place name for each location.</Text>
        <Text style={styles.label}>Starting location</Text>
        <TextInput accessibilityLabel="Starting location" value={start} onChangeText={setStart} editable={!busy} maxLength={MAX_LOCATION_LENGTH} placeholder="e.g. Dortmund Hauptbahnhof" placeholderTextColor="#737d8b" style={[styles.input, !!errors.start && styles.invalid]} />
        {errors.start && <ErrorText message={errors.start} />}

        <Text style={styles.label}>Intermediate stops (optional)</Text>
        <Text style={styles.hint}>Stops are visited in the order shown. Empty stops are ignored.</Text>
        {stops.map((stop, index) => (
          <View key={stop.id} style={styles.stop}>
            <TextInput accessibilityLabel={`Intermediate stop ${index + 1}`} value={stop.label} editable={!busy} maxLength={MAX_LOCATION_LENGTH} placeholder={`Stop ${index + 1}`} placeholderTextColor="#737d8b" style={[styles.input, styles.stopInput]} onChangeText={(label) => setStops((current) => current.map((item) => item.id === stop.id ? { ...item, label } : item))} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove stop ${index + 1}`} disabled={busy} onPress={() => setStops((current) => current.filter((item) => item.id !== stop.id))} style={styles.remove}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))}
        {errors.waypoints && <ErrorText message={errors.waypoints} />}
        <Pressable accessibilityRole="button" disabled={busy || stops.length >= MAX_WAYPOINTS} accessibilityState={{ disabled: busy || stops.length >= MAX_WAYPOINTS }} style={styles.secondary} onPress={() => setStops((current) => [...current, { id: nextId.current++, label: '' }])}>
          <Text style={styles.secondaryText}>{stops.length >= MAX_WAYPOINTS ? '50 stops maximum' : '+ Add stop'}</Text>
        </Pressable>

        <Text style={styles.label}>Final destination</Text>
        <TextInput accessibilityLabel="Final destination" value={destination} onChangeText={setDestination} editable={!busy} maxLength={MAX_LOCATION_LENGTH} placeholder="e.g. Westfalenpark, Dortmund" placeholderTextColor="#737d8b" style={[styles.input, !!errors.destination && styles.invalid]} />
        {errors.destination && <ErrorText message={errors.destination} />}

        <Text style={styles.label}>Transportation mode</Text>
        <View style={styles.modes} accessibilityRole="radiogroup">
          {(Object.keys(TRANSPORT_MODES) as (keyof typeof TRANSPORT_MODES)[]).map((value) => (
            <Pressable key={value} accessibilityRole="radio" accessibilityLabel={TRANSPORT_MODES[value]} accessibilityState={{ checked: mode === value, disabled: busy }} disabled={busy} onPress={() => setMode(value)} style={[styles.mode, mode === value && styles.modeSelected]}>
              <Text style={[styles.modeText, mode === value && styles.modeSelectedText]}>{TRANSPORT_MODES[value]}</Text>
            </Pressable>
          ))}
        </View>
        {errors.mode && <ErrorText message={errors.mode} />}
        {saveError && <ErrorText message={saveError} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Ready" accessibilityState={{ disabled: busy || loading, busy }} disabled={busy || loading} onPress={save} style={[styles.primary, (busy || loading) && styles.disabled]}>
          <Text style={styles.primaryText}>{busy ? 'Saving…' : loading ? 'Loading routes…' : 'Ready'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.secondary}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ErrorText({ message }: { message: string }) {
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{message}</Text>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 20, gap: 10, width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: '700', color: '#182332' },
  hint: { color: '#526173', lineHeight: 21 },
  label: { fontSize: 15, fontWeight: '600', color: '#182332', marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#b8c3cf', backgroundColor: '#fff', borderRadius: 12, padding: 14, color: '#182332', fontSize: 16, minHeight: 50 },
  invalid: { borderColor: '#b42318' },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopInput: { flex: 1, minWidth: 0 },
  remove: { padding: 10, minHeight: 48, justifyContent: 'center' },
  removeText: { color: '#a52621', fontWeight: '600' },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 24, borderWidth: 1, borderColor: '#b8c3cf', backgroundColor: '#fff' },
  modeSelected: { backgroundColor: '#163f36', borderColor: '#163f36' },
  modeText: { color: '#354455', fontWeight: '600' },
  modeSelectedText: { color: '#fff' },
  primary: { backgroundColor: '#163f36', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 12 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondary: { padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: '#e9eef2' },
  secondaryText: { color: '#254636', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  error: { color: '#a52621', lineHeight: 20 },
});
