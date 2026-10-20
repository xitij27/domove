import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, BackHandler, Image, KeyboardAvoidingView, Linking, NativeModules, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Compass, { type MapHandle } from './src/maps/Compass';
import GoogleSitesMap from './src/maps/GoogleSitesMap';
import { useHasGyroscope, useLocationGranted } from './src/maps/location';
import { CASING_COLORS, LINE_COLORS } from './src/maps/routeOverlay';
import { signOf, SIGNS } from './src/maps/signs';
import { fetchSites, type Site, type Status } from './src/sites';
import RoutesManager, { SHEET_RADIUS } from './src/routes/RoutesManager';
import PlacePicker from './src/routes/PlacePicker';
import { sitesOnWay, type Coordinate, type PlacePick, type SavedRoute, type TransportMode } from './src/routes/model';
import { useRouteOnMap } from './src/routes/useRouteOnMap';
import { routesRepository } from './src/routes/api';
import { googleMapsDirectionsUrl } from './src/routes/googleMaps';
import DetourSummary from './src/detours/DetourSummary';
import { siteName, wayRating } from './src/detours/text';
import RouteAlerts, { siteAlert, useRouteAlerts } from './src/notifications/RouteAlerts';
import { fetchObstacles } from './src/notifications/obstacles';
import { constructionNotifications, notificationDriver, sendAlertSoon, startNotificationRuntime, useTappedSite } from './src/notifications/runtime';
import { DemoButton, DemoCaption } from './src/demo/Demo';
import { ALERT_DELAY, ALERT_STEP, pickDemo, STEPS, type DemoRun, type Scene } from './src/demo/demo';
import HowScoresWork from './src/ratings/HowScoresWork';
import ImpactScore from './src/ratings/ImpactScore';
import { highOnRoute } from './src/ratings/model';
import { useRouteRatings, useSiteRating } from './src/ratings/useRatings';
import { QuizButton, QuizQuestion, useQuiz } from './src/quiz/Quiz';
import { loadTheme, PALETTES, saveTheme, type MapTheme } from './src/theme';
import { DURATION, Fade, FadeTo, Reveal, useTween } from './src/motion';
import { useWeather, WeatherButton, WeatherForecast } from './src/weather/Weather';
import { strings, useStrings } from './src/i18n';
import Settings, { SettingsButton } from './src/settings/Settings';
import { androidUpdater } from './src/updates/updater';

const STATUSES: Status[] = ['current', 'planned'];

const THEMES: { theme: MapTheme; icon: 'light-mode' | 'dark-mode'; label: 'dayMap' | 'nightMap' }[] = [
  { theme: 'day', icon: 'light-mode', label: 'dayMap' },
  { theme: 'night', icon: 'dark-mode', label: 'nightMap' },
];
const TOGGLE_CELL = 42;
const TOGGLE_PAD = 3;
// A status chip's opacity while its sites are hidden.
const CHIP_OFF = 0.45;
// Between the cards over the bottom of the map.
const CARD_GAP = 10;

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
            <RadarMap route={viewing} onShowRoute={setViewing} onCloseRoute={closeRoute} picking={picking} onEndPick={endPick} />
          </View>
          <RoutesManager onOpenChange={setRoutesOpen} onViewRoute={setViewing} onRouteUpdated={routeUpdated} onRouteDeleted={routeDeleted} onPickOnMap={setPicking} hidden={!!picking} />
        </View>
      )}
    </SafeAreaProvider>
  );
}

