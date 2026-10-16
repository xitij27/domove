import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RouteForm from './RouteForm';
import { routesRepository, type RoutesRepository } from './api';
import { TRANSPORT_MODES, type RouteDraft, type SavedRoute } from './model';

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

  async function save(draft: RouteDraft) {
    const saved = await repository.create(draft);
    setRoutes((current) => [saved, ...current.filter((route) => route.id !== saved.id)]);
    setCreating(false);
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.topbar}>
        <Text style={styles.brand}>DO:MOVE</Text>
        <Pressable accessibilityRole="button" disabled={saving || !!deleting} onPress={onClose} style={styles.close}>
          <Text style={styles.secondaryText}>Close</Text>
        </Pressable>
      </View>
      {creating ? (
        <RouteForm loading={loading} onSave={save} onCancel={() => setCreating(false)} onBusyChange={(value) => { setSaving(value); onBusyChange(value); }} />
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(route) => route.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>Your routes</Text>
              <Text style={styles.hint}>Your next journey starts here.</Text>
              <Pressable accessibilityRole="button" disabled={loading || !!deleting} onPress={() => setCreating(true)} style={styles.primary}>
                <Text style={styles.primaryText}>Create Route</Text>
              </Pressable>
              {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
              <Pressable accessibilityRole="button" disabled={loading || !!deleting} onPress={() => { setLoading(true); setError(null); void load(); }} style={styles.secondary}>
                <Text style={styles.secondaryText}>{error ? 'Retry loading routes' : 'Refresh routes'}</Text>
              </Pressable>
              {loading && <ActivityIndicator accessibilityLabel="Loading saved routes" color="#163f36" />}
            </View>
          }
          ListEmptyComponent={!loading && !error ? <View style={styles.empty}><Text style={styles.cardTitle}>No saved routes yet</Text><Text style={styles.hint}>Tap Create Route to plan your first journey.</Text></View> : undefined}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.badge}>{TRANSPORT_MODES[item.mode]}</Text>
              <Text style={styles.cardTitle}>{item.start.label} → {item.destination.label}</Text>
              {item.waypoints.length > 0 && <Text style={styles.hint}>Via {item.waypoints.map((stop) => stop.label).join(' → ')}</Text>}
              <Text style={styles.date}>Created {new Date(item.createdAt).toLocaleDateString()}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete route from ${item.start.label} to ${item.destination.label}`} accessibilityState={{ disabled: loading || !!deleting, busy: deleting === item.id }} disabled={loading || !!deleting} onPress={() => remove(item.id)} style={styles.delete}>
                <Text style={styles.deleteText}>{deleting === item.id ? 'Deleting…' : 'Delete route'}</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7f9' },
  launcher: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12, backgroundColor: '#f5f7f9', justifyContent: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e1e6eb' },
  brand: { color: '#163f36', fontWeight: '800', letterSpacing: 2, fontSize: 16 },
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
  badge: { color: '#246049', fontWeight: '700' },
  date: { color: '#627080', fontSize: 12 },
  delete: { alignSelf: 'flex-start', paddingVertical: 14, paddingHorizontal: 12, backgroundColor: '#fff0ed', borderRadius: 10 },
  deleteText: { color: '#a52621', fontWeight: '600' },
  error: { color: '#a52621', lineHeight: 21 },
  empty: { paddingVertical: 40, gap: 10 },
});
