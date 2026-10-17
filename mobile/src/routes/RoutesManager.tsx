import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, BackHandler, Dimensions, FlatList, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View, type PanResponderGestureState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appear, motionReduced } from '../motion';
import { constructionNotifications } from '../notifications/runtime';
import RouteForm from './RouteForm';
import TransportModeIcon from './TransportModeIcon';
import { routesRepository, type RoutesRepository } from './api';
import { formatLeaving, type PlacePick, type RouteDraft, type RouteLocation, type SavedRoute } from './model';

/** The sheet's corner radius, which is also how far it reaches over the bottom of the map. */
export const SHEET_RADIUS = 24;
// The strip of map left in sight above the raised sheet.
const RAISED_GAP = 8;
// The grip's height, above the two buttons or the panel.
const GRIP = 32;
// JS-driven: a drag has to read where an interrupted spring left the sheet, which a native-driven value can't say at once.
// Damped just enough not to bounce, so the sheet eases to a stop rather than halting.
const SNAP = { useNativeDriver: false, overshootClamping: true, stiffness: 200, damping: 28, restDisplacementThreshold: 0.5, restSpeedThreshold: 5 } as const;
// How fast (px/s) that spring may start for each px it has to go, and still come to rest without passing its stop.
const SNAP_RATE = Math.sqrt(SNAP.stiffness);
// How far the list or the form comes from as the panel switches between them, and the saved routes as they load.
const SWITCH_SHIFT = 32;
const LOAD_IN = { y: 12 };

type Open = { creating: boolean } | null;
/** Where a drag let go of the sheet, and how fast it was moving then (px/ms, down is positive). */
type Fling = { at: number; vy: number };

/**
 * Raises and lowers the sheet. Its drag state lives here rather than in React state, since the drag
 * handlers are made once and must always see the latest values. `lowered` runs once the sheet is down,
 * when what it showed can go.
 */
function createSheet(y: Animated.Value, show: (open: Open) => void, lowered: () => void) {
  let open = false;
  let busy = false;
  let travel = 0;
  let from = 0;

  // A fling heading the same way carries on into the spring, so the sheet doesn't stop dead when let go and start
  // again, though no faster than lets it ease to a stop. `done` runs once the sheet is there, or at once while motion
  // is reduced, when nothing fades on the way.
  function snap(to: number, fling?: Fling, done?: () => void) {
    const ahead = fling ? to - fling.at : 0;
    const velocity = fling && ahead * fling.vy > 0 ? Math.sign(ahead) * Math.min(Math.abs(fling.vy) * 1000, SNAP_RATE * Math.abs(ahead)) : 0;
    const animation = Animated.spring(y, { toValue: to, velocity, ...SNAP });
    if (motionReduced()) {
      animation.start();
      done?.();
    } else {
      animation.start(({ finished }) => { if (finished) done?.(); });
    }
  }

  function raise(creating = false, fling?: Fling) {
    if (!open) {
      open = true;
      show({ creating });
    }
    snap(0, fling);
  }

  function lower(fling?: Fling) {
    // Stays up while a save or delete is pending, as the Close button does.
    if (busy) return raise(false, fling);
    open = false;
    show(null);
    sink(fling);
  }

  function sink(fling?: Fling) {
    snap(travel, fling, () => { if (!open) lowered(); });
  }

  const settle = (_: unknown, gesture: PanResponderGestureState) => {
    const fling = { at: Math.min(Math.max(from + gesture.dy, 0), travel), vy: gesture.vy };
    if (gesture.vy < -0.3 || (gesture.vy < 0.3 && fling.at < travel / 2)) raise(false, fling);
    else lower(fling);
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
    /** How far the sheet moves down from raised to lowered; a lowered sheet follows it, rising into sight at launch. */
    setTravel: (value: number) => {
      travel = value;
      if (open || value <= 0) return;
      if (motionReduced()) y.setValue(value);
      else sink();
    },
    /** Slides the sheet `to` below its raised place, out of sight, keeping what it shows. */
    hide: (to: number) => snap(to),
    /** Brings a hidden sheet back up, if it was raised; `done` once it covers the map again. */
    unhide: (done: () => void) => (open ? snap(0, undefined, done) : done()),
  };
}

