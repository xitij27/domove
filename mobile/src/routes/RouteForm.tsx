import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAX_WAYPOINTS, TRANSPORT_MODES, validateRoute, type Place, type PlaceDraft, type PlacePick, type RouteDraft, type RouteErrors, type RouteLocation, type SavedRoute } from './model';
import LeavingAtInput, { type Leaving } from './LeavingAtInput';
import PlaceInput from './PlaceInput';
import { useStrings } from '../i18n';
import { Appear, Reveal } from '../motion';

const EMPTY: PlaceDraft = { label: '', coordinate: null };
// Between the form's rows.
const GAP = 10;

type Props = {
  /** A saved route to change; the form starts empty without one. */
  route?: SavedRoute;
  onSave: (draft: RouteDraft) => Promise<void>;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
  /** Hands a place to the map to choose; without it the places can only be typed. */
  onPickOnMap?: (pick: PlacePick) => void;
};

export default function RouteForm({ route, onSave, onCancel, onBusyChange, onPickOnMap }: Props) {
  const t = useStrings();
  const pickOnMap = onPickOnMap && ((title: string, kind: PlacePick['kind'], place: PlaceDraft, onPick: (place: Place) => void) =>
    () => onPickOnMap({ title, kind, initial: place.coordinate, onPick }));
  const [start, setStart] = useState(route ? placeDraft(route.start) : EMPTY);
  const [destination, setDestination] = useState(route ? placeDraft(route.destination) : EMPTY);
  const [mode, setMode] = useState<RouteDraft['mode']>(route?.mode ?? '');
  const [stops, setStops] = useState<{ id: number; place: PlaceDraft }[]>(() => route?.waypoints.map((stop, index) => ({ id: index, place: placeDraft(stop) })) ?? []);
  const [leaving, setLeaving] = useState<Leaving>({ startTime: route?.startTime ?? '', weekdays: route?.weekdays ?? [] });
  const savedStops = route?.waypoints.length ?? 0;
  const nextId = useRef(savedStops);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<RouteErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    if (submitting.current) return;
    const draft = { start, destination, mode, waypoints: stops.map((stop) => stop.place), ...leaving };
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
      setSaveError(error instanceof Error ? error.message : t.form.saveFailed);
    } finally {
      submitting.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">{route ? t.form.editTitle : t.form.createTitle}</Text>
        <Text style={styles.hint}>{t.form.hint(!!route, !!pickOnMap)}</Text>
        <Text style={styles.label}>{t.routes.start}</Text>
        <PlaceInput accessibilityLabel={t.routes.start} value={start} onChange={setStart} editable={!busy} placeholder={t.form.startExample} inputStyle={[styles.input, !!errors.start && styles.invalid]} onPickOnMap={pickOnMap?.(t.routes.start, 'start', start, setStart)} />
        {errors.start && <ErrorText message={errors.start} />}

        <Text style={styles.label}>{t.form.stopsLabel}</Text>
        <Text style={styles.hint}>{t.form.stopsHint}</Text>
        {stops.map((stop, index) => {
          const setStop = (place: PlaceDraft) => setStops((current) => current.map((item) => item.id === stop.id ? { ...item, place } : item));
          const row = (
            <View style={styles.stop}>
              <PlaceInput accessibilityLabel={t.form.stopNumber(index + 1)} value={stop.place} editable={!busy} placeholder={t.form.stopShort(index + 1)} style={styles.stopInput} inputStyle={styles.input} onChange={setStop} onPickOnMap={pickOnMap?.(t.form.stopShort(index + 1), 'stop', stop.place, setStop)} />
              <Pressable accessibilityRole="button" accessibilityLabel={t.form.removeStop(index + 1)} disabled={busy} onPress={() => setStops((current) => current.filter((item) => item.id !== stop.id))} style={styles.remove}>
                <Text style={styles.removeText}>{t.form.remove}</Text>
              </Pressable>
            </View>
          );
          // A stop added here grows in, taking up the gap before it as it does; the saved ones are simply there.
          return stop.id < savedStops ? <View key={stop.id}>{row}</View> : <Reveal key={stop.id} space={GAP} clip style={styles.added}>{row}</Reveal>;
        })}
        {errors.waypoints && <ErrorText message={errors.waypoints} />}
        <Pressable accessibilityRole="button" disabled={busy || stops.length >= MAX_WAYPOINTS} accessibilityState={{ disabled: busy || stops.length >= MAX_WAYPOINTS }} style={styles.secondary} onPress={() => setStops((current) => [...current, { id: nextId.current++, place: EMPTY }])}>
          <Text style={styles.secondaryText}>{stops.length >= MAX_WAYPOINTS ? t.form.maxStops(MAX_WAYPOINTS) : t.form.addStop}</Text>
        </Pressable>

        <Text style={styles.label}>{t.routes.destination}</Text>
        <PlaceInput accessibilityLabel={t.routes.destination} value={destination} onChange={setDestination} editable={!busy} placeholder={t.form.destinationExample} inputStyle={[styles.input, !!errors.destination && styles.invalid]} onPickOnMap={pickOnMap?.(t.routes.destination, 'destination', destination, setDestination)} />
        {errors.destination && <ErrorText message={errors.destination} />}

        <Text style={styles.label}>{t.form.mode}</Text>
        <View style={styles.modes} accessibilityRole="radiogroup">
          {TRANSPORT_MODES.map((value) => (
            <Pressable key={value} accessibilityRole="radio" accessibilityLabel={t.modes[value]} accessibilityState={{ checked: mode === value, disabled: busy }} disabled={busy} onPress={() => setMode(value)} style={[styles.mode, mode === value && styles.modeSelected]}>
              <Text style={[styles.modeText, mode === value && styles.modeSelectedText]}>{t.modes[value]}</Text>
            </Pressable>
          ))}
        </View>
        {errors.mode && <ErrorText message={errors.mode} />}

        <Text style={styles.label}>{t.form.leavingLabel}</Text>
        <Text style={styles.hint}>{t.form.leavingHint}</Text>
        <LeavingAtInput value={leaving} onChange={setLeaving} editable={!busy} invalid={!!errors.startTime} />
        {errors.startTime && <ErrorText message={errors.startTime} />}
        {saveError && <ErrorText message={saveError} />}
        <Pressable accessibilityRole="button" accessibilityLabel={route ? t.form.saveChanges : t.form.ready} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={save} style={[styles.primary, busy && styles.disabled]}>
          <Text style={styles.primaryText}>{busy ? t.form.saving : route ? t.form.saveChanges : t.form.ready}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.secondary}>
          <Text style={styles.secondaryText}>{t.common.cancel}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A saved place counts as picked from the suggestions; one without a label has to be typed again. */
