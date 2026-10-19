import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useStrings } from '../i18n';
import { PALETTES, type MapTheme } from '../theme';
import { STEPS } from './demo';

const SIZE = 48; // as wide as the quiz button above it

/** A round button under the quiz; starts and ends the guided demo. */
export function DemoButton({ running, busy, theme, onPress }: { running: boolean; busy: boolean; theme: MapTheme; onPress: () => void }) {
  const palette = PALETTES[theme];
  const t = useStrings().demo;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.label}
      accessibilityHint={running ? t.endHint : t.startHint}
      accessibilityState={{ busy, expanded: running }}
      disabled={busy}
      onPress={onPress}
      android_ripple={{ color: palette.border, borderless: true, radius: SIZE / 2 }}
      style={[styles.button, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      {busy
        ? <ActivityIndicator color={palette.muted} />
        : <MaterialIcons name={running ? 'stop' : 'play-arrow'} size={26} color={running ? palette.accent : palette.muted} />}
    </Pressable>
  );
}

/** What goes in the demo's card: where the tour is, what is on screen, and the way on. */
export function DemoCaption({ step, note, theme, onBack, onNext, onExit }: {
  step: number;
  /** A problem with this step, such as blocked notifications. */
  note: string | null;
  theme: MapTheme;
  onBack: () => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const palette = PALETTES[theme];
  const t = useStrings();
  const { title, text } = t.demo.steps[STEPS[step].id];
  const last = step === STEPS.length - 1;
  return (
    <View style={styles.caption}>
      <View style={styles.head}>
        <Text style={[styles.count, { color: palette.muted }]}>{t.demo.count(step + 1, STEPS.length)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t.demo.end} hitSlop={8} onPress={onExit} style={styles.close}>
          <MaterialIcons name="close" size={22} color={palette.muted} />
        </Pressable>
      </View>
      <View accessibilityLiveRegion="polite" style={styles.caption}>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.text, { color: palette.text }]}>{text}</Text>
        {note && <Text style={{ color: palette.status.current }}>{note}</Text>}
      </View>
      <View style={styles.actions}>
        {step > 0 && (
          <Pressable accessibilityRole="button" onPress={onBack} style={[styles.action, styles.back, { borderColor: palette.border }]}>
            <Text style={[styles.actionText, { color: palette.text }]}>{t.common.back}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={last ? onExit : onNext} style={[styles.action, { backgroundColor: palette.text }]}>
          <Text style={[styles.actionText, { color: palette.surface }]}>{last ? t.demo.finish : t.common.next}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-end', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', elevation: 2, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  caption: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { flex: 1 },
  close: { padding: 4 },
  title: { fontSize: 16, fontWeight: '600' },
  text: { fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  action: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  back: { borderWidth: 1 },
  actionText: { fontSize: 15, fontWeight: '600' },
});
