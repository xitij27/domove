import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type LayoutRectangle } from 'react-native';
import { formatDay, parseDay, type RouteDraft } from './model';

export type Leaving = Pick<RouteDraft, 'startDate' | 'startTime'>;
type Mode = 'date' | 'time';
type Props = { value: Leaving; onChange: (value: Leaving) => void; editable: boolean; invalid: boolean };

const pad = (n: number) => String(n).padStart(2, '0');
const toDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** The picked day and time; today and the current time for what is not picked yet. */
function pickerValue({ startDate, startTime }: Leaving) {
  const now = new Date();
  const value = parseDay(startDate) ?? new Date(now);
  const [hours, minutes] = startTime ? startTime.split(':').map(Number) : [now.getHours(), now.getMinutes()];
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/** A pill slider: its thumb sits on "Now", or spans the date and time picked with the system pickers. */
export default function LeavingAtInput({ value, onChange, editable, invalid }: Props) {
  const [isNow, setIsNow] = useState(false);
  // iOS has no picker dialog, so its picker opens below the slider instead
  const [open, setOpen] = useState<Mode | null>(null);
  const [layout, setLayout] = useState<Partial<Record<'now' | Mode, LayoutRectangle>>>({});
  const chosen = !!(value.startDate || value.startTime);
  const custom = chosen && !isNow;

  const target = !chosen ? undefined : isNow ? layout.now
    : layout.date && layout.time && { x: layout.date.x, width: layout.time.x + layout.time.width - layout.date.x };
  const left = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const [x, w] = [target?.x, target?.width];
  useEffect(() => {
    if (x === undefined || w === undefined) return;
    const spring = (node: Animated.Value, toValue: number) => Animated.spring(node, { toValue, useNativeDriver: false, speed: 18, bounciness: 6 });
    Animated.parallel([spring(left, x), spring(width, w)]).start();
  }, [left, width, x, w]);

  const measure = (key: 'now' | Mode) => (event: LayoutChangeEvent) => {
    const rect = event.nativeEvent.layout;
    setLayout((current) => ({ ...current, [key]: rect }));
  };

  function pick(mode: Mode, date: Date, from: Leaving) {
    const next = mode === 'date' ? { ...from, startDate: toDay(date) } : { ...from, startTime: toTime(date) };
    setIsNow(false);
    onChange(next);
    // a day without a time can't be saved, so the time picker follows
    if (mode === 'date' && !from.startTime) show('time', next);
  }

  function show(mode: Mode, from = value) {
    if (Platform.OS !== 'android') return setOpen((current) => (current === mode ? null : mode));
    DateTimePickerAndroid.open({
      mode, value: pickerValue(from), is24Hour: true, minimumDate: mode === 'date' ? startOfToday() : undefined,
      onValueChange: (_, date) => pick(mode, date, from),
    });
  }

  function now() {
    const date = new Date();
    setIsNow(true);
    setOpen(null);
    onChange({ startDate: toDay(date), startTime: toTime(date) });
  }

  function clear() {
    setIsNow(false);
    setOpen(null);
    onChange({ startDate: '', startTime: '' });
  }

  const tone = (placeholder: boolean) => custom ? styles.selected : placeholder ? styles.placeholder : styles.text;
  const dateText = value.startDate ? formatDay(value.startDate) : value.startTime ? 'Today' : 'Date';
  const timeText = value.startTime || 'Time';

  return (
    <View>
      <View style={[styles.track, invalid && styles.invalid, !editable && styles.disabled]}>
        {chosen && <Animated.View pointerEvents="none" style={[styles.thumb, { left, width }]} />}
        <Pressable onLayout={measure('now')} accessibilityRole="button" accessibilityLabel="Leave now" accessibilityState={{ selected: chosen && isNow, disabled: !editable }} disabled={!editable} onPress={now} style={styles.segment}>
          <Text style={[styles.now, chosen && isNow && styles.selected]}>Now</Text>
        </Pressable>
        <Pressable onLayout={measure('date')} accessibilityRole="button" accessibilityLabel="Leaving date" accessibilityValue={{ text: dateText }} accessibilityState={{ expanded: open === 'date', disabled: !editable }} disabled={!editable} onPress={() => show('date')} style={[styles.segment, styles.date]}>
          <MaterialIcons name="event" size={18} style={tone(!chosen)} />
          <Text numberOfLines={1} style={[styles.value, tone(!chosen)]}>{dateText}</Text>
        </Pressable>
        <Pressable onLayout={measure('time')} accessibilityRole="button" accessibilityLabel="Leaving time" accessibilityValue={{ text: timeText }} accessibilityState={{ expanded: open === 'time', disabled: !editable }} disabled={!editable} onPress={() => show('time')} style={styles.segment}>
          <MaterialIcons name="schedule" size={18} style={tone(!value.startTime)} />
          <Text style={[styles.value, tone(!value.startTime)]}>{timeText}</Text>
        </Pressable>
        {chosen && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear leaving time" disabled={!editable} onPress={clear} style={styles.clear}>
            <MaterialIcons name="close" size={20} color="#526173" />
          </Pressable>
        )}
      </View>
      {open && Platform.OS !== 'android' && (
        <DateTimePicker testID="leaving-picker" value={pickerValue(value)} mode={open} display={open === 'date' ? 'inline' : 'spinner'} is24Hour minimumDate={open === 'date' ? startOfToday() : undefined} accentColor="#a8520e" onValueChange={(_, date) => pick(open, date, value)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: 26, borderWidth: 1, borderColor: '#b8c3cf', backgroundColor: '#fff' },
  thumb: { position: 'absolute', top: 3, bottom: 3, borderRadius: 22, backgroundColor: '#a8520e' },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22 },
  date: { flex: 1, minWidth: 0 },
  now: { color: '#a8520e', fontSize: 16, fontWeight: '700' },
  value: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  text: { color: '#182332' },
  placeholder: { color: '#737d8b' },
  selected: { color: '#fff' },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  invalid: { borderColor: '#b42318' },
  disabled: { opacity: 0.5 },
});