function CrashReport({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const t = useStrings();
  return (
    <View style={[styles.fill, styles.crash, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <Text style={styles.crashTitle}>{t.app.crashTitle}</Text>
      <Text style={styles.crashHint}>{t.app.crashHint}</Text>
      <ScrollView style={styles.fill}>
        <Text selectable style={styles.crashText}>{text}</Text>
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.crashButton}>
        <Text style={styles.crashButtonText}>{t.app.crashClear}</Text>
      </Pressable>
      <StatusBar style="light" />
    </View>
  );
}

// memo: opening the routes sheet re-renders App, which shouldn't redraw the map and its pins.
const RadarMap = memo(function RadarMap({ route, onShowRoute, onCloseRoute, picking, onEndPick }: {
  route: SavedRoute | null;
  /** For the demo, which shows a saved route by itself. */
  onShowRoute: (route: SavedRoute) => void;
  onCloseRoute: () => void;
  picking: PlacePick | null;
  onEndPick: () => void;
}) {
  const insets = useSafeAreaInsets();
  // memo above keeps out its parent's renders, not this: a new language words the whole map screen again
  const t = useStrings();
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
  const located = useLocationGranted();
  const gyroscope = useHasGyroscope();
  const [gyroWarned, setGyroWarned] = useState(false);
  const quiz = useQuiz();
  const [quizOpen, setQuizOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { weather, failed: weatherFailed, reload: reloadWeather } = useWeather();
  // The forecast card takes the site card's place, so only one of them is open.
  const [forecastOpen, setForecastOpen] = useState(false);
  const selectSite = useCallback((site: Site | null) => {
    setSelected(site);
    if (site) setForecastOpen(false);
  }, []);
  const toggleForecast = () => {
    if (!weather) {
      reloadWeather();
      return;
    }
    setSelected(null);
    setForecastOpen(!forecastOpen);
  };

  // Added when the forecast opens, so back closes it before anything under it.
  useEffect(() => {
    if (!forecastOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setForecastOpen(false); return true; });
    return () => subscription.remove();
  }, [forecastOpen]);

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
  // A site's impact score is for the shown route's mode at its leaving time, else for the mode picked on the card, now.
  const [scoreMode, setScoreMode] = useState<TransportMode>('car');
  const [explaining, setExplaining] = useState(false);
  const routeRatings = useRouteRatings(onRoute && route ? route.id : null);
  const siteRating = useSiteRating(selected && !onRoute ? selected.id : null, scoreMode);
  // Once the way around construction is found, the route's scores count for the way shown, not the router's first line.
  const detours = onRoute?.detours ?? null;
  const planned = detours?.status === 'ready' ? detours : null;
  const way = planned && onRoute ? planned.plan.options[onRoute.chosen] : null;
  const googleMapsUrl = useMemo(() => {
    if (!route) return null;
    if (planned && way) {
      return googleMapsDirectionsUrl(route, way, planned.plan.direct) ?? googleMapsDirectionsUrl(route);
    }
    return googleMapsDirectionsUrl(route);
  }, [route, planned, way]);
  const openInGoogleMaps = useCallback(() => {
    if (!googleMapsUrl) return;
    Linking.openURL(googleMapsUrl).catch(() => Alert.alert(strings().app.googleMapsFailed, strings().app.googleMapsRetry));
  }, [googleMapsUrl]);
  const selectedOnWay = planned && onRoute && selected ? planned.scores.get(selected.id) : undefined;
  const wayScore = planned && onRoute && selectedOnWay ? wayRating(planned.plan, onRoute.chosen, selectedOnWay) : null;
  // The card counts the sites on the original route, the reason any way around exists; the chosen way's are in DetourSummary.
  const original = planned && onRoute ? planned.plan.direct : null;
  const highCount = original ? original.sites.filter((s) => s.effectiveRating >= 7).length
    : routeRatings.value ? highOnRoute(routeRatings.value.values()) : 0;
  const nameOf = useCallback((siteId: string) => siteName(sites.find((s) => s.id === siteId)?.title), [sites]);

  // The quiz keeps its place while it is closed, and steps aside while choosing a place.
  const quizShown = quizOpen && !picking;
  useEffect(() => {
    if (!quizShown) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setQuizOpen(false); return true; });
    return () => subscription.remove();
  }, [quizShown]);

  // The guided demo: each step sets the whole screen, so Back works as well as Next.
  const [demo, setDemo] = useState<DemoRun | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoNote, setDemoNote] = useState<string | null>(null);
  const applyScene = (run: DemoRun, scene: Scene) => {
    if (scene.route) onShowRoute(run.route);
    else onCloseRoute();
    selectSite(scene.site ? run.site : null);
    setForecastOpen(!!scene.forecast);
    setQuizOpen(!!scene.quiz);
  };
  const showStep = (run: DemoRun, step: number) => {
    const { scene } = STEPS[step];
    setDemo({ ...run, step });
    setDemoNote(null);
    applyScene(run, scene);
    if (scene.action === 'alerts') alerts?.save({ preference: 'ONE_DAY_BEFORE', notificationTime: run.before.notificationTime });
    if (scene.action === 'send') sendAlertSoon(run.obstacle, ALERT_DELAY).catch((e: unknown) => setDemoNote(e instanceof Error ? e.message : String(e)));
  };
  const startDemo = () => {
    setDemoBusy(true);
    // Asked now, so the phone's question doesn't interrupt the alert step.
    Promise.all([fetchObstacles(), routesRepository.list(), notificationDriver.permission(true)])
      .then(async ([obstacles, routes]) => {
        const picked = pickDemo(obstacles, routes, sites);
        if (!picked) {
          Alert.alert(t.app.noDemoRoute, t.app.noDemoRouteBody);
          return;
        }
        showStep({ ...picked, step: 0, before: await constructionNotifications.getSettings(picked.route.id) }, 0);
      })
      .catch((e: unknown) => Alert.alert(t.app.demoFailed, e instanceof Error ? e.message : String(e)))
      .finally(() => setDemoBusy(false));
  };
  const endDemo = () => {
    if (!demo) return;
    // The demo's alert choice was only for show.
    constructionNotifications.setSettings(demo.route.id, demo.before).catch(() => {});
    setDemo(null);
    applyScene(demo, {});
  };
  // The ways around construction take seconds to find, so the step's way is picked when they arrive, too.
  const demoWay = demo ? STEPS[demo.step].scene.way ?? 0 : null;
  const chooseWay = onRoute?.choose;
  useEffect(() => {
    if (demoWay !== null && planned && demoWay < planned.plan.options.length) chooseWay?.(demoWay);
  }, [demoWay, planned, chooseWay]);
  // The demo's card sits under the chips, however many lines they wrap onto.
  const [legendHeight, setLegendHeight] = useState(0);

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

  // A newly shown route starts without a site card, as the open one may be off its way.
  const [cardRoute, setCardRoute] = useState(route);
  if (route !== cardRoute) {
    setCardRoute(route);
    if (route) setSelected(null);
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
    selectSite(site);
    // The demo's alert step ends with this tap.
    setDemo((run) => (run?.step === ALERT_STEP ? { ...run, step: ALERT_STEP + 1 } : run));
  }, [tapped, sites, onRoute, onCloseRoute, selectSite]);

  const SitesMap = mapboxOn && MapboxSitesMap ? MapboxSitesMap : GoogleSitesMap;

  return (
    <View style={styles.fill}>
      <SitesMap
        ref={map}
        sites={nearby.filter((s) => shown[s.status])}
        onSelect={selectSite}
        theme={theme}
        onHeadingChange={(h) => heading.setValue(h)}
        // while choosing a place the routes sheet is hidden, leaving only the system bar over the map's bottom
        bottomInset={picking ? insets.bottom : SHEET_RADIUS}
        route={onRoute?.overlay ?? null}
        routePadding={routePadding}
        onPickAlternative={onRoute?.chooseAlternative}
        onCenterChange={picking ? setCenter : undefined}
        showUser={located}
      />

      <View style={[styles.overlay, { top: insets.top + 8 }]}>
        <View style={styles.legend} onLayout={(e) => setLegendHeight(e.nativeEvent.layout.height)}>
          {STATUSES.map((st) => (
            <FadeTo key={st} opacity={shown[st] ? 1 : CHIP_OFF}>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: shown[st] }}
                onPress={() => setShown({ ...shown, [st]: !shown[st] })}
                style={[styles.chip, surface]}
              >
                {/* the roadworks sign as current and planned sites show it */}
                <Image source={SIGNS.other[st]} style={styles.chipSign} />
                <Text style={{ color: palette.text }}>{t.status[st]} ({nearby.filter((s) => s.status === st).length})</Text>
              </Pressable>
            </FadeTo>
          ))}
          <Fade>{loading && <ActivityIndicator color={palette.muted} style={[styles.chip, surface]} />}</Fade>
          {/* the other map would open elsewhere than the pin */}
          <Fade style={styles.switch}>
            {MapboxSitesMap && GOOGLE_OK && !picking && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.app.mapProvider(mapboxOn ? 'Mapbox' : 'Google')}
                // the other map opens pointing north
                onPress={() => { setSelected(null); setMapboxOn(!mapboxOn); heading.setValue(0); }}
                style={[styles.chip, surface]}
              >
                <Text style={{ color: palette.text }}>{mapboxOn ? 'Mapbox' : 'Google'} ⇄</Text>
              </Pressable>
            )}
          </Fade>
        </View>

        <ThemeToggle theme={theme} onChange={changeTheme} />
        <Compass heading={heading} theme={theme} onPress={() => map.current?.pointNorth()} />
        {/* choosing a place has the map to itself */}
        <Fade>{!picking && <WeatherButton weather={weather} failed={weatherFailed} open={forecastOpen} theme={theme} onPress={toggleForecast} />}</Fade>
        {/* last of the round controls, so it sits under the weather */}
        <Fade>{!picking && <QuizButton open={quizOpen} theme={theme} onPress={() => setQuizOpen(!quizOpen)} />}</Fade>
        <Fade>{!picking && <DemoButton running={!!demo} busy={demoBusy} theme={theme} onPress={demo ? endDemo : startDemo} />}</Fade>
        {/* the language, and updating the app */}
        <Fade>{!picking && <SettingsButton theme={theme} onPress={() => setSettingsOpen(true)} />}</Fade>
      </View>

      {/* under the chips, clear of the round controls on the right */}
      <Fade style={[styles.demo, { top: insets.top + 8 + legendHeight + CARD_GAP }]}>
        {demo && !picking && (
          <View style={[styles.card, surface]}>
            <DemoCaption
              step={demo.step}
              note={demoNote}
              theme={theme}
              onBack={() => showStep(demo, demo.step - 1)}
              onNext={() => showStep(demo, demo.step + 1)}
              onExit={endDemo}
            />
          </View>
        )}
      </Fade>

      <Fade style={StyleSheet.absoluteFill}>
        {picking && <PlacePicker pick={picking} center={center} theme={theme} onDone={endPick} />}
      </Fade>

      {/* lifts the cards over the keyboard while a quiz answer is typed */}
      <KeyboardAvoidingView behavior="padding" style={styles.bottom}>

        <Reveal space={CARD_GAP}>
          {error && !picking && (
            <Pressable style={[styles.card, surface]} onPress={load} accessibilityRole="button">
              <Text style={[styles.title, { color: palette.text }]}>{t.app.sitesFailed}</Text>
              <Text style={{ color: palette.muted }}>{t.common.tapToRetry(error)}</Text>
            </Pressable>
          )}
        </Reveal>

        <Reveal space={CARD_GAP}>
          {located && gyroscope === false && !gyroWarned && !picking && (
            <View style={[styles.card, surface]}>
              <View style={styles.routeHead}>
                <View style={styles.routeText}>
                  <Text style={[styles.title, { color: palette.text }]}>{t.app.noGyroscope}</Text>
                  <Text style={{ color: palette.muted }}>{t.app.noGyroscopeBody}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={t.app.dismissGyroscope} hitSlop={8} onPress={() => setGyroWarned(true)} style={styles.routeClose}>
                  <MaterialIcons name="close" size={22} color={palette.muted} />
                </Pressable>
              </View>
            </View>
          )}
        </Reveal>

        <Reveal space={CARD_GAP}>
          {forecastOpen && weather && !picking && (
            <View style={[styles.card, surface]}>
              <WeatherForecast weather={weather} theme={theme} onClose={() => setForecastOpen(false)} />
            </View>
          )}
        </Reveal>

        <Reveal space={CARD_GAP}>
          {quizShown && (
            <View style={[styles.card, surface]}>
              <QuizQuestion quiz={quiz} theme={theme} onClose={() => setQuizOpen(false)} />
            </View>
          )}
        </Reveal>

        <Reveal space={CARD_GAP}>
          {selected && !error && !picking && (
            <View style={[styles.card, surface]}>
              <View style={styles.siteKind}>
                <Image source={signOf(selected)} style={styles.siteSign} />
                <Text style={{ color: palette.status[selected.status] }}>{t.status[selected.status]}</Text>
                <Text style={[styles.siteClosure, { color: palette.muted }]}>· {t.closures[selected.closure]}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={t.app.closeSite} hitSlop={8} onPress={() => setSelected(null)} style={styles.routeClose}>
                  <MaterialIcons name="close" size={22} color={palette.muted} />
                </Pressable>
              </View>
              <Text style={[styles.title, { color: palette.text }]}>{selected.title}</Text>
              <Text style={{ color: palette.muted }}>{selected.period}</Text>
              <Text style={{ color: palette.muted }}>{[selected.district, selected.owner].filter(Boolean).join(' · ')}</Text>
              {selectedAlert && (
                <View style={styles.siteAlert}>
                  <MaterialIcons name="notifications" size={16} color={palette.accent} />
                  <Text style={{ color: palette.text }}>{selectedAlert}</Text>
                </View>
              )}
              {onRoute && route ? (
                <ImpactScore
                  rating={wayScore ?? routeRatings.value?.get(selected.id) ?? null}
                  loading={routeRatings.loading}
                  error={routeRatings.error}
                  onRetry={routeRatings.retry}
                  mode={route.mode}
                  theme={theme}
                  onExplain={() => setExplaining(true)}
                />
              ) : (
                <ImpactScore
                  rating={siteRating.value}
                  loading={siteRating.loading}
                  error={siteRating.error}
                  onRetry={siteRating.retry}
                  mode={scoreMode}
                  onModeChange={setScoreMode}
                  theme={theme}
                  onExplain={() => setExplaining(true)}
                />
              )}
            </View>
          )}
        </Reveal>

        <Reveal space={CARD_GAP}>
          {route && onRoute && (
            <View style={[styles.card, styles.routeCard, surface]}>
              <View style={styles.routeHead}>
                {onRoute.error ? (
                  <Pressable accessibilityRole="button" onPress={onRoute.retry} style={styles.routeText}>
                    <Text style={[styles.title, { color: palette.text }]}>{route.name}</Text>
                    <Text style={{ color: palette.status.current }}>{t.common.tapToRetry(onRoute.error)}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.routeText}>
                    <Text style={[styles.title, { color: palette.text }]}>{route.name}</Text>
                    <Text style={{ color: palette.muted }}>
                      {t.modes[route.mode]} · {sitesOnWay(original ? original.sites.length : onRoute.siteIds && !loading && !error ? nearby.length : null)}
                      {highCount > 0 ? ` · ${t.app.highImpact(highCount)}` : ''}
                    </Text>
                  </View>
                )}
                {/* The app does no navigation itself: Google Maps takes the way shown from here.
                    White or near-black on the route's blue, as the line's casing is. */}
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={t.detours.openInGoogleMaps}
                  accessibilityState={{ disabled: !googleMapsUrl }}
                  disabled={!googleMapsUrl}
                  onPress={openInGoogleMaps}
                  style={[styles.navButton, { backgroundColor: LINE_COLORS[theme], opacity: googleMapsUrl ? 1 : 0.55 }]}
                >
                  <MaterialIcons name="open-in-new" size={18} color={CASING_COLORS[theme]} />
                  <Text style={[styles.navText, { color: CASING_COLORS[theme] }]}>{t.app.googleMaps}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.app.closeRoute}
                  hitSlop={8}
                  onPress={onCloseRoute}
                  style={styles.routeClose}
                >
                  <MaterialIcons name="close" size={22} color={palette.muted} />
                </Pressable>
              </View>
              {!googleMapsUrl && <Text style={[styles.googleStops, { color: palette.muted }]}>{t.detours.googleStops}</Text>}
              {/* The way around construction and the others to pick. */}
              <Reveal space={8} clip>
                <DetourSummary
                  detours={onRoute.detours}
                  chosen={onRoute.chosen}
                  onChoose={onRoute.choose}
                  onRetry={onRoute.retryDetours}
                  nameOf={nameOf}
                  theme={theme}
                />
              </Reveal>
              {/* The route's alerts, next to the sites they are about. */}
              <Reveal space={4} clip>{alerts && <RouteAlerts alerts={alerts} theme={theme} />}</Reveal>
            </View>
          )}
        </Reveal>
      </KeyboardAvoidingView>

      <HowScoresWork visible={explaining} onClose={() => setExplaining(false)} theme={theme} />
      {/* only Android installs a downloaded release; the APK is the only build there is */}
      <Settings visible={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} updater={Platform.OS === 'android' ? androidUpdater : undefined} />
      <StatusBar style={theme === 'night' ? 'light' : 'dark'} />
    </View>
  );
});

