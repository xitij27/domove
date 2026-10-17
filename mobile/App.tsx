import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, BackHandler, Linking, NativeModules, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Compass, { type MapHandle } from './src/maps/Compass';
import GoogleSitesMap from './src/maps/GoogleSitesMap';
import { useFollowUser, useHasGyroscope, useLocationGranted } from './src/maps/location';
import { CASING_COLORS, LINE_COLORS } from './src/maps/routeOverlay';
import { COLORS, fetchSites, type Site, type Status } from './src/sites';
import RoutesManager, { SHEET_RADIUS } from './src/routes/RoutesManager';
import PlacePicker from './src/routes/PlacePicker';
import { TRANSPORT_MODES, type Coordinate, type PlacePick, type SavedRoute } from './src/routes/model';
import { useRouteOnMap } from './src/routes/useRouteOnMap';
import RouteAlerts, { siteAlert, useRouteAlerts } from './src/notifications/RouteAlerts';
import { startNotificationRuntime, useTappedSite } from './src/notifications/runtime';
import { loadTheme, PALETTES, saveTheme, type MapTheme } from './src/theme';

const LABELS: Record<Status, string> = { current: 'Current', planned: 'Planned' };

const THEMES: { theme: MapTheme; icon: 'light-mode' | 'dark-mode'; label: string }[] = [
  { theme: 'day', icon: 'light-mode', label: 'Day map' },
  { theme: 'night', icon: 'dark-mode', label: 'Night map' },
];
const TOGGLE_CELL = 42;
const TOGGLE_PAD = 3;

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

// Mapbox needs a development build; in Expo Go its native module is missing and importing it
// throws, which would redbox the whole app on launch, so never let that escape.
let MapboxSitesMap: typeof GoogleSitesMap | null = null;
if (NativeModules.RNMBXModule != null) {
  try {
    MapboxSitesMap = require('./src/maps/MapboxSitesMap').default;
  } catch {
    MapboxSitesMap = null;
  }
}

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
  const [routesOpen, setRoutesOpen] = useState(false);
  // The saved route drawn on the map, which then shows only the sites on its way.
  const [viewing, setViewing] = useState<SavedRoute | null>(null);
  const closeRoute = useCallback(() => setViewing(null), []);
  const routeDeleted = useCallback((id: string) => setViewing((route) => (route?.id === id ? null : route)), []);
  const routeUpdated = useCallback((updated: SavedRoute) => setViewing((route) => (route?.id === updated.id ? updated : route)), []);
  // A place in the route form being chosen on the map, which then has the screen to itself.
  const [picking, setPicking] = useState<PlacePick | null>(null);
  const endPick = useCallback(() => setPicking(null), []);
  const mapCovered = routesOpen && !picking;

  useEffect(() => startNotificationRuntime(), []);

  // A sheet raised over the route adds its handler after this one, so back lowers the sheet first.
  useEffect(() => {
    if (!viewing) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setViewing(null); return true; });
    return () => subscription.remove();
  }, [viewing]);

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
          {/* the raised routes sheet covers the map, so screen readers skip it */}
          <View style={styles.fill} importantForAccessibility={mapCovered ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={mapCovered}>
            <RadarMap route={viewing} onCloseRoute={closeRoute} picking={picking} onEndPick={endPick} />
          </View>
          <RoutesManager onOpenChange={setRoutesOpen} onViewRoute={setViewing} onRouteUpdated={routeUpdated} onRouteDeleted={routeDeleted} onPickOnMap={setPicking} hidden={!!picking} />
        </View>
      )}
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
      <StatusBar style="light" />
    </View>
  );
}