/** The two buttons in a sheet below the map, which pulls up over it with the saved routes or the form. */
export default function RoutesManager({ repository, onOpenChange, onViewRoute, onRouteUpdated, onRouteDeleted, onPickOnMap, hidden = false }: {
  repository?: RoutesRepository;
  onOpenChange?: (open: boolean) => void;
  /** Shows a saved route on the map below; the sheet lowers out of its way. */
  onViewRoute?: (route: SavedRoute) => void;
  onRouteUpdated?: (route: SavedRoute) => void;
  onRouteDeleted?: (id: string) => void;
  /** Hands a place in the form to the map below to choose; hide the sheet meanwhile. */
  onPickOnMap?: (pick: PlacePick) => void;
  /** Slides the sheet off screen and gives the map its room, keeping the form as it was. */
  hidden?: boolean;
}) {
  const insets = useSafeAreaInsets();
  // What the raised sheet shows; null while it is lowered to the two buttons.
  const [open, setOpen] = useState<Open>(null);
  // The panel in the sheet: it starts over each time the sheet goes up, and stays while the sheet takes it down.
  const [panel, setPanel] = useState<{ creating: boolean; key: number } | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [loweredHeight, setLoweredHeight] = useState(0);
  const travel = Math.max(sheetHeight - loweredHeight, 0);
  // translateY: 0 is raised, travel is lowered. Starts off screen until the first layout.
  const [y] = useState(() => new Animated.Value(Dimensions.get('window').height));
  // Out of sight for a place to be chosen, until it covers the map again, or is lowered: the map keeps the room
  // meanwhile, rather than shrinking while still in view.
  const [away, setAway] = useState(false);
  if (hidden && !away) setAway(true);
  const [sheet] = useState(() => createSheet(
    y,
    (next) => {
      setOpen(next);
      if (next) setPanel((current) => ({ ...next, key: (current?.key ?? 0) + 1 }));
    },
    () => {
      setPanel(null);
      setAway(false);
    },
  ));
  // The two buttons give way as soon as the sheet is pulled up, and the panel comes into view as it rises.
  const fades = useMemo(() => ({
    launcher: y.interpolate({ inputRange: [Math.max(travel - 72, 0), Math.max(travel, 1)], outputRange: [0, 1], extrapolate: 'clamp' }),
    panel: y.interpolate({ inputRange: [Math.max(travel - 320, 0), Math.max(travel - 24, 1)], outputRange: [1, 0], extrapolate: 'clamp' }),
  }), [y, travel]);

  useEffect(() => { sheet.setTravel(travel); }, [sheet, travel]);

  useEffect(() => { onOpenChange?.(open !== null); }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || hidden) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { sheet.lower(); return true; });
    return () => subscription.remove();
  }, [open, sheet, hidden]);

  // Only the open form hands a place to the map, so a hidden sheet comes back raised.
  useEffect(() => {
    if (hidden) sheet.hide(sheetHeight);
    else sheet.unhide(() => setAway(false));
  }, [hidden, sheet, sheetHeight]);

  return (
    <>
      {/* The map ends here, so only the sheet's rounded top lies over it while lowered. */}
      <View style={{ height: away ? 0 : Math.max(loweredHeight - SHEET_RADIUS, 0) }} />
      <Animated.View
        accessibilityViewIsModal={open !== null && !hidden}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        style={[styles.sheet, { top: insets.top + RAISED_GAP, transform: [{ translateY: y }] }]}
      >
        <View {...sheet.panHandlers}>
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
        </View>
        {panel && (
          // On its way down it is out of reach, and out of a screen reader's.
          <Animated.View
            accessibilityElementsHidden={!open}
            importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
            style={[styles.fill, { opacity: fades.panel, pointerEvents: open ? 'auto' : 'none' }]}
          >
            <RoutesPanel
              key={panel.key}
              initiallyCreating={panel.creating}
              onClose={() => sheet.lower()}
              onBusyChange={sheet.setBusy}
              onView={onViewRoute && ((route) => { sheet.lower(); onViewRoute(route); })}
              onUpdated={onRouteUpdated}
              onDeleted={onRouteDeleted}
              onPickOnMap={onPickOnMap}
              repository={repository}
            />
          </Animated.View>
        )}
        {/* Over the panel's top, which shows through as the buttons fade while the sheet goes up. */}
        <Animated.View
          {...sheet.panHandlers}
          accessibilityElementsHidden={open !== null}
          importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
          onLayout={(e) => setLoweredHeight(GRIP + e.nativeEvent.layout.height)}
          style={[
            styles.launcher,
            { paddingBottom: Math.max(insets.bottom, 12), opacity: away ? 0 : fades.launcher, pointerEvents: open ? 'none' : 'auto' },
          ]}
        >
          <Pressable accessibilityRole="button" onPress={() => sheet.raise()} style={styles.secondary}>
            <Text style={styles.secondaryText}>Saved routes</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => sheet.raise(true)} style={styles.primary}>
            <Text style={styles.primaryText}>Create Route</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </>
  );
}

