import { StyleSheet } from 'react-native';
import MapView, { Marker, type MapViewProps } from 'react-native-maps';
import { COLORS, type Site } from '../sites';

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

export default function GoogleSitesMap({ sites, onSelect }: { sites: Site[]; onSelect: (site: Site | null) => void }) {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={DORTMUND}
      customMapStyle={DARK_STYLE} // Android (Google); iOS uses Apple Maps, styled by userInterfaceStyle
      userInterfaceStyle="dark"
      onPress={(e) => e.nativeEvent.action !== 'marker-press' && onSelect(null)}
    >
      {sites.map((s) => (
        <Marker key={s.id} coordinate={s.coordinate} pinColor={COLORS[s.status]} onPress={() => onSelect(s)} />
      ))}
    </MapView>
  );
}
