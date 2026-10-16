import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { PixelRatio, Platform, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, type MapViewProps } from 'react-native-maps';
import { placeColor, ROUTE_PADDING, type RouteLine } from '../routes/routeView';
import { COLORS, type Site } from '../sites';
import { PALETTES, type MapTheme } from '../theme';
import { POINT_NORTH_MS, type MapHandle } from './Compass';

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

// Android takes the fit padding in pixels, iOS in points.
const PX = Platform.OS === 'android' ? PixelRatio.get() : 1;
const EDGE_PADDING = { top: ROUTE_PADDING.top * PX, right: ROUTE_PADDING.right * PX, bottom: ROUTE_PADDING.bottom * PX, left: ROUTE_PADDING.left * PX };

export default function GoogleSitesMap({ sites, route, onSelect, theme, onHeadingChange, bottomInset, ref }: {
  sites: Site[];
  route: RouteLine | null;
  onSelect: (site: Site | null) => void;
  theme: MapTheme;
  onHeadingChange: (heading: number) => void;
  bottomInset: number; // covered by what lies over the map's bottom edge
  ref?: Ref<MapHandle>;
}) {
  const map = useRef<MapView>(null);
  useImperativeHandle(ref, () => ({
    pointNorth: () => map.current?.animateCamera({ heading: 0 }, { duration: POINT_NORTH_MS }),
  }), []);

  const path = route?.path;
  const fitRoute = () => {
    if (path) map.current?.fitToCoordinates(path, { edgePadding: EDGE_PADDING, animated: true });
  };
  useEffect(fitRoute, [path]); // refit only when the line changes

  // The region events carry no heading, so ask the map for it on every frame of a gesture or animation.
  const readHeading = () => {
    map.current?.getCamera().then(
      (camera) => onHeadingChange(camera.heading),
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
      mapPadding={{ top: 0, right: 0, bottom: bottomInset, left: 0 }} // keeps the Google logo in sight
      onRegionChange={readHeading}
      onRegionChangeComplete={readHeading}
      onPress={(e) => e.nativeEvent.action !== 'marker-press' && onSelect(null)}
      onMapReady={fitRoute} // a map opened while a route is shown can't move before this
    >
      {route && <Polyline coordinates={route.path} strokeWidth={7} strokeColor="#ffffff" zIndex={1} />}
      {route && <Polyline coordinates={route.path} strokeWidth={4} strokeColor={PALETTES[theme].route} zIndex={2} />}
      {route?.places.map((place, i) => (
        <Marker key={`place-${i}`} coordinate={place.coordinate} pinColor={placeColor(i, route.places.length)} title={place.label ?? undefined} />
      ))}
      {sites.map((s) => (
        <Marker key={s.id} coordinate={s.coordinate} pinColor={COLORS[s.status]} onPress={() => onSelect(s)} />
      ))}
    </MapView>
  );
}