export function RoutesPanel({ initiallyCreating = false, onClose, onBusyChange, onView, onUpdated, onDeleted, onPickOnMap, repository = routesRepository }: {
  initiallyCreating?: boolean;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onView?: (route: SavedRoute) => void;
  onUpdated?: (route: SavedRoute) => void;
  onDeleted?: (id: string) => void;
  onPickOnMap?: (pick: PlacePick) => void;
  repository?: RoutesRepository;
}) {
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  // The form is open while set: empty to create a route, or with the route being edited.
  const [form, setForm] = useState<{ route?: SavedRoute } | null>(initiallyCreating ? {} : null);
  // Each switch between the list and the form slides the new one in; the first view comes up with the sheet.
  const [switches, setSwitches] = useState(0);
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

  function showForm(next: { route?: SavedRoute } | null) {
    setForm(next);
    setSwitches((count) => count + 1);
  }

  function refresh() {
    setLoading(true);
    setError(null);
    void load();
  }

  async function save(draft: RouteDraft) {
    const saved = await repository.create(draft);
    setRoutes((current) => [saved, ...current.filter((route) => route.id !== saved.id)]);
    showForm(null);
    // Supersedes a list request that started before the save and would not include it.
    refresh();
  }

  async function update(id: string, draft: RouteDraft) {
    const saved = await repository.update(id, draft);
    // It keeps its place in the list.
    setRoutes((current) => current.map((route) => (route.id === saved.id ? saved : route)));
    onUpdated?.(saved);
    showForm(null);
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
      onDeleted?.(id);
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

  // Only the first view's routes come in one by one as they load; in a later one they slide in with the list.
  const loadIn = switches === 0 ? LOAD_IN : null;

  return (
    // The sheet already starts below the status bar.
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <View style={styles.topbar}>
        <Image accessible accessibilityRole="image" accessibilityLabel="do.move" source={require('../../assets/domovelogo.png')} resizeMode="contain" style={styles.brand} />
        <Pressable accessibilityRole="button" disabled={saving || !!deleting} onPress={onClose} style={styles.close}>
          <Text style={styles.secondaryText}>Close</Text>
        </Pressable>
      </View>
      {/* forward into the form from the right, back to the list from the left */}
      <Appear key={switches} from={switches === 0 ? null : { x: form ? SWITCH_SHIFT : -SWITCH_SHIFT }} style={styles.fill}>
        {form ? (
          <RouteForm
            route={form.route}
            onSave={(draft) => (form.route ? update(form.route.id, draft) : save(draft))}
            onCancel={() => showForm(null)}
            onBusyChange={(value) => { setSaving(value); onBusyChange(value); }}
            onPickOnMap={onPickOnMap}
          />
        ) : (
          <FlatList
            data={routes}
            keyExtractor={(route) => route.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.header}>
                <Text accessibilityRole="header" style={styles.title}>Your routes</Text>
                <Text style={styles.hint}>Your next journey starts here.</Text>
                <Pressable accessibilityRole="button" disabled={!!deleting} onPress={() => showForm({})} style={styles.primary}>
                  <Text style={styles.primaryText}>Create Route</Text>
                </Pressable>
                {error && <Appear from={{ y: -4 }}><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text></Appear>}
                <Pressable accessibilityRole="button" disabled={loading || !!deleting} onPress={refresh} style={styles.secondary}>
                  <Text style={styles.secondaryText}>{error ? 'Retry loading routes' : 'Refresh routes'}</Text>
                </Pressable>
                {loading && <ActivityIndicator accessibilityLabel="Loading saved routes" color="#a8520e" />}
              </View>
            }
            ListEmptyComponent={!loading && !error ? <Appear from={loadIn} style={styles.empty}><Text style={styles.cardTitle}>No saved routes yet</Text><Text style={styles.hint}>Tap Create Route to plan your first journey.</Text></Appear> : undefined}
            renderItem={({ item, index }) => (
              <Appear from={loadIn} delay={Math.min(index, 6) * 40} style={styles.card}>
                <TransportModeIcon mode={item.mode} />
                <Text style={styles.cardTitle}>{place(item.start, 'Starting location')} → {place(item.destination, 'Final destination')}</Text>
                {item.waypoints.length > 0 && <Text style={styles.hint}>Via {item.waypoints.map((stop) => place(stop, 'Intermediate stop')).join(' → ')}</Text>}
                {item.startTime && <Text style={styles.hint}>{formatLeaving(item)}</Text>}
                <View style={styles.actions}>
                  {/* The route's construction sites and their alerts are all on the map. */}
                  {onView && (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Show the route from ${place(item.start, 'Starting location')} to ${place(item.destination, 'Final destination')} and its alerts on the map`} disabled={!!deleting} onPress={() => onView(item)} style={styles.show}>
                      <Text style={styles.secondaryText}>Map & alerts</Text>
                    </Pressable>
                  )}
                  <View style={styles.iconActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit route from ${place(item.start, 'Starting location')} to ${place(item.destination, 'Final destination')}`} disabled={loading || !!deleting} onPress={() => showForm({ route: item })} style={styles.edit} hitSlop={8}>
                      <MaterialIcons name="edit" size={22} color="#1f63c6" />
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Delete route from ${place(item.start, 'Starting location')} to ${place(item.destination, 'Final destination')}`} accessibilityState={{ disabled: loading || !!deleting, busy: deleting === item.id }} disabled={loading || !!deleting} onPress={() => confirmDelete(item, () => remove(item.id))} style={styles.delete} hitSlop={8}>
                      {deleting === item.id ? <ActivityIndicator size="small" color="#a52621" /> : <MaterialIcons name="delete-outline" size={24} color="#a52621" />}
                    </Pressable>
                  </View>
                </View>
              </Appear>
            )}
          />
        )}
      </Appear>
    </View>
  );
}

function confirmDelete(route: SavedRoute, onConfirm: () => void) {
  const title = 'Delete this route?';
  const body = `${place(route.start, 'Starting location')} → ${place(route.destination, 'Final destination')} and its alerts will be removed.`;
  // react-native-web's Alert.alert does nothing.
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${body}`)) onConfirm();
    return;
  }
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

/** Locations saved with only a coordinate have no label. */
function place(location: RouteLocation, fallback: string) {
  return location.label ?? fallback;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#f5f7f9' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#f5f7f9', borderTopLeftRadius: SHEET_RADIUS, borderTopRightRadius: SHEET_RADIUS, elevation: 12, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: -2 } },
  grip: { height: GRIP, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#c3ccd5' },
  // laid over the panel's top rather than above it, so the two can cross-fade
  launcher: { position: 'absolute', top: GRIP, left: 0, right: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 12, paddingTop: 4, justifyContent: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e1e6eb' },
  // The logo file is 960×170.
  brand: { width: 102, height: 18 },
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  show: { alignSelf: 'flex-start', paddingVertical: 14, paddingHorizontal: 12, backgroundColor: '#e9eef2', borderRadius: 10 },
  iconActions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  edit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#e3eefc' },
  delete: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  error: { color: '#a52621', lineHeight: 21 },
  empty: { paddingVertical: 40, gap: 10 },
});
