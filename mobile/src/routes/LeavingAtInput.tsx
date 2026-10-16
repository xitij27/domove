import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { repeatSummary, WEEKDAYS, type RouteDraft, type Weekday } from './model';

export type Leaving = Pick<RouteDraft, 'startTime' | 'weekdays'>;
type Props = { value: Leaving; onChange: (value: Leaving) => void; editable: boolean; invalid: boolean };

const pad = (n: number) => String(n).padStart(2, '0');
const toTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** The picked time, or the current time while none is picked. */
function pickerValue(time: string) {
  const value = new Date();
  if (time) {
    const [hours, minutes] = time.split(':').map(Number);
    value.setHours(hours, minutes, 0, 0);
  }
  return value;
}

/** Set like an alarm: a time from the system clock, and optionally the days it repeats on. */
export default function LeavingAtInput({ value, onChange, editable, invalid }: Props) {
  // iOS has no clock dialog, so its clock opens below the days instead
  const [open, setOpen] = useState(false);
  const chosen = !!value.startTime || value.weekdays.length > 0;

  function showClock(from: Leaving) {
    if (Platform.OS !== 'android') {
      // the inline clock has no OK button, so the time it opens on counts as picked
      if (!from.startTime) onChange({ ...from, startTime: toTime(new Date()) });
      return setOpen(true);
    }
    DateTimePickerAndroid.open({
      mode: 'time', value: pickerValue(from.startTime), is24Hour: true,
      onValueChange: (_, date) => onChange({ ...from, startTime: toTime(date) }),
    });
  }

  function toggle(day: Weekday) {
    const adding = !value.weekdays.includes(day);
    const next = { ...value, weekdays: adding ? [...value.weekdays, day] : value.weekdays.filter((d) => d !== day) };
    onChange(next);
    // repeat days need a time, so the clock follows
    if (adding && !value.startTime) showClock(next);
  }

  function clear() {
    setOpen(false);
    onChange({ startTime: '', weekdays: [] });
  }

  return (
    <View>
      <View style={[styles.card, invalid && styles.invalid, !editable && styles.disabled]}>
        <View style={styles.timeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Leaving time"
            accessibilityValue={{ text: value.startTime || 'Not set' }}
            accessibilityState={{ expanded: Platform.OS === 'android' ? undefined : open, disabled: !editable }}
            disabled={!editable}
            onPress={() => (open ? setOpen(false) : showClock(value))}
            style={styles.time}
          >
            <Text style={[styles.clock, !value.startTime && styles.placeholder]}>{value.startTime || '--:--'}</Text>
            {!value.startTime && <Text style={styles.prompt}>Set time</Text>}
          </Pressable>
          {chosen && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear leaving time" disabled={!editable} onPress={clear} style={styles.clear}>
              <MaterialIcons name="close" size={22} color="#526173" />
            </Pressable>
          )}
        </View>

        <View style={styles.repeatRow}>
          <Text style={styles.repeatLabel}>Repeat</Text>
          <Text style={styles.summary}>{repeatSummary(value.weekdays) ?? "Doesn't repeat"}</Text>
        </View>
        <View style={styles.days}>
          {WEEKDAYS.map(({ day, name, letter }) => {
            const on = value.weekdays.includes(day);
            return (
              <Pressable
                key={day}
                accessibilityRole="checkbox"
                accessibilityLabel={name}
                accessibilityState={{ checked: on, disabled: !editable }}
                disabled={!editable}
                onPress={() => toggle(day)}
                style={[styles.day, on && styles.dayOn]}
              >
                <Text style={[styles.dayText, on && styles.dayTextOn]}>{letter}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {open && Platform.OS !== 'android' && (
        <DateTimePicker testID="leaving-picker" value={pickerValue(value.startTime)} mode="time" display="spinner" is24Hour accentColor="#163f36" onValueChange={(_, date) => onChange({ ...value, startTime: toTime(date) })} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: 16, borderWidth: 1, borderColor: '#b8c3cf', backgroundColor: '#fff' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  time: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 10, minHeight: 48 },
  clock: { fontSize: 40, fontWeight: '600', color: '#182332', fontVariant: ['tabular-nums'] },
  placeholder: { color: '#9aa5b1' },
  prompt: { color: '#163f36', fontSize: 16, fontWeight: '600' },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  repeatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  repeatLabel: { color: '#182332', fontSize: 15, fontWeight: '600' },
  summary: { color: '#526173', flexShrink: 1, textAlign: 'right' },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  day: { flex: 1, maxWidth: 44, aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9eef2' },
  dayOn: { backgroundColor: '#163f36' },
  dayText: { color: '#354455', fontSize: 15, fontWeight: '700' },
  dayTextOn: { color: '#fff' },
  invalid: { borderColor: '#b42318' },
  disabled: { opacity: 0.5 },
});
