import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTES, type MapTheme } from '../theme';
import { LANGUAGE_NAMES, LANGUAGES, setLanguage, useLanguage, useStrings } from '.';

/** "EN | DE" among the chips over the map: both stay in sight, and the one in use is highlighted, as on the day/night switch. */
export default function LanguageToggle({ theme }: { theme: MapTheme }) {
  const palette = PALETTES[theme];
  const language = useLanguage();
  const t = useStrings();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t.language}
      style={[styles.toggle, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      {LANGUAGES.map((option) => {
        const on = option === language;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={LANGUAGE_NAMES[option]}
            accessibilityState={{ checked: on }}
            hitSlop={4}
            onPress={() => setLanguage(option)}
            style={[styles.option, on && { backgroundColor: palette.thumb }]}
          >
            <Text style={[styles.text, { color: on ? palette.text : palette.muted }]}>{option.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // as tall as a chip beside it
  toggle: { flexDirection: 'row', padding: 3, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, elevation: 2, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  option: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 13 },
  text: { fontSize: 13, fontWeight: '600' },
});