// Both options stay visible, so the current mode is never a guess; the highlight slides to the one picked.
function ThemeToggle({ theme, onChange }: { theme: MapTheme; onChange: (theme: MapTheme) => void }) {
  const palette = PALETTES[theme];
  const words = useStrings().app;
  const index = THEMES.findIndex((t) => t.theme === theme);
  const slide = useTween(index, DURATION.long);
  const offset = useMemo(() => Animated.multiply(slide, TOGGLE_CELL), [slide]);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={words.mapAppearance}
      style={[styles.toggle, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <Animated.View
        style={[
          styles.toggleThumb,
          { backgroundColor: palette.thumb, transform: [{ translateY: offset }] },
        ]}
      />
      {THEMES.map((t) => (
        <Pressable
          key={t.theme}
          accessibilityRole="radio"
          accessibilityLabel={words[t.label]}
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
  switch: { marginLeft: 'auto' },
  // as wide as the route padding leaves room for, left of the round controls
  demo: { position: 'absolute', left: 12, right: 72 },
  chipSign: { width: 20, height: 20 },
  // map controls go top right, as in Google and Apple Maps
  toggle: { alignSelf: 'flex-end', padding: TOGGLE_PAD, borderRadius: TOGGLE_CELL / 2 + TOGGLE_PAD, borderWidth: StyleSheet.hairlineWidth, elevation: 2, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  toggleThumb: { position: 'absolute', top: TOGGLE_PAD, left: TOGGLE_PAD, width: TOGGLE_CELL, height: TOGGLE_CELL, borderRadius: TOGGLE_CELL / 2 },
  toggleCell: { width: TOGGLE_CELL, height: TOGGLE_CELL, alignItems: 'center', justifyContent: 'center' },
  // no safe-area inset at the bottom: the routes sheet below the map already clears it, but its rounded top
  // reaches SHEET_RADIUS over the map. No gap: each card brings its own space above it, which grows and shrinks with it.
  bottom: { position: 'absolute', left: 12, right: 12, bottom: SHEET_RADIUS + 12, pointerEvents: 'box-none' },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4, elevation: 4, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  // its alerts row brings its own space, as it opens and closes
  routeCard: { gap: 0 },
  routeHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  siteAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  siteKind: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // takes the row's spare width, so the close button sits at the card's right
  siteClosure: { flex: 1 },
  siteSign: { width: 24, height: 24 },
  routeText: { flex: 1, gap: 4 },
  routeClose: { padding: 4 },
  navButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  navText: { fontSize: 15, fontWeight: '600' },
  googleStops: { fontSize: 11, marginTop: 6 },
  title: { fontSize: 16, fontWeight: '600' },
  crash: { backgroundColor: '#111', paddingHorizontal: 16, gap: 8 },
  crashTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  crashHint: { color: '#aaa' },
  crashText: { color: '#eee', fontFamily: Platform.select({ android: 'monospace', default: 'Menlo' }), fontSize: 11 },
  crashButton: { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  crashButtonText: { fontWeight: '600' },
});
