import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LANGUAGE_NAMES, LANGUAGES, setLanguage, useLanguage, useStrings } from '../i18n';
import { CASING_COLORS, LINE_COLORS } from '../maps/routeOverlay';
import { PALETTES, type MapTheme } from '../theme';
import { releaseVersion, type Release } from '../updates/release';
import { useUpdates, type UpdateState, type Updater } from '../updates/updater';

const SIZE = 48; // as wide as the other round controls above it

/** The round gear under the map's other controls. */
export function SettingsButton({ theme, onPress }: { theme: MapTheme; onPress: () => void }) {
  const palette = PALETTES[theme];
  const t = useStrings().settings;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.title}
      onPress={onPress}
      android_ripple={{ color: palette.border, borderless: true, radius: SIZE / 2 }}
      style={[styles.button, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <MaterialIcons name="settings" size={24} color={palette.muted} />
    </Pressable>
  );
}

/** The app's language and, on Android, updating to the latest release. */
export default function Settings({ visible, onClose, theme, updater }: {
  visible: boolean;
  onClose: () => void;
  theme: MapTheme;
  /** Missing where the app can't update itself, such as on iOS. */
  updater?: Updater;
}) {
  const palette = PALETTES[theme];
  const insets = useSafeAreaInsets();
  const t = useStrings();
  const language = useLanguage();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.fill, { backgroundColor: palette.surface, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.top}>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{t.settings.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t.common.close} hitSlop={8} onPress={onClose}>
            <MaterialIcons name="close" size={24} color={palette.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>{t.language}</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={t.language}>
              {LANGUAGES.map((option) => {
                const on = option === language;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setLanguage(option)}
                    style={styles.option}
                  >
                    <MaterialIcons name={on ? 'radio-button-checked' : 'radio-button-unchecked'} size={22} color={on ? palette.accent : palette.muted} />
                    <Text style={{ color: palette.text, fontSize: 15 }}>{LANGUAGE_NAMES[option]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {updater && <Updates updater={updater} theme={theme} />}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Updates({ updater, theme }: { updater: Updater; theme: MapTheme }) {
  const palette = PALETTES[theme];
  const t = useStrings().updates;
  const { state, check, install } = useUpdates(updater);
  const installed = releaseVersion(updater.currentVersion);

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>{t.title}</Text>
      <Text style={{ color: palette.muted }}>{installed ? t.version(installed.join('.')) : t.devBuild}</Text>
      <Status state={state} theme={theme} />
      <Action state={state} theme={theme} check={check} install={install} />
    </View>
  );
}

function Status({ state, theme }: { state: UpdateState; theme: MapTheme }) {
  const palette = PALETTES[theme];
  const t = useStrings().updates;
  const text = { color: palette.text };
  switch (state.status) {
    case 'idle':
      return null;
    case 'checking':
      return (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={palette.muted} />
          <Text style={text}>{t.checking}</Text>
        </View>
      );
    case 'current':
      return <Text style={text}>{t.current}</Text>;
    case 'available':
      return <Text style={text}>{t.available(state.release.version)}</Text>;
    case 'downloading': {
      const percent = state.share === null ? null : Math.round(state.share * 100);
      return (
        <View style={styles.progress}>
          <Text style={text}>{t.downloading(state.release.version, percent)}</Text>
          <View style={[styles.track, { backgroundColor: palette.border }]}>
            {/* while the size is unknown, an empty track says it has started */}
            <View style={[styles.bar, { backgroundColor: LINE_COLORS[theme], width: `${percent ?? 0}%` }]} />
          </View>
        </View>
      );
    }
    case 'installing':
      return <Text style={text}>{t.confirm}</Text>;
    case 'failed':
      return <Text style={{ color: palette.status.current }}>{t.failed(state.error)}</Text>;
  }
}

function Action({ state, theme, check, install }: {
  state: UpdateState;
  theme: MapTheme;
  check: () => void;
  install: (release: Release) => void;
}) {
  const t = useStrings().updates;
  switch (state.status) {
    case 'idle':
      return <Button theme={theme} icon="system-update" label={t.check} onPress={check} />;
    case 'checking':
    case 'downloading':
      return null;
    case 'current':
      return <Button theme={theme} icon="refresh" label={t.checkAgain} onPress={check} />;
    case 'available': {
      const { release } = state;
      const mb = release.size > 0 ? String(Math.round(release.size / 1_000_000)) : null;
      return <Button theme={theme} icon="download" label={t.download(mb)} onPress={() => { install(release); }} />;
    }
    case 'installing': {
      const { release } = state;
      return <Button theme={theme} icon="install-mobile" label={t.openInstaller} onPress={() => { install(release); }} />;
    }
    case 'failed': {
      const { release } = state;
      return <Button theme={theme} icon="refresh" label={t.retry} onPress={release ? () => { install(release); } : check} />;
    }
  }
}

/** White or near-black on the route's blue, as the route card's Google Maps button is. */
function Button({ theme, icon, label, onPress }: {
  theme: MapTheme;
  icon: ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.action, { backgroundColor: LINE_COLORS[theme] }]}>
      <MaterialIcons name={icon} size={18} color={CASING_COLORS[theme]} />
      <Text style={[styles.actionText, { color: CASING_COLORS[theme] }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-end', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', elevation: 2, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  fill: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 20, fontWeight: '700', flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 24 },
  section: { gap: 8 },
  heading: { fontSize: 16, fontWeight: '600' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progress: { gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  action: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  actionText: { fontSize: 15, fontWeight: '600' },
});
