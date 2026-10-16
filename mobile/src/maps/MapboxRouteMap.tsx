import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Mapbox, { Camera, CircleLayer, LineLayer, MapView, ShapeSource, StyleImport } from '@rnmapbox/maps';
import { COLORS, type Site } from '../sites';
import type { Coordinate, RouteLocation, RouteWaypoint } from '../routes/model';
import type { MapTheme } from '../theme';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (TOKEN) Mapbox.setAccessToken(TOKEN);

export type RouteMarker = RouteLocation | RouteWaypoint;

export default function MapboxRouteMap({ path, start, destination, stops, sites, theme }: {
  path: Coordinate[];
  start: RouteMarker;
  destination: RouteMarker;
  stops: RouteMarker[];
  sites: Site[];
  theme: MapTheme;
}) {
  const bounds = useMemo(() => {
    const points = [...path, start.coordinate, destination.coordinate, ...stops.map((s) => s.coordinate), ...sites.map((s) => s.coordinate)];
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of points) {
      minLat = Math.min(minLat, p.latitude); maxLat = Math.max(maxLat, p.latitude);
      minLon = Math.min(minLon, p.longitude); maxLon = Math.max(maxLon, p.longitude);
    }
    if (!Number.isFinite(minLat)) return null;
    // Keep single-point routes visible instead of collapsing to a zero-area box.
    if (maxLat - minLat < 0.01) { const mid = (minLat + maxLat) / 2; minLat = mid - 0.005; maxLat = mid + 0.005; }
    if (maxLon - minLon < 0.01) { const mid = (minLon + maxLon) / 2; minLon = mid - 0.005; maxLon = mid + 0.005; }
    return {
      ne: [maxLon, maxLat] as [number, number],
      sw: [minLon, minLat] as [number, number],
      paddingTop: 40,
      paddingRight: 40,
      paddingBottom: 40,
      paddingLeft: 40,
    };
  }, [path, start, destination, stops, sites]);

  const camera = useRef<Camera>(null);
  // defaultSettings only positions the camera on mount, so refit explicitly whenever
  // the data behind the bounds changes (route switch, routed path arriving, obstacles
  // loading). Pans in between are left alone.
  useEffect(() => {
    if (bounds) camera.current?.fitBounds(bounds.ne, bounds.sw, 40, 0);
  }, [bounds]);

  const line = useMemo<GeoJSON.Feature>(() => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: path.map((p) => [p.longitude, p.latitude]) },
  }), [path]);

  const routePoints = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: [
      { id: 'start', coordinate: start.coordinate, color: '#2e7d32' },
      ...stops.map((stop, index) => ({ id: `stop-${index}`, coordinate: stop.coordinate, color: '#757575' })),
      { id: 'destination', coordinate: destination.coordinate, color: '#1565c0' },
    ].map((marker) => ({
      type: 'Feature',
      properties: { id: marker.id, color: marker.color },
      geometry: { type: 'Point', coordinates: [marker.coordinate.longitude, marker.coordinate.latitude] },
    })),
  }), [start, destination, stops]);

  const siteShape = useMemo<GeoJSON.FeatureCollection>(() => ({
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
    <MapView style={StyleSheet.absoluteFill} styleURL="mapbox://styles/mapbox/standard" scaleBarEnabled={false}>
      <StyleImport id="basemap" existing config={{ lightPreset: theme, showPointOfInterestLabels: false }} />
      <Camera
        ref={camera}
        defaultSettings={bounds
          ? { bounds }
          : { centerCoordinate: [7.4653, 51.5136], zoomLevel: 11 }}
      />
      {path.length >= 2 && (
        <ShapeSource id="route-line-source" shape={line}>
          <LineLayer
            id="route-line-casing"
            style={{
              lineColor: '#ffffff',
              lineWidth: 7,
              lineCap: 'round',
              lineJoin: 'round',
              lineOpacity: theme === 'night' ? 0.9 : 1,
            }}
          />
          <LineLayer
            id="route-line"
            style={{
              lineColor: theme === 'night' ? '#d2ffe3' : '#163f36',
              lineWidth: 4,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </ShapeSource>
      )}
      <ShapeSource id="route-sites" shape={siteShape}>
        <CircleLayer
          id="route-site-circles"
          style={{
            circleRadius: 7,
            circleColor: ['match', ['get', 'status'], 'current', COLORS.current, COLORS.planned],
            circleStrokeWidth: 2,
            circleStrokeColor: '#ffffff',
            circleEmissiveStrength: 1,
          }}
        />
      </ShapeSource>
      <ShapeSource id="route-points" shape={routePoints}>
        <CircleLayer
          id="route-point-circles"
          style={{
            circleRadius: 7,
            circleColor: ['get', 'color'],
            circleStrokeWidth: 2,
            circleStrokeColor: '#ffffff',
            circleEmissiveStrength: 1,
          }}
        />
      </ShapeSource>
    </MapView>
  );
}

const styles = StyleSheet.create({
  missing: { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#1b2029' },
  missingText: { color: '#fff', textAlign: 'center' },
});
