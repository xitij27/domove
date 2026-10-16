import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, NativeModules, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import GoogleSitesMap from './src/maps/GoogleSitesMap';
import { COLORS, fetchSites, type Site, type Status } from './src/sites';

const LABELS: Record<Status, string> = { current: 'Current', planned: 'Planned' };

// Mapbox needs a development build; in Expo Go its native module is missing and importing it throws.
const MapboxSitesMap: typeof GoogleSitesMap | null =
  NativeModules.RNMBXModule != null ? require('./src/maps/MapboxSitesMap').default : null;

export default function App() {
  return (
    <SafeAreaProvider>
      <RadarMap />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

function RadarMap() {
  const insets = useSafeAreaInsets();
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState<Record<Status, boolean>>({ current: true, planned: true });
  const [selected, setSelected] = useState<Site | null>(null);
  const [mapboxOn, setMapboxOn] = useState(MapboxSitesMap != null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchSites()
      .then(setSites)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const SitesMap = mapboxOn && MapboxSitesMap ? MapboxSitesMap : GoogleSitesMap;

  return (
    <View style={styles.fill}>
      <SitesMap sites={sites.filter((s) => shown[s.status])} onSelect={setSelected} />

      <View style={[styles.legend, { top: insets.top + 8 }]}>
        {(Object.keys(LABELS) as Status[]).map((st) => (
          <Pressable
            key={st}
            accessibilityRole="switch"
            accessibilityState={{ checked: shown[st] }}
            onPress={() => setShown({ ...shown, [st]: !shown[st] })}
            style={[styles.chip, !shown[st] && styles.chipOff]}
          >
            <View style={[styles.dot, { backgroundColor: COLORS[st] }]} />
            <Text>{LABELS[st]} ({sites.filter((s) => s.status === st).length})</Text>
          </Pressable>
        ))}
        {loading && <ActivityIndicator style={styles.chip} />}
        {MapboxSitesMap && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Map provider: ${mapboxOn ? 'Mapbox' : 'Google'}. Tap to switch.`}
            onPress={() => { setSelected(null); setMapboxOn(!mapboxOn); }}
            style={[styles.chip, styles.switch]}
          >
            <Text>{mapboxOn ? 'Mapbox' : 'Google'} ⇄</Text>
          </Pressable>
        )}
      </View>

      {error && (
        <Pressable style={[styles.card, { bottom: insets.bottom + 12 }]} onPress={load} accessibilityRole="button">
          <Text style={styles.title}>Could not load construction sites</Text>
          <Text style={styles.meta}>{error} — tap to retry</Text>
        </Pressable>
      )}

      {selected && !error && (
        <View style={[styles.card, { bottom: insets.bottom + 12 }]}>
          <Text style={[styles.meta, { color: COLORS[selected.status] }]}>{LABELS[selected.status]}</Text>
          <Text style={styles.title}>{selected.title}</Text>
          <Text style={styles.meta}>{selected.period}</Text>
          <Text style={styles.meta}>{[selected.district, selected.owner].filter(Boolean).join(' · ')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  legend: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, elevation: 2, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  chipOff: { opacity: 0.45 },
  switch: { marginLeft: 'auto' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  card: { position: 'absolute', left: 12, right: 12, backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 4, elevation: 4, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#555' },
});
