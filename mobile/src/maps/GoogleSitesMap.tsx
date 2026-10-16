import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, type MapViewProps } from 'react-native-maps';
import type { Coordinate } from '../routes/model';
import { COLORS, type Site } from '../sites';
import type { MapTheme } from '../theme';
import { MOVE_MS, POINT_NORTH_MS, STREET_ZOOM, type MapHandle } from './Compass';
import { CASING_COLORS, LINE_COLORS, routePoints, STOP_COLORS, type RouteOverlay, type RoutePadding } from './routeOverlay';

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

export default function GoogleSitesMap({ sites, onSelect, theme, onHeadingChange, bottomInset, route, routePadding, onCenterChange, ref }: {
  sites: Site[];
  onSelect: (site: Site | null) => void;
  theme: MapTheme;
  onHeadingChange: (heading: number) => void;
  bottomInset: number; // covered by what lies over the map's bottom edge
  route: RouteOverlay | null;
  routePadding: RoutePadding; // on top of bottomInset
  /** While set, a place is being chosen: the map reports where its middle settles (null while it moves), and a tap moves the middle there. */
  onCenterChange?: (center: Coordinate | null) => void;
  ref?: Ref<MapHandle>;
}) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  useImperativeHandle(ref, () => ({
    pointNorth: () => map.current?.animateCamera({ heading: 0 }, { duration: POINT_NORTH_MS }),
    zoomTo: async (center) => {
      const at = center ?? (await map.current!.getCamera()).center;
      // zoom for Google, altitude for Apple Maps on iOS
      map.current?.animateCamera({ center: at, zoom: STREET_ZOOM, altitude: 1000 }, { duration: MOVE_MS });
      return at;
    },
  }), []);

  // Brings a route into view when it opens and again when its routed path replaces the straight line.
  // Fitting before the map has a size fails, so wait for it.
  useEffect(() => {
    if (ready && route) map.current?.fitToCoordinates(routePoints(route), { edgePadding: routePadding, animated: true });
  }, [ready, route, routePadding]);

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
      // keeps the Google logo in sight; while choosing a place, the top padding keeps the centre under the pin mid-map
      mapPadding={{ top: onCenterChange ? bottomInset : 0, right: 0, bottom: bottomInset, left: 0 }}
      onRegionChange={() => { onCenterChange?.(null); readCamera(false); }}
      onRegionChangeComplete={() => readCamera(true)}
      onMapReady={() => setReady(true)}
      onPress={(e) => {
        if (onCenterChange) map.current?.animateCamera({ center: e.nativeEvent.coordinate }, { duration: MOVE_MS });
        else if (e.nativeEvent.action !== 'marker-press') onSelect(null);
      }}
    >
      {route && <Polyline coordinates={route.path} strokeWidth={7} strokeColor={CASING_COLORS[theme]} zIndex={1} />}
      {route && <Polyline coordinates={route.path} strokeWidth={4} strokeColor={LINE_COLORS[theme]} zIndex={2} />}
      {sites.map((s) => (
        <Marker key={s.id} coordinate={s.coordinate} pinColor={COLORS[s.status]} onPress={() => onSelect(s)} />
      ))}
      {route && <Marker coordinate={route.start.coordinate} pinColor={STOP_COLORS.start} title="Start" description={route.start.label ?? undefined} />}
      {route?.stops.map((stop, index) => (
        <Marker key={index} coordinate={stop.coordinate} pinColor={STOP_COLORS.stop} title={`Stop ${index + 1}`} description={stop.label ?? undefined} />
      ))}
      {route && <Marker coordinate={route.destination.coordinate} pinColor={STOP_COLORS.destination} title="Destination" description={route.destination.label ?? undefined} />}
    </MapView>
  );
}
