import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Dimensions, FlatList, Image, PanResponder, Pressable, StyleSheet, Text, View, type PanResponderGestureState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationSettings from '../notifications/NotificationSettings';
import { constructionNotifications } from '../notifications/runtime';
import RouteForm from './RouteForm';
import { routesRepository, type RoutesRepository } from './api';
import { formatLeaving, TRANSPORT_MODES, type RouteDraft, type RouteLocation, type SavedRoute } from './model';

/** The sheet's corner radius, which is also how far it reaches over the bottom of the map. */
export const SHEET_RADIUS = 24;
// The strip of map left in sight above the raised sheet.
const RAISED_GAP = 8;
// JS-driven: a drag has to read where an interrupted spring left the sheet, which a native-driven value can't say at once.
const SNAP = { useNativeDriver: false, overshootClamping: true, speed: 16, bounciness: 0 } as const;

type Open = { creating: boolean } | null;

/**
 * Raises and lowers the sheet. Its drag state lives here rather than in React state, since the drag
 * handlers are made once and must always see the latest values.
 */
function createSheet(y: Animated.Value, show: (open: Open) => void) {
  let open = false;
  let busy = false;
  let travel = 0;
  let from = 0;

  function raise(creating = false) {
    if (!open) {
      open = true;
      show({ creating });
    }
    Animated.spring(y, { toValue: 0, ...SNAP }).start();
  }

  function lower() {
    // Stays up while a save or delete is pending, as the Close button does.
    if (busy) return raise();
    open = false;
    show(null);
    Animated.spring(y, { toValue: travel, ...SNAP }).start();
  }

  const settle = (_: unknown, gesture: PanResponderGestureState) => {
    const at = from + gesture.dy;
    if (gesture.vy < -0.3 || (gesture.vy < 0.3 && at < travel / 2)) raise();
    else lower();
  };

  const { panHandlers } = PanResponder.create({
    // Taps still reach the buttons; only a vertical drag moves the sheet, and a lowered one only goes up.
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx) && (open || gesture.dy < 0),
    onPanResponderGrant: () => {
      y.stopAnimation((at) => { from = at; });
      // The saved routes come into view as the sheet is pulled up.
      if (!open) {
        open = true;
        show({ creating: false });
      }
    },
    onPanResponderMove: (_, gesture) => y.setValue(Math.min(Math.max(from + gesture.dy, 0), travel)),
    onPanResponderRelease: settle,
    onPanResponderTerminate: settle,
  });

  return {
    panHandlers,
    raise,
    lower,
    isOpen: () => open,
    setBusy: (value: boolean) => { busy = value; },
    /** How far the sheet moves down from raised to lowered; a lowered sheet follows it at once. */
    setTravel: (value: number) => {
      travel = value;
      if (!open && value > 0) y.setValue(value);
    },
  };
}

