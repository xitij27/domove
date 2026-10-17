import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Mapbox, { Camera, CircleLayer, Images, LineLayer, LocationPuck, MapView, ShapeSource, StyleImport, SymbolLayer } from '@rnmapbox/maps';
import type { Coordinate } from '../routes/model';
import type { Site } from '../sites';
import type { MapTheme } from '../theme';
import { MOVE_MS, POINT_NORTH_MS, STREET_ZOOM, type MapHandle } from './Compass';
import { CASING_COLORS, LINE_COLORS, routePoints, STOP_COLORS, type RouteOverlay, type RoutePadding } from './routeOverlay';
import { NAMED_SIGNS, signName, stackingOf } from './signs';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (TOKEN) Mapbox.setAccessToken(TOKEN);

const FIT_ROUTE_MS = 600;
// Camera padding outlives the move that set it, such as a route's fit.
const NO_PADDING = { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 };

export default function MapboxSitesMap({ sites, onSelect, theme, onHeadingChange, bottomInset, route, routePadding, onCenterChange, showUser, ref }: {
  sites: Site[];
  onSelect: (site: Site | null) => void;
  theme: MapTheme;
  onHeadingChange: (heading: number) => void;
  bottomInset: number; // covered by what lies over the map's bottom edge
  route: RouteOverlay | null;
  routePadding: RoutePadding; // on top of bottomInset
  /** While set, a place is being chosen: the map reports where its middle settles (null while it moves), and a tap moves the middle there. */
  onCenterChange?: (center: Coordinate | null) => void;
  showUser: boolean; // location is allowed
  ref?: Ref<MapHandle>;
}) {
  const mapView = useRef<MapView>(null);
  const camera = useRef<Camera>(null);
  useImperativeHandle(ref, () => ({
    pointNorth: () => camera.current?.setCamera({ heading: 0, animationDuration: POINT_NORTH_MS, animationMode: 'easeTo' }),
    zoomTo: async (center) => {
      const [longitude, latitude] = center ? [center.longitude, center.latitude] : await mapView.current!.getCenter();
      camera.current?.setCamera({ centerCoordinate: [longitude, latitude], zoomLevel: STREET_ZOOM, padding: NO_PADDING, animationDuration: MOVE_MS, animationMode: 'easeTo' });
      return { latitude, longitude };
    },
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
      properties: { id: s.id, sign: signName(s), stacking: stackingOf(s) },
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
      ref={mapView}
      style={StyleSheet.absoluteFill}
      styleURL="mapbox://styles/mapbox/standard"
      scaleBarEnabled={false}
      // keeps the Mapbox logo and attribution in sight
      logoPosition={{ bottom: bottomInset + 8, left: 8 }}
      attributionPosition={{ bottom: bottomInset + 8, right: 8 }}
      onPress={(feature) => {
        if (onCenterChange) camera.current?.setCamera({ centerCoordinate: feature.geometry.coordinates, animationDuration: MOVE_MS, animationMode: 'easeTo' });
        else onSelect(null);
      }}
      onCameraChanged={(state) => { onHeadingChange(state.properties.heading); onCenterChange?.(null); }}
      onMapIdle={(state) => {
        const [longitude, latitude] = state.properties.center;
        onCenterChange?.({ latitude, longitude });
      }}
    >
      <StyleImport id="basemap" existing config={{ lightPreset: theme, showPointOfInterestLabels: false }} />
      <Camera ref={camera} defaultSettings={{ centerCoordinate: [7.4653, 51.5136], zoomLevel: 11 }} />
      <Images images={NAMED_SIGNS} />
      {line && (
        // Under the site signs, though it is added after them when a route opens.
        <ShapeSource id="route-line" shape={line}>
          <LineLayer
            id="route-casing"
            belowLayerID="site-signs"
            style={{ lineColor: CASING_COLORS[theme], lineWidth: 7, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1 }}
          />
          <LineLayer
            id="route-line"
            belowLayerID="site-signs"
            style={{ lineColor: LINE_COLORS[theme], lineWidth: 4, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1 }}
          />
        </ShapeSource>
      )}
      <ShapeSource
        id="sites"
        shape={shape}
        onPress={(e) => onSelect(sites.find((s) => s.id === e.features[0]?.properties?.id) ?? null)}
      >
        <SymbolLayer
          id="site-signs"
          style={{
            iconImage: ['get', 'sign'],
            // about the old dots' size at city zoom, full size from street level
            iconSize: ['interpolate', ['linear'], ['zoom'], 10, 0.55, 14, 1],
            // every site stays on the map, as the dots did; the more restrictive sign lies on top
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            symbolSortKey: ['get', 'stacking'],
            iconEmissiveStrength: 1, // keep signs bright under the night light preset
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
      {/* Mapbox reads the compass itself and turns the puck's arrow the way the phone faces. */}
      {showUser && <LocationPuck puckBearingEnabled puckBearing="heading" />}
    </MapView>
  );
}

const styles = StyleSheet.create({
  missing: { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#1b2029' },
  missingText: { color: '#fff', textAlign: 'center' },
});
