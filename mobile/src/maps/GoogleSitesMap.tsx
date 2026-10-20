import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import MapView, { Marker, Polyline, type MapViewProps } from 'react-native-maps';
import { useStrings } from '../i18n';
import type { Coordinate } from '../routes/model';
import type { Site } from '../sites';
import type { MapTheme } from '../theme';
import { MOVE_MS, POINT_NORTH_MS, STREET_ZOOM, type MapHandle } from './Compass';
import { useUserPosition } from './location';
import { FOLLOW_PITCH, FOLLOW_TOP, UNFOLLOW_MS } from './navigation';
import { ALTERNATIVE_COLORS, CASING_COLORS, LINE_COLORS, STOP_COLORS, type RouteOverlay, type RoutePadding } from './routeOverlay';
import { signOf, stackingOf } from './signs';

const DORTMUND = { latitude: 51.5136, longitude: 7.4653, latitudeDelta: 0.22, longitudeDelta: 0.22 };

// Dark base so construction pins stand out.
const DARK_STYLE: MapViewProps['customMapStyle'] = [
  { elementType: 'geometry', stylers: [{ color: '#1b2029' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7d8799' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1b2029' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3442' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#37404f' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#465163' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#2a3a52' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e131b' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#1a2421' }] },
];

// Google's default look, minus the clutter the dark style hides as well. Always passed explicitly: dropping the
// style prop would leave the dark one in place.
const LIGHT_STYLE: MapViewProps['customMapStyle'] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

const STYLES: Record<MapTheme, MapViewProps['customMapStyle']> = { day: LIGHT_STYLE, night: DARK_STYLE };

export default function GoogleSitesMap({ sites, onSelect, theme, onHeadingChange, bottomInset, route, routePadding, onPickAlternative, onCenterChange, showUser, navigating, onUserMove, ref }: {
  sites: Site[];
  onSelect: (site: Site | null) => void;
  theme: MapTheme;
  onHeadingChange: (heading: number) => void;
  bottomInset: number; // covered by what lies over the map's bottom edge
  route: RouteOverlay | null;
  routePadding: RoutePadding; // on top of bottomInset
  /** A grey alternative of the route was tapped, by its index. */
  onPickAlternative?: (index: number) => void;
  /** While set, a place is being chosen: the map reports where its middle settles (null while it moves), and a tap moves the middle there. */
  onCenterChange?: (center: Coordinate | null) => void;
  showUser: boolean; // location is allowed
  navigating: boolean; // the camera is on the user, so the route isn't brought into view meanwhile
  /** While set, the camera follows the user, and this reports that they moved the map themselves (not on Apple Maps, which doesn't tell). */
  onUserMove?: () => void;
  ref?: Ref<MapHandle>;
}) {
  const t = useStrings();
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const { height } = useWindowDimensions();
  // The camera has followed the user since the route was last brought into view.
  const followed = useRef(false);
  useImperativeHandle(ref, () => ({
    pointNorth: () => map.current?.animateCamera({ heading: 0 }, { duration: POINT_NORTH_MS }),
    zoomTo: async (center) => {
      const at = center ?? (await map.current!.getCamera()).center;
      // zoom for Google, altitude for Apple Maps on iOS
      map.current?.animateCamera({ center: at, zoom: STREET_ZOOM, altitude: 1000 }, { duration: MOVE_MS });
      return at;
    },
    // the map's top padding puts the user low on screen
    follow: ({ center, heading, zoom, ms }) => {
      followed.current = true;
      map.current?.animateCamera({ center, ...(heading === null ? {} : { heading }), pitch: FOLLOW_PITCH, zoom, altitude: altitudeAt(zoom) }, { duration: ms });
    },
  }), []);

  // Brings a route into view when it opens, again when its routed path or its ways around replace the line drawn, and
  // after navigating; not when another way is picked. Fitting before the map has a size fails, so wait for it.
  const fit = route?.fit ?? null;
  useEffect(() => {
    if (!ready || navigating) return;
    let wait = 0;
    if (followed.current) {
      followed.current = false;
      // flat and north up again, before the overview
      map.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: UNFOLLOW_MS });
      wait = UNFOLLOW_MS;
    }
    if (!fit) return;
    const bringIntoView = () => map.current?.fitToCoordinates(fit, { edgePadding: routePadding, animated: true });
    if (!wait) {
      bringIntoView();
      return;
    }
    const timer = setTimeout(bringIntoView, wait);
    return () => clearTimeout(timer);
  }, [ready, fit, routePadding, navigating]);

  // The region events carry no heading, so ask the map for it on every frame of a gesture or animation.
  // Its camera centre is also exact where the region's middle is not, as on a tilted map.
  const readCamera = (settled: boolean) => {
    map.current?.getCamera().then(
      (camera) => {
        onHeadingChange(camera.heading);
        if (settled) onCenterChange?.(camera.center);
      },
      () => {}, // the map is gone, e.g. right after switching to Mapbox
    );
  };

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={DORTMUND}
      customMapStyle={STYLES[theme]} // Android (Google); iOS uses Apple Maps, styled by userInterfaceStyle
      userInterfaceStyle={theme === 'night' ? 'dark' : 'light'}
      showsCompass={false} // ours replaces it
      // shortcut: Apple Maps can't turn a marker, so iOS shows its own dot without the facing arrow; draw one turned by heading minus the map's heading if iOS users need it.
      showsUserLocation={showUser && Platform.OS === 'ios'}
      showsMyLocationButton={false}
      // keeps the Google logo in sight; while choosing a place, the top padding keeps the centre under the pin mid-map,
      // and while navigating it puts the user low on screen
      mapPadding={{ top: navigating ? height * FOLLOW_TOP : onCenterChange ? bottomInset : 0, right: 0, bottom: bottomInset, left: 0 }}
      onRegionChange={(_region, { isGesture }) => {
        if (isGesture) onUserMove?.();
        onCenterChange?.(null);
        readCamera(false);
      }}
      onRegionChangeComplete={() => readCamera(true)}
      onMapReady={() => setReady(true)}
      onPress={(e) => {
        if (onCenterChange) map.current?.animateCamera({ center: e.nativeEvent.coordinate }, { duration: MOVE_MS });
        else if (e.nativeEvent.action !== 'marker-press') onSelect(null);
      }}
    >
      {/* under the way picked, so it stays on top where they share streets */}
      {route?.alternatives.map((path, index) => (
        <Polyline
          key={`alternative-${index}`}
          coordinates={path}
          strokeWidth={5}
          strokeColor={ALTERNATIVE_COLORS[theme]}
          zIndex={0}
          tappable
          onPress={() => onPickAlternative?.(index)}
        />
      ))}
      {route && <Polyline coordinates={route.path} strokeWidth={7} strokeColor={CASING_COLORS[theme]} zIndex={1} />}
      {route && <Polyline coordinates={route.path} strokeWidth={4} strokeColor={LINE_COLORS[theme]} zIndex={2} />}
      {sites.map((s) => (
        <Marker
          key={s.id}
          coordinate={s.coordinate}
          image={signOf(s)}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={stackingOf(s) - 10} // under the route's stops (0) and the user's dot (3)
          onPress={() => onSelect(s)}
        />
      ))}
      {showUser && Platform.OS === 'android' && <UserMarker />}
      {route && <Marker coordinate={route.start.coordinate} pinColor={STOP_COLORS.start} title={t.map.start} description={route.start.label ?? undefined} />}
      {route?.stops.map((stop, index) => (
        <Marker key={index} coordinate={stop.coordinate} pinColor={STOP_COLORS.stop} title={t.map.stop(index + 1)} description={stop.label ?? undefined} />
      ))}
      {route && <Marker coordinate={route.destination.coordinate} pinColor={STOP_COLORS.destination} title={t.map.destination} description={route.destination.label ?? undefined} />}
    </MapView>
  );
}

/** How high Apple Maps on iOS puts the camera for a Google zoom level: 1000 m at street level, half that one level closer. */
function altitudeAt(zoom: number) {
  return 1000 * 2 ** (STREET_ZOOM - zoom);
}

const USER_BLUE = '#1a73e8';

// Google's own location dot doesn't follow the compass. Its own component, so a turn of the phone redraws only this marker.
function UserMarker() {
  const t = useStrings();
  const user = useUserPosition();
  if (!user) return null;
  return (
    <Marker
      coordinate={user.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      flat // lies on the map and turns with it, so its rotation counts from north
      rotation={user.heading ?? 0}
      zIndex={3}
      title={t.map.you}
    >
      <View style={styles.user}>
        {user.heading !== null && <View style={styles.userArrow} />}
        <View style={styles.userDot} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  user: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  // a triangle above the dot, pointing the way the phone faces
  userArrow: { position: 'absolute', top: 0, borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: USER_BLUE },
  userDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: USER_BLUE, borderWidth: 2, borderColor: '#ffffff' },
});