// memo: opening the routes sheet re-renders App, which shouldn't redraw the map and its pins.
const RadarMap = memo(function RadarMap({ route, onCloseRoute, picking, onEndPick }: {
  route: SavedRoute | null;
  onCloseRoute: () => void;
  picking: PlacePick | null;
  onEndPick: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState<Record<Status, boolean>>({ current: true, planned: true });
  const [selected, setSelected] = useState<Site | null>(null);
  const [mapboxOn, setMapboxOn] = useState(MapboxSitesMap != null);
  const [theme, setTheme] = useState(loadTheme);
  const palette = PALETTES[theme];
  const surface = { backgroundColor: palette.surface, borderColor: palette.border };
  // Not state: the map reports it on every frame of a turn, and only the compass needs it.
  const heading = useRef(new Animated.Value(0)).current;
  const map = useRef<MapHandle>(null);
  const [located, askLocation] = useLocationGranted();
  const gyroscope = useHasGyroscope();
  const [gyroWarned, setGyroWarned] = useState(false);

  const changeTheme = (next: MapTheme) => {
    setTheme(next);
    saveTheme(next);
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchSites()
      .then(setSites)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const routeOnMap = useRouteOnMap(route);
  // A place for a new route is chosen among every site, not only the shown route's.
  const onRoute = picking ? null : routeOnMap;
  const alerts = useRouteAlerts(route?.id ?? null);

  // Start turns the shown route's map into a navigation view, as in Google Maps: the camera follows the user,
  // tilted and turned the way they go, until Exit. It pauses while a place is chosen, which has the map to itself.
  const [started, setStarted] = useState(false);
  const navigating = started && !!onRoute;
  // Moving the map while navigating leaves the camera where the user put it, until they re-centre.
  const [following, setFollowing] = useState(true);
  const stopFollowing = useCallback(() => setFollowing(false), []);
  useFollowUser(map, route && navigating && following ? route.mode : null);

  const start = () => {
    const go = () => { setStarted(true); setFollowing(true); };
    if (located) {
      go();
      return;
    }
    askLocation().then((p) => {
      if (p.granted) go();
      else if (!p.canAskAgain) {
        Alert.alert('Location is off', 'To follow you along the route, allow this app to use your location in Settings.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => { Linking.openSettings(); } },
        ]);
      }
    }, () => {});
  };

  // Added after the route's own handler, so back exits navigation before it closes the route.
  useEffect(() => {
    if (!navigating) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setStarted(false); return true; });
    return () => subscription.remove();
  }, [navigating]);

  // The map's middle while choosing a place, where the pin is; null while the map moves.
  const [center, setCenter] = useState<Coordinate | null>(null);
  useEffect(() => {
    if (picking) map.current?.zoomTo(picking.initial).then(setCenter, () => {});
  }, [picking]);
  const endPick = useCallback(() => {
    setCenter(null);
    onEndPick();
  }, [onEndPick]);
  // On a route, only the sites on its way: none until the backend says which.
  const nearby = onRoute ? sites.filter((s) => onRoute.siteIds?.has(s.id)) : sites;
  const selectedAlert = alerts && selected ? siteAlert(alerts, selected.id) : null;
  // Keeps a route clear of the chips along the top, the controls on the right and the route card at the bottom.
  const routePadding = useMemo(() => ({ top: insets.top + 56, right: 72, bottom: 170, left: 24 }), [insets.top]);

  // A newly shown route starts without a site card, as the open one may be off its way, and without navigating.
  const [cardRoute, setCardRoute] = useState(route);
  if (route !== cardRoute) {
    setCardRoute(route);
    if (route) setSelected(null);
    setStarted(false);
  }

  // A tapped construction alert opens its site's card, once the sites have loaded.
  const tapped = useTappedSite();
  const openedTap = useRef<typeof tapped>(null);
  useEffect(() => {
    const site = tapped && tapped !== openedTap.current ? sites.find((s) => s.id === tapped.siteId) : undefined;
    if (!site) return;
    openedTap.current = tapped;
    // The site may lie off the route on show, so show every site again.
    if (onRoute && !onRoute.siteIds?.has(site.id)) onCloseRoute();
    setShown((current) => ({ ...current, [site.status]: true }));
    setSelected(site);
  }, [tapped, sites, onRoute, onCloseRoute]);

  const SitesMap = mapboxOn && MapboxSitesMap ? MapboxSitesMap : GoogleSitesMap;

  return (
    <View style={styles.fill}>
      <SitesMap
        ref={map}
        sites={nearby.filter((s) => shown[s.status])}
        onSelect={setSelected}
        theme={theme}
        onHeadingChange={(h) => heading.setValue(h)}
        // while choosing a place the routes sheet is hidden, leaving only the system bar over the map's bottom
        bottomInset={picking ? insets.bottom : SHEET_RADIUS}
        route={onRoute?.overlay ?? null}
        routePadding={routePadding}
        onCenterChange={picking ? setCenter : undefined}
        showUser={located}
        navigating={navigating}
        onUserMove={navigating && following ? stopFollowing : undefined}
      />

      <View style={[styles.overlay, { top: insets.top + 8 }]}>
        <View style={styles.legend}>
          {(Object.keys(LABELS) as Status[]).map((st) => (
            <Pressable
              key={st}
              accessibilityRole="switch"
              accessibilityState={{ checked: shown[st] }}
              onPress={() => setShown({ ...shown, [st]: !shown[st] })}
              style={[styles.chip, surface, !shown[st] && styles.chipOff]}
            >
              <View style={[styles.dot, { backgroundColor: COLORS[st] }]} />
              <Text style={{ color: palette.text }}>{LABELS[st]} ({nearby.filter((s) => s.status === st).length})</Text>
            </Pressable>
          ))}
          {loading && <ActivityIndicator color={palette.muted} style={[styles.chip, surface]} />}
          {/* the other map would open elsewhere than the pin, or than the user it follows */}
          {MapboxSitesMap && GOOGLE_OK && !picking && !navigating && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Map provider: ${mapboxOn ? 'Mapbox' : 'Google'}. Tap to switch.`}
              // the other map opens pointing north
              onPress={() => { setSelected(null); setMapboxOn(!mapboxOn); heading.setValue(0); }}
              style={[styles.chip, surface, styles.switch]}
            >
              <Text style={{ color: palette.text }}>{mapboxOn ? 'Mapbox' : 'Google'} ⇄</Text>
            </Pressable>
          )}
        </View>

        <ThemeToggle theme={theme} onChange={changeTheme} />
        {/* while navigating, north stays up until the user re-centres */}
        <Compass heading={heading} theme={theme} onPress={() => { if (navigating) setFollowing(false); map.current?.pointNorth(); }} />
      </View>

      {picking && <PlacePicker pick={picking} center={center} theme={theme} onDone={endPick} />}

      <View style={styles.bottom}>
        {navigating && !following && (
          <Pressable accessibilityRole="button" accessibilityHint="Follows you again, turning the map the way you go" onPress={() => setFollowing(true)} style={[styles.chip, surface, styles.recentre]}>
            <MaterialIcons name="navigation" size={18} color={LINE_COLORS[theme]} />
            <Text style={{ color: palette.text }}>Re-centre</Text>
          </Pressable>
        )}

        {error && !picking && (
          <Pressable style={[styles.card, surface]} onPress={load} accessibilityRole="button">
            <Text style={[styles.title, { color: palette.text }]}>Could not load construction sites</Text>
            <Text style={{ color: palette.muted }}>{error} — tap to retry</Text>
          </Pressable>
        )}

        {located && gyroscope === false && !gyroWarned && !picking && (
          <View style={[styles.card, surface]}>
            <View style={styles.routeHead}>
              <View style={styles.routeText}>
                <Text style={[styles.title, { color: palette.text }]}>No gyroscope in this phone</Text>
                <Text style={{ color: palette.muted }}>The arrow showing which way you face may be off or jumpy.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss the gyroscope warning" hitSlop={8} onPress={() => setGyroWarned(true)} style={styles.routeClose}>
                <MaterialIcons name="close" size={22} color={palette.muted} />
              </Pressable>
            </View>
          </View>
        )}

        {selected && !error && !picking && (
          <View style={[styles.card, surface]}>
            <Text style={{ color: palette.status[selected.status] }}>{LABELS[selected.status]}</Text>
            <Text style={[styles.title, { color: palette.text }]}>{selected.title}</Text>
            <Text style={{ color: palette.muted }}>{selected.period}</Text>
            <Text style={{ color: palette.muted }}>{[selected.district, selected.owner].filter(Boolean).join(' · ')}</Text>
            {selectedAlert && (
              <View style={styles.siteAlert}>
                <MaterialIcons name="notifications" size={16} color={palette.accent} />
                <Text style={{ color: palette.text }}>{selectedAlert}</Text>
              </View>
            )}
          </View>
        )}

        {route && onRoute && (
          <View style={[styles.card, surface]}>
            <View style={styles.routeHead}>
              {onRoute.error ? (
                <Pressable accessibilityRole="button" onPress={onRoute.retry} style={styles.routeText}>
                  <Text style={[styles.title, { color: palette.text }]}>{route.name}</Text>
                  <Text style={{ color: palette.status.current }}>{onRoute.error} — tap to retry</Text>
                </Pressable>
              ) : (
                <View style={styles.routeText}>
                  <Text style={[styles.title, { color: palette.text }]}>{route.name}</Text>
                  <Text style={{ color: palette.muted }}>{TRANSPORT_MODES[route.mode]} · {sitesOnWay(onRoute.siteIds && !loading && !error ? nearby.length : null)}</Text>
                </View>
              )}
              {navigating ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Stops following you and shows the whole route"
                  onPress={() => setStarted(false)}
                  style={[styles.navButton, { backgroundColor: palette.status.current }]}
                >
                  <Text style={[styles.navText, { color: CASING_COLORS[theme] }]}>Exit</Text>
                </Pressable>
              ) : (
                <>
                  {/* white or near-black on the route's blue, as the line's casing is */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint="Follows you along the route, turning the map the way you go"
                    onPress={start}
                    style={[styles.navButton, { backgroundColor: LINE_COLORS[theme] }]}
                  >
                    <MaterialIcons name="navigation" size={18} color={CASING_COLORS[theme]} />
                    <Text style={[styles.navText, { color: CASING_COLORS[theme] }]}>Start</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close the route and show every construction site"
                    hitSlop={8}
                    onPress={onCloseRoute}
                    style={styles.routeClose}
                  >
                    <MaterialIcons name="close" size={22} color={palette.muted} />
                  </Pressable>
                </>
              )}
            </View>
            {/* The route's alerts, next to the sites they are about; set before leaving, so out of the way while navigating. */}
            {alerts && !navigating && <RouteAlerts alerts={alerts} theme={theme} />}
          </View>
        )}
      </View>

      <StatusBar style={theme === 'night' ? 'light' : 'dark'} />
    </View>
  );
});

/** How many sites lie on a route's way; null while that is still unknown. */
function sitesOnWay(count: number | null) {
  if (count === null) return 'Checking for construction sites…';
  if (count === 0) return 'No construction sites on the way';
  return `${count} construction ${count === 1 ? 'site' : 'sites'} on the way`;
}

// Both options stay visible, so the current mode is never a guess; the highlight slides to the one picked.
function ThemeToggle({ theme, onChange }: { theme: MapTheme; onChange: (theme: MapTheme) => void }) {
  const palette = PALETTES[theme];
  const index = THEMES.findIndex((t) => t.theme === theme);
  const slide = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    Animated.spring(slide, { toValue: index, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [slide, index]);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Map appearance"
      style={[styles.toggle, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <Animated.View
        style={[
          styles.toggleThumb,
          { backgroundColor: palette.thumb, transform: [{ translateY: Animated.multiply(slide, TOGGLE_CELL) }] },
        ]}
      />
      {THEMES.map((t) => (
        <Pressable
          key={t.theme}
          accessibilityRole="radio"
          accessibilityLabel={t.label}
          accessibilityState={{ checked: t.theme === theme }}
          onPress={() => onChange(t.theme)}
          android_ripple={{ color: palette.border, borderless: true, radius: TOGGLE_CELL / 2 }}
          style={styles.toggleCell}
        >
          <MaterialIcons name={t.icon} size={22} color={t.theme === theme ? palette.accent : palette.muted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // box-none: the gaps between the controls still pan the map
  overlay: { position: 'absolute', left: 12, right: 12, gap: 10, pointerEvents: 'box-none' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, pointerEvents: 'box-none' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 6, elevation: 2, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  chipOff: { opacity: 0.45 },
  switch: { marginLeft: 'auto' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  // map controls go top right, as in Google and Apple Maps
  toggle: { alignSelf: 'flex-end', padding: TOGGLE_PAD, borderRadius: TOGGLE_CELL / 2 + TOGGLE_PAD, borderWidth: StyleSheet.hairlineWidth, elevation: 2, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  toggleThumb: { position: 'absolute', top: TOGGLE_PAD, left: TOGGLE_PAD, width: TOGGLE_CELL, height: TOGGLE_CELL, borderRadius: TOGGLE_CELL / 2 },
  toggleCell: { width: TOGGLE_CELL, height: TOGGLE_CELL, alignItems: 'center', justifyContent: 'center' },
  // no safe-area inset at the bottom: the routes sheet below the map already clears it, but its rounded top
  // reaches SHEET_RADIUS over the map
  bottom: { position: 'absolute', left: 12, right: 12, bottom: SHEET_RADIUS + 12, gap: 10, pointerEvents: 'box-none' },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4, elevation: 4, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  routeHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  siteAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  routeText: { flex: 1, gap: 4 },
  routeClose: { padding: 4 },
  navButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  navText: { fontSize: 15, fontWeight: '600' },
  recentre: { alignSelf: 'flex-start', paddingVertical: 10 },
  title: { fontSize: 16, fontWeight: '600' },
  crash: { backgroundColor: '#111', paddingHorizontal: 16, gap: 8 },
  crashTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  crashHint: { color: '#aaa' },
  crashText: { color: '#eee', fontFamily: Platform.select({ android: 'monospace', default: 'Menlo' }), fontSize: 11 },
  crashButton: { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  crashButtonText: { fontWeight: '600' },
});
