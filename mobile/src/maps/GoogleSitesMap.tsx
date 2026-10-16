import { StyleSheet } from 'react-native';
import MapView, { Marker, type MapViewProps } from 'react-native-maps';
import { COLORS, type Site } from '../sites';
import type { MapTheme } from '../theme';

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

export const GOOGLE_MAP_STYLES: Record<MapTheme, MapViewProps['customMapStyle']> = { day: LIGHT_STYLE, night: DARK_STYLE };

export default function GoogleSitesMap({ sites, onSelect, theme }: {
  sites: Site[];
  onSelect: (site: Site | null) => void;
  theme: MapTheme;
}) {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={DORTMUND}
      customMapStyle={GOOGLE_MAP_STYLES[theme]} // Android (Google); iOS uses Apple Maps, styled by userInterfaceStyle
      userInterfaceStyle={theme === 'night' ? 'dark' : 'light'}
      onPress={(e) => e.nativeEvent.action !== 'marker-press' && onSelect(null)}
    >
      {sites.map((s) => (
        <Marker key={s.id} coordinate={s.coordinate} pinColor={COLORS[s.status]} onPress={() => onSelect(s)} />
      ))}
    </MapView>
  );
}
