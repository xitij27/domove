import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RouteForm from './RouteForm';
import RouteDetail from './RouteDetail';
import TransportModeIcon from './TransportModeIcon';
import { routesRepository, type RoutesRepository } from './api';
import { type RouteDraft, type RouteLocation, type SavedRoute } from './model';

export default function RoutesManager() {
  const insets = useSafeAreaInsets();
  const [dialog, setDialog] = useState<'list' | 'create' | null>(null);
  const busy = useRef(false);
  const close = () => { if (!busy.current) setDialog(null); };
  return (
    <>
      <View style={[styles.launcher, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable accessibilityRole="button" onPress={() => setDialog('list')} style={styles.secondary}>
          <Text style={styles.secondaryText}>Saved routes</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setDialog('create')} style={styles.primary}>
          <Text style={styles.primaryText}>Create Route</Text>
        </Pressable>
      </View>
      <Modal visible={dialog !== null} animationType="slide" onRequestClose={close}>
        {dialog !== null && <RoutesPanel initiallyCreating={dialog === 'create'} onClose={close} onBusyChange={(value) => { busy.current = value; }} />}
      </Modal>
    </>
  );
}

export function RoutesPanel({ initiallyCreating = false, onClose, onBusyChange, repository = routesRepository }: {
  initiallyCreating?: boolean;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  repository?: RoutesRepository;
}) {
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [creating, setCreating] = useState(initiallyCreating);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const active = useRef(true);
  const loadGeneration = useRef(0);

  const load = useCallback(() => {
    const generation = ++loadGeneration.current;
    return repository.list().then((saved) => {
      if (active.current && generation === loadGeneration.current) {
        setRoutes(saved);
        setError(null);
      }
    }).catch((e: unknown) => {
      if (active.current && generation === loadGeneration.current) setError(message(e));
    }).finally(() => {
      if (active.current && generation === loadGeneration.current) setLoading(false);
    });
  }, [repository]);

  useEffect(() => {
    active.current = true;
    void load();
    const generation = loadGeneration.current;
    return () => { active.current = false; loadGeneration.current = generation + 1; };
  }, [load]);

  function refresh() {
    setLoading(true);
    setError(null);
    void load();
  }

  async function save(draft: RouteDraft) {
    const saved = await repository.create(draft);
    setRoutes((current) => [saved, ...current.filter((route) => route.id !== saved.id)]);
    setCreating(false);
    // Supersedes a list request that started before the save and would not include it.
    refresh();
  }

  async function remove(id: string) {
    if (deletingRef.current || loading) return;
    deletingRef.current = true;
    setDeleting(id);
    onBusyChange(true);
    try {
      await repository.delete(id);
      if (active.current) {
        setRoutes((current) => current.filter((route) => route.id !== id));
        setSelectedId((current) => (current === id ? null : current));
        setError(null);
      }
    } catch (e) {
      if (active.current) setError(message(e));
    } finally {
      deletingRef.current = false;
      if (active.current) setDeleting(null);
      onBusyChange(false);
    }
  }

  const selected = routes.find((route) => route.id === selectedId) ?? null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.topbar}>
        {selected ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back to routes" onPress={() => setSelectedId(null)} style={styles.back}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
        ) : (
          <Text style={styles.brand}>DO:MOVE</Text>
        )}
        {selected && <Text style={styles.brand}>DO:MOVE</Text>}
        <Pressable accessibilityRole="button" disabled={saving || !!deleting} onPress={onClose} style={styles.close}>
          <Text style={styles.secondaryText}>Close</Text>
        </Pressable>
      </View>
      {selected ? (
        <RouteDetail route={selected} repository={repository} />
      ) : creating ? (
        <RouteForm onSave={save} onCancel={() => setCreating(false)} onBusyChange={(value) => { setSaving(value); onBusyChange(value); }} />
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(route) => route.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>Your routes</Text>
              <Text style={styles.hint}>Your next journey starts here.</Text>
              <Pressable accessibilityRole="button" disabled={!!deleting} onPress={() => setCreating(true)} style={styles.primary}>
                <Text style={styles.primaryText}>Create Route</Text>
              </Pressable>
              {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
              <Pressable accessibilityRole="button" disabled={loading || !!deleting} onPress={refresh} style={styles.secondary}>
                <Text style={styles.secondaryText}>{error ? 'Retry loading routes' : 'Refresh routes'}</Text>
              </Pressable>
              {loading && <ActivityIndicator accessibilityLabel="Loading saved routes" color="#163f36" />}
            </View>
          }
          ListEmptyComponent={!loading && !error ? <View style={styles.empty}><Text style={styles.cardTitle}>No saved routes yet</Text><Text style={styles.hint}>Tap Create Route to plan your first journey.</Text></View> : undefined}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View route from ${place(item.start, 'Starting location')} to ${place(item.destination, 'Final destination')}`}
              disabled={loading || !!deleting}
              onPress={() => setSelectedId(item.id)}
              style={styles.card}
            >
              <TransportModeIcon mode={item.mode} />
              <Text style={styles.cardTitle}>{place(item.start, 'Starting location')} → {place(item.destination, 'Final destination')}</Text>
              {item.waypoints.length > 0 && <Text style={styles.hint}>Via {item.waypoints.map((stop) => place(stop, 'Intermediate stop')).join(' → ')}</Text>}
              {item.startTime && <Text style={styles.hint}>Leaving at {item.startTime}</Text>}
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete route from ${place(item.start, 'Starting location')} to ${place(item.destination, 'Final destination')}`} accessibilityState={{ disabled: loading || !!deleting, busy: deleting === item.id }} disabled={loading || !!deleting} onPress={() => remove(item.id)} style={styles.delete} hitSlop={12}>
                {deleting === item.id ? (
                  <ActivityIndicator size="small" color="#a52621" />
                ) : (
                  <TrashIcon color="#a52621" />
                )}
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

/** Simple trash-bin glyph drawn with Views so no icon font is needed. */
function TrashIcon({ color = '#a52621', size = 20 }: { color?: string; size?: number }) {
  const line = size * 0.09;
  return (
    <View style={{ width: size, height: size + 2, alignItems: 'center' }}>
      <View style={{ width: size * 0.4, height: line, borderRadius: line / 2, backgroundColor: color, marginBottom: line * 0.8 }} />
      <View style={{ width: size * 0.9, height: line, borderRadius: line / 2, backgroundColor: color, marginBottom: line * 0.8 }} />
      <View
        style={{
          width: size * 0.7,
          height: size * 0.68,
          borderWidth: line,
          borderColor: color,
          borderTopWidth: 0,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: 3,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-evenly',
        }}
      >
        <View style={{ width: line * 0.8, height: '55%', backgroundColor: color, borderRadius: line / 2 }} />
        <View style={{ width: line * 0.8, height: '55%', backgroundColor: color, borderRadius: line / 2 }} />
      </View>
    </View>
  );
}

/** Locations saved with only a coordinate have no label. */
function place(location: RouteLocation, fallback: string) {
  return location.label ?? fallback;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7f9' },
  launcher: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12, backgroundColor: '#f5f7f9', justifyContent: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e1e6eb' },
  brand: { color: '#163f36', fontWeight: '800', letterSpacing: 2, fontSize: 16 },
  back: { paddingVertical: 16, paddingRight: 12 },
  backText: { color: '#254636', fontWeight: '600' },
  close: { paddingVertical: 16, paddingHorizontal: 12 },
  list: { padding: 20, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { gap: 12, marginBottom: 8 },
  title: { fontSize: 30, color: '#182332', fontWeight: '700' },
  hint: { color: '#526173', lineHeight: 22 },
  primary: { backgroundColor: '#163f36', padding: 15, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { backgroundColor: '#e9eef2', padding: 15, borderRadius: 14, alignItems: 'center' },
  secondaryText: { color: '#254636', fontWeight: '600' },
  card: { padding: 18, gap: 10, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e1e6eb' },
  cardTitle: { color: '#182332', fontSize: 18, fontWeight: '600' },
  delete: { alignSelf: 'flex-start', padding: 8, borderRadius: 8 },
  error: { color: '#a52621', lineHeight: 21 },
  empty: { paddingVertical: 40, gap: 10 },
});
