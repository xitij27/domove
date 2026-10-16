import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Mapbox, { Camera, CircleLayer, MapView, ShapeSource, StyleImport } from '@rnmapbox/maps';
import { COLORS, type Site } from '../sites';
import type { MapTheme } from '../theme';
import { POINT_NORTH_MS, type MapHandle } from './Compass';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (TOKEN) Mapbox.setAccessToken(TOKEN);

export default function MapboxSitesMap({ sites, onSelect, theme, onHeadingChange, bottomInset, ref }: {
  sites: Site[];
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
    </MapView>
  );
}

const styles = StyleSheet.create({
  missing: { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#1b2029' },
  missingText: { color: '#fff', textAlign: 'center' },
});