/** The two buttons in a sheet below the map, which pulls up over it with the saved routes or the form. */
export default function RoutesManager({ repository, onOpenChange }: {
  repository?: RoutesRepository;
  onOpenChange?: (open: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  // What the raised sheet shows; null while it is lowered to the two buttons.
  const [open, setOpen] = useState<Open>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [loweredHeight, setLoweredHeight] = useState(0);
  const travel = Math.max(sheetHeight - loweredHeight, 0);
  // translateY: 0 is raised, travel is lowered. Starts off screen until the first layout.
  const [y] = useState(() => new Animated.Value(Dimensions.get('window').height));
  const [sheet] = useState(() => createSheet(y, setOpen));

  useEffect(() => { sheet.setTravel(travel); }, [sheet, travel]);

  useEffect(() => { onOpenChange?.(open !== null); }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { sheet.lower(); return true; });
    return () => subscription.remove();
  }, [open, sheet]);

  return (
    <>
      {/* The map ends here, so only the sheet's rounded top lies over it while lowered. */}
      <View style={{ height: Math.max(loweredHeight - SHEET_RADIUS, 0) }} />
      <Animated.View
        accessibilityViewIsModal={open !== null}
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        style={[styles.sheet, { top: insets.top + RAISED_GAP, transform: [{ translateY: y }] }]}
      >
        <View {...sheet.panHandlers} onLayout={(e) => { if (!sheet.isOpen()) setLoweredHeight(e.nativeEvent.layout.height); }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={open ? 'Lower the routes panel' : 'Raise the routes panel'}
            accessibilityState={{ expanded: open !== null }}
            hitSlop={{ top: 12 }}
            onPress={() => (open ? sheet.lower() : sheet.raise())}
            style={styles.grip}
          >
            <View style={styles.handle} />
          </Pressable>
          {!open && (
            <View style={[styles.launcher, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <Pressable accessibilityRole="button" onPress={() => sheet.raise()} style={styles.secondary}>
                <Text style={styles.secondaryText}>Saved routes</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => sheet.raise(true)} style={styles.primary}>
                <Text style={styles.primaryText}>Create Route</Text>
              </Pressable>
            </View>
          )}
        </View>
        {open && <RoutesPanel initiallyCreating={open.creating} onClose={sheet.lower} onBusyChange={sheet.setBusy} repository={repository} />}
      </Animated.View>
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
  const [notifying, setNotifying] = useState<SavedRoute | null>(null);
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
      // Its reminders would otherwise still fire; the next obstacle sync would also drop them.
      constructionNotifications.forgetRoute(id).catch((e: unknown) => console.warn('Could not cancel the route\'s reminders', e));
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
    // The sheet already starts below the status bar.
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <View style={styles.topbar}>
        <Image accessible accessibilityRole="image" accessibilityLabel="do.move" source={require('../../assets/domovelogo.png')} style={styles.brand} />
        <Pressable accessibilityRole="button" disabled={saving || !!deleting} onPress={onClose} style={styles.close}>
          <Text style={styles.secondaryText}>Close</Text>
        </Pressable>
      </View>
      {creating ? (
        <RouteForm onSave={save} onCancel={() => setCreating(false)} onBusyChange={(value) => { setSaving(value); onBusyChange(value); }} />
      ) : notifying ? (
        <NotificationSettings route={notifying} onBack={() => setNotifying(null)} />
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
              {loading && <ActivityIndicator accessibilityLabel="Loading saved routes" color="#a8520e" />}
            </View>
          }
          ListEmptyComponent={!loading && !error ? <View style={styles.empty}><Text style={styles.cardTitle}>No saved routes yet</Text><Text style={styles.hint}>Tap Create Route to plan your first journey.</Text></View> : undefined}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.badge}>{TRANSPORT_MODES[item.mode]}</Text>
              <Text style={styles.cardTitle}>{place(item.start, 'Starting location')} → {place(item.destination, 'Final destination')}</Text>
              {item.waypoints.length > 0 && <Text style={styles.hint}>Via {item.waypoints.map((stop) => place(stop, 'Intermediate stop')).join(' → ')}</Text>}
              {item.startTime && <Text style={styles.hint}>{formatLeaving(item)}</Text>}
              <Text style={styles.date}>Created {new Date(item.createdAt).toLocaleDateString()}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Notification preferences for the route to ${place(item.destination, 'Final destination')}`} disabled={!!deleting} onPress={() => setNotifying(item)} style={styles.notify}>
                <Text style={styles.secondaryText}>Notifications</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete route from ${place(item.start, 'Starting location')} to ${place(item.destination, 'Final destination')}`} accessibilityState={{ disabled: loading || !!deleting, busy: deleting === item.id }} disabled={loading || !!deleting} onPress={() => remove(item.id)} style={styles.delete}>
                <Text style={styles.deleteText}>{deleting === item.id ? 'Deleting…' : 'Delete route'}</Text>
              </Pressable>
            </View>
          )}
        />
      )}
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
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#f5f7f9', borderTopLeftRadius: SHEET_RADIUS, borderTopRightRadius: SHEET_RADIUS, elevation: 12, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: -2 } },
  grip: { height: 32, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#c3ccd5' },
  launcher: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 12, paddingTop: 4, justifyContent: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e1e6eb' },
  // The logo file is 960×170.
  brand: { height: 26, aspectRatio: 960 / 170 },
  close: { paddingVertical: 16, paddingHorizontal: 12 },
  list: { padding: 20, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { gap: 12, marginBottom: 8 },
  title: { fontSize: 30, color: '#182332', fontWeight: '700' },
  hint: { color: '#526173', lineHeight: 22 },
  primary: { backgroundColor: '#a8520e', padding: 15, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { backgroundColor: '#e9eef2', padding: 15, borderRadius: 14, alignItems: 'center' },
  secondaryText: { color: '#7c3d0e', fontWeight: '600' },
  card: { padding: 18, gap: 10, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e1e6eb' },
  cardTitle: { color: '#182332', fontSize: 18, fontWeight: '600' },
  badge: { color: '#8a4510', fontWeight: '700' },
  date: { color: '#627080', fontSize: 12 },
  notify: { alignSelf: 'flex-start', paddingVertical: 14, paddingHorizontal: 12, backgroundColor: '#e9eef2', borderRadius: 10 },
  delete: { alignSelf: 'flex-start', paddingVertical: 14, paddingHorizontal: 12, backgroundColor: '#fff0ed', borderRadius: 10 },
  deleteText: { color: '#a52621', fontWeight: '600' },
  error: { color: '#a52621', lineHeight: 21 },
  empty: { paddingVertical: 40, gap: 10 },
});
