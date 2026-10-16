import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Mapbox, { Camera, CircleLayer, LineLayer, MapView, ShapeSource, StyleImport } from '@rnmapbox/maps';
import { COLORS, type Site } from '../sites';
import type { MapTheme } from '../theme';
import { POINT_NORTH_MS, type MapHandle } from './Compass';
import { CASING_COLORS, LINE_COLORS, routePoints, STOP_COLORS, type RouteOverlay, type RoutePadding } from './routeOverlay';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (TOKEN) Mapbox.setAccessToken(TOKEN);

const FIT_ROUTE_MS = 600;

export default function MapboxSitesMap({ sites, onSelect, theme, onHeadingChange, bottomInset, route, routePadding, ref }: {
  sites: Site[];
  onSelect: (site: Site | null) => void;
  theme: MapTheme;
  onHeadingChange: (heading: number) => void;
  bottomInset: number; // covered by what lies over the map's bottom edge
  route: RouteOverlay | null;
  routePadding: RoutePadding; // on top of bottomInset
  ref?: Ref<MapHandle>;
}) {
  const camera = useRef<Camera>(null);
  useImperativeHandle(ref, () => ({
    pointNorth: () => camera.current?.setCamera({ heading: 0, animationDuration: POINT_NORTH_MS, animationMode: 'easeTo' }),
  }), []);

  // Brings a route into view when it opens and again when its routed path replaces the straight line.
  useEffect(() => {
    if (!route) return;
    const points = routePoints(route);
    const lons = points.map((p) => p.longitude);
    const lats = points.map((p) => p.latitude);
    const { top, right, bottom, left } = routePadding;
    camera.current?.fitBounds(
      [Math.max(...lons), Math.max(...lats)],
      [Math.min(...lons), Math.min(...lats)],
      [top, right, bottom + bottomInset, left],
      FIT_ROUTE_MS,
    );
  }, [route, routePadding, bottomInset]);

  const line = useMemo<GeoJSON.Feature | null>(() => route && {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: route.path.map((p) => [p.longitude, p.latitude]) },
  }, [route]);

  const stops = useMemo<GeoJSON.FeatureCollection | null>(() => route && {
    type: 'FeatureCollection',
    features: [
      { kind: 'start', place: route.start },
      ...route.stops.map((place) => ({ kind: 'stop', place })),
      { kind: 'destination', place: route.destination },
    ].map(({ kind, place }) => ({
      type: 'Feature',
      properties: { kind },
      geometry: { type: 'Point', coordinates: [place.coordinate.longitude, place.coordinate.latitude] },
    })),
  }, [route]);

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
        // Under the site pins, though it is added after them when a route opens.
        <ShapeSource id="route-line" shape={line}>
          <LineLayer
            id="route-casing"
            belowLayerID="site-circles"
            style={{ lineColor: CASING_COLORS[theme], lineWidth: 7, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1 }}
          />
          <LineLayer
            id="route-line"
            belowLayerID="site-circles"
            style={{ lineColor: LINE_COLORS[theme], lineWidth: 4, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1 }}
          />
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
      {stops && (
        <ShapeSource id="route-stops" shape={stops}>
          <CircleLayer
            id="route-stop-circles"
            style={{
              circleRadius: 7,
              circleColor: ['match', ['get', 'kind'], 'start', STOP_COLORS.start, 'destination', STOP_COLORS.destination, STOP_COLORS.stop],
              circleStrokeWidth: 2,
              circleStrokeColor: '#ffffff',
              circleEmissiveStrength: 1,
            }}
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
