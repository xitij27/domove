import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import type { RoutesRepository, RouteObstacle } from './api';
import { routesRepository } from './api';
import { fetchRoutePath, straightPath } from './routePath';
import TransportModeIcon from './TransportModeIcon';
import { type Coordinate, type SavedRoute } from './model';
import { COLORS } from '../sites';
import { GOOGLE_MAP_STYLES } from '../maps/GoogleSitesMap';
import { loadTheme } from '../theme';

export default function RouteDetail({ route, repository = routesRepository }: {
  route: SavedRoute;
  repository?: RoutesRepository;
}) {
  const [theme] = useState(loadTheme);
  const [obstacles, setObstacles] = useState<RouteObstacle[] | null>(null);
  const [obstacleError, setObstacleError] = useState<string | null>(null);
  const [path, setPath] = useState<Coordinate[]>(() => straightPath(route));
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    repository.listObstacles(route.id)
      .then((rows) => { if (active.current) { setObstacles(rows); setObstacleError(null); } })
      .catch((e: unknown) => { if (active.current) setObstacleError(e instanceof Error ? e.message : 'Could not load obstacles.'); });
    fetchRoutePath(route)
      .then((routed) => { if (active.current) setPath(routed); })
      .catch(() => { /* the straight line stays */ });
    return () => { active.current = false; };
  }, [repository, route]);

  const stops = [...route.waypoints].sort((a, b) => a.sequence - b.sequence);
  const sites = (obstacles ?? []).flatMap((o) => (o.site ? [o.site] : []));
  const region = regionFor([...path, ...sites.map((s) => s.coordinate)]);
  const loaded = obstacles !== null;
  const subtitle = !loaded
    ? 'Checking for construction sites…'
    : obstacles.length === 0
      ? 'No construction sites on the way.'
      : `${obstacles.length} construction ${obstacles.length === 1 ? 'site' : 'sites'} on the way.`;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <TransportModeIcon mode={route.mode} />
      <Text accessibilityRole="header" style={styles.title}>
        {(route.start.label ?? 'Starting location')} → {(route.destination.label ?? 'Final destination')}
      </Text>
      {stops.length > 0 && (
        <Text style={styles.hint}>Via {stops.map((stop) => stop.label ?? 'Intermediate stop').join(' → ')}</Text>
      )}
      <Text style={styles.hint}>{subtitle}</Text>
      {obstacleError && (
        <Text accessibilityRole="alert" style={styles.error}>{obstacleError}</Text>
      )}
      {!loaded && <ActivityIndicator accessibilityLabel="Loading obstacles" color="#163f36" />}
      <View style={styles.map} accessibilityLabel={`Map of route from ${route.start.label ?? 'start'} to ${route.destination.label ?? 'destination'}`}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          customMapStyle={GOOGLE_MAP_STYLES[theme]}
          userInterfaceStyle={theme === 'night' ? 'dark' : 'light'}
        >
          <Polyline coordinates={path} strokeWidth={4} strokeColor={theme === 'night' ? '#7fd6a8' : '#163f36'} />
          <Marker coordinate={route.start.coordinate} pinColor="#2e7d32" title="Start" description={route.start.label ?? undefined} />
          {stops.map((stop, index) => (
            <Marker
              key={stop.id}
              coordinate={stop.coordinate}
              pinColor="#757575"
              title={`Stop ${index + 1}`}
              description={stop.label ?? undefined}
            />
          ))}
          <Marker coordinate={route.destination.coordinate} pinColor="#1565c0" title="Destination" description={route.destination.label ?? undefined} />
          {sites.map((site) => (
            <Marker
              key={site.id}
              coordinate={site.coordinate}
              pinColor={COLORS[site.status]}
              title={site.title}
              description={[site.period, site.district].filter(Boolean).join(' · ') || undefined}
            />
          ))}
        </MapView>
      </View>
      {loaded && obstacles.length > 0 && (
        <View style={styles.list}>
          {obstacles.map((obstacle) => (
            <View key={obstacle.siteId} style={styles.card}>
              <Text style={[styles.badge, obstacle.site && { color: COLORS[obstacle.site.status] }]}>
                {obstacle.site ? obstacle.site.title : 'Construction site'}
              </Text>
              {!!obstacle.site?.period && <Text style={styles.hint}>{obstacle.site.period}</Text>}
              {!!obstacle.site?.district && <Text style={styles.hint}>{obstacle.site.district}</Text>}
              {typeof obstacle.distanceMeters === 'number' && (
                <Text style={styles.hint}>
                  {obstacle.distanceMeters < 1 ? 'On the route' : `About ${Math.round(obstacle.distanceMeters)} m off the route`}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function regionFor(points: Coordinate[]): Region {
  if (points.length === 0) return { latitude: 51.5136, longitude: 7.4653, latitudeDelta: 0.22, longitudeDelta: 0.22 };
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude); maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude); maxLon = Math.max(maxLon, p.longitude);
  }
  const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.01);
  const longitudeDelta = Math.max((maxLon - minLon) * 1.4, 0.01);
  return { latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2, latitudeDelta, longitudeDelta };
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 8, width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 32 },
  badge: { color: '#246049', fontWeight: '700' },
  title: { fontSize: 24, color: '#182332', fontWeight: '700' },
  hint: { color: '#526173', lineHeight: 22 },
  error: { color: '#a52621', lineHeight: 21 },
  map: { height: 320, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e1e6eb', marginTop: 8 },
  list: { gap: 10, marginTop: 8 },
  card: { padding: 14, gap: 4, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e1e6eb' },
});
