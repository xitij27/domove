import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { MAX_LOCATION_LENGTH, type Place, type PlaceDraft } from './model';
import { searchPlaces } from './places';

type Props = {
  accessibilityLabel: string;
  placeholder: string;
  value: PlaceDraft;
  onChange: (value: PlaceDraft) => void;
  editable: boolean;
  style?: StyleProp<ViewStyle>;
  inputStyle: StyleProp<TextStyle>;
};

/** A text field that only gets a coordinate when the user picks one of its suggestions. */
export default function PlaceInput({ accessibilityLabel, placeholder, value, onChange, editable, style, inputStyle }: Props) {
  // null places: the search failed
  const [result, setResult] = useState<{ query: string; places: Place[] | null }>({ query: '', places: [] });
  // a picked place needs no suggestions until the user types again
  const query = value.coordinate ? '' : value.label.trim();
  // only show results for the current text, never stale ones
  const suggestions = result.query === query ? result.places : [];

  useEffect(() => {
    if (query.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(query, controller.signal).then(
        (places) => setResult({ query, places }),
        () => { if (!controller.signal.aborted) setResult({ query, places: null }); },
      );
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <View style={style}>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={value.label}
        onChangeText={(label) => onChange({ label, coordinate: null })}
        editable={editable}
        maxLength={MAX_LOCATION_LENGTH}
        placeholder={placeholder}
        placeholderTextColor="#737d8b"
        style={inputStyle}
      />
      {!suggestions && <Text style={styles.failed}>Could not load suggestions. Check your connection.</Text>}
      {!!suggestions?.length && (
        <View style={styles.list}>
          {suggestions.map((place) => (
            <Pressable key={place.label} accessibilityRole="button" accessibilityLabel={place.label} disabled={!editable} onPress={() => onChange(place)} style={styles.item}>
              <Text style={styles.itemText}>{place.label}</Text>
            </Pressable>
          ))}
          <Text style={styles.attribution}>© OpenStreetMap contributors</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 4, borderWidth: 1, borderColor: '#b8c3cf', borderRadius: 12, backgroundColor: '#fff', overflow: 'hidden' },
  item: { paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e1e6eb' },
  itemText: { color: '#182332', fontSize: 15 },
  attribution: { color: '#627080', fontSize: 11, paddingHorizontal: 14, paddingVertical: 6 },
  failed: { color: '#a52621', marginTop: 4 },
});
