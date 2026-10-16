import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Mapbox, { Camera, CircleLayer, LineLayer, MapView, ShapeSource, StyleImport } from '@rnmapbox/maps';
import { placeColor, ROUTE_PADDING, type RouteLine } from '../routes/routeView';
import { COLORS, type Site } from '../sites';
import { PALETTES, type MapTheme } from '../theme';
import { POINT_NORTH_MS, type MapHandle } from './Compass';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (TOKEN) Mapbox.setAccessToken(TOKEN);

export default function MapboxSitesMap({ sites, route, onSelect, theme, onHeadingChange, bottomInset, ref }: {
  sites: Site[];
  route: RouteLine | null;
  onSelect: (site: Site | null) => void;
  theme: MapTheme;
  onHeadingChange: (heading: number) => void;
  bottomInset: number; // covered by what lies over the map's bottom edge
  ref?: Ref<MapHandle>;
}) {
  const camera = useRef<Camera>(null);
  useImperativeHandle(ref, () => ({
    pointNorth: () => camera.current?.setCamera({ heading: 0, animationDuration: POINT_NORTH_MS, animationMode: 'easeTo' }),
  }), []);

  const path = route?.path;
  useEffect(() => {
    if (!path) return;
    let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of path) {
      west = Math.min(west, p.longitude); east = Math.max(east, p.longitude);
      south = Math.min(south, p.latitude); north = Math.max(north, p.latitude);
    }
    const { top, right, bottom, left } = ROUTE_PADDING;
    camera.current?.fitBounds([east, north], [west, south], [top, right, bottom, left], 600);
  }, [path]);

  const line = useMemo<GeoJSON.Feature | null>(() => route && ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: route.path.map((p) => [p.longitude, p.latitude]) },
  }), [route]);

  const places = useMemo<GeoJSON.FeatureCollection | null>(() => route && ({
    type: 'FeatureCollection',
    features: route.places.map((place, i) => ({
      type: 'Feature',
      properties: { color: placeColor(i, route.places.length) },
      geometry: { type: 'Point', coordinates: [place.coordinate.longitude, place.coordinate.latitude] },
    })),
  }), [route]);

  const shape = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: sites.map((s) => ({
      type: 'Feature',
      properties: { id: s.id, status: s.status },
      geometry: { type: 'Point', coordinates: [s.coordinate.longitude, s.coordinate.latitude] },
    })),
  }), [sites]);

  if (!TOKEN) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.missing]}>
        <Text style={styles.missingText}>Set EXPO_PUBLIC_MAPBOX_TOKEN in mobile/.env.local and restart Expo.</Text>
      </View>
    );
  }

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      styleURL="mapbox://styles/mapbox/standard"
      scaleBarEnabled={false}
      // keeps the Mapbox logo and attribution in sight
      logoPosition={{ bottom: bottomInset + 8, left: 8 }}
      attributionPosition={{ bottom: bottomInset + 8, right: 8 }}
      onPress={() => onSelect(null)}
      onCameraChanged={(state) => onHeadingChange(state.properties.heading)}
    >
      <StyleImport id="basemap" existing config={{ lightPreset: theme, showPointOfInterestLabels: false }} />
      <Camera ref={camera} defaultSettings={{ centerCoordinate: [7.4653, 51.5136], zoomLevel: 11 }} />
      {line && (
        <ShapeSource id="route-line" shape={line}>
          <LineLayer id="route-line-casing" style={{ lineColor: '#ffffff', lineWidth: 7, lineCap: 'round', lineJoin: 'round' }} />
          <LineLayer id="route-line-fill" style={{ lineColor: PALETTES[theme].route, lineWidth: 4, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1 }} />
        </ShapeSource>
      )}
      <ShapeSource
        id="sites"
        shape={shape}
        onPress={(e) => onSelect(sites.find((s) => s.id === e.features[0]?.properties?.id) ?? null)}
      >
        <CircleLayer
          id="site-circles"
          style={{
            circleRadius: 7,
            circleColor: ['match', ['get', 'status'], 'current', COLORS.current, COLORS.planned],
            circleStrokeWidth: 2,
            circleStrokeColor: '#ffffff',
            circleEmissiveStrength: 1, // keep pins bright under the night light preset
          }}
        />
      </ShapeSource>
      {places && (
        <ShapeSource id="route-places" shape={places}>
          <CircleLayer
            id="route-place-circles"
            style={{ circleRadius: 7, circleColor: ['get', 'color'], circleStrokeWidth: 2, circleStrokeColor: '#ffffff', circleEmissiveStrength: 1 }}
          />
        </ShapeSource>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  missing: { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#1b2029' },
  missingText: { color: '#fff', textAlign: 'center' },
});