function placeDraft({ label, coordinate }: RouteLocation): PlaceDraft {
  return { label: label ?? '', coordinate };
}

function ErrorText({ message }: { message: string }) {
  return (
    <Appear from={{ y: -4 }}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{message}</Text>
    </Appear>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 20, gap: GAP, width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: '700', color: '#182332' },
  hint: { color: '#526173', lineHeight: 21 },
  label: { fontSize: 15, fontWeight: '600', color: '#182332', marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#b8c3cf', backgroundColor: '#fff', borderRadius: 12, padding: 14, color: '#182332', fontSize: 16, minHeight: 50 },
  invalid: { borderColor: '#b42318' },
  stop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  added: { marginTop: -GAP },
  stopInput: { flex: 1, minWidth: 0 },
  remove: { padding: 10, minHeight: 48, justifyContent: 'center' },
  removeText: { color: '#a52621', fontWeight: '600' },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 24, borderWidth: 1, borderColor: '#b8c3cf', backgroundColor: '#fff' },
  modeSelected: { backgroundColor: '#a8520e', borderColor: '#a8520e' },
  modeText: { color: '#354455', fontWeight: '600' },
  modeSelectedText: { color: '#fff' },
  primary: { backgroundColor: '#a8520e', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 12 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondary: { padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: '#e9eef2' },
  secondaryText: { color: '#7c3d0e', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  error: { color: '#a52621', lineHeight: 20 },
});
