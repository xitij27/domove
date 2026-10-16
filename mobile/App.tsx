import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, NativeModules, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import GoogleSitesMap from './src/maps/GoogleSitesMap';
import { COLORS, fetchSites, type Site, type Status } from './src/sites';
import RoutesManager from './src/routes/RoutesManager';

const LABELS: Record<Status, string> = { current: 'Current', planned: 'Planned' };

// Written here and by plugins/withCrashLog.js when a run crashes; shown on the next launch.
const crashFile = () => new File(Paths.document, 'last-crash.txt');

// Record fatal JS errors with their JS stack, before the code below gets a chance to throw.
const defaultErrorHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  if (isFatal) {
    try {
      crashFile().writeSync(String(error?.stack ?? error));
    } catch {
      // best effort
    }
  }
  defaultErrorHandler(error, isFatal);
});

// Mapbox needs a development build; in Expo Go its native module is missing and importing it throws.
const MapboxSitesMap: typeof GoogleSitesMap | null =
  NativeModules.RNMBXModule != null ? require('./src/maps/MapboxSitesMap').default : null;

// Google Maps on Android needs our own key, except in Expo Go (no Mapbox there), which brings one.
const GOOGLE_OK = MapboxSitesMap == null || Platform.OS === 'ios' || !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

function readCrash(): string | null {
  try {
    const file = crashFile();
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [crash, setCrash] = useState(readCrash);

  const dismissCrash = () => {
    try {
      crashFile().delete();
    } catch {
      // already gone
    }
    setCrash(null);
  };

  return (
    <SafeAreaProvider>
      {/* skip the maps while a crash report is open, in case a map is what crashed */}
      {crash ? <CrashReport text={crash} onDismiss={dismissCrash} /> : (
        <View style={styles.fill}>
          <RadarMap />
          <RoutesManager />
        </View>
      )}
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

function CrashReport({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, styles.crash, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <Text style={styles.crashTitle}>The app crashed last time</Text>
      <Text style={styles.crashHint}>Screenshot this (or long-press to copy) and send it to the team.</Text>
      <ScrollView style={styles.fill}>
        <Text selectable style={styles.crashText}>{text}</Text>
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.crashButton}>
        <Text style={styles.crashButtonText}>Clear and open the map</Text>
      </Pressable>
    </View>
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
        {MapboxSitesMap && GOOGLE_OK && (
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
        <Pressable style={styles.card} onPress={load} accessibilityRole="button">
          <Text style={styles.title}>Could not load construction sites</Text>
          <Text style={styles.meta}>{error} — tap to retry</Text>
        </Pressable>
      )}

      {selected && !error && (
        <View style={styles.card}>
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
  // no safe-area inset at the bottom: the route launcher below the map already clears it
  card: { position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 4, elevation: 4, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#555' },
  crash: { backgroundColor: '#111', paddingHorizontal: 16, gap: 8 },
  crashTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  crashHint: { color: '#aaa' },
  crashText: { color: '#eee', fontFamily: Platform.select({ android: 'monospace', default: 'Menlo' }), fontSize: 11 },
  crashButton: { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  crashButtonText: { fontWeight: '600' },
});
