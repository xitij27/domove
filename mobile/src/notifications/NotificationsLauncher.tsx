import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationSettings from './NotificationSettings';
import { type NotificationRoute } from './model';
import { listNotificationRoutes } from './routes';

const DEV_ROUTE: NotificationRoute = {
  id: 'development-sample-route',
  start: { label: 'Dortmund Hbf' },
  destination: { label: 'TU Dortmund' },
  mode: 'pedestrian',
};

/** Read-only entry until Issue #1's route card embeds NotificationSettings. */
export default function NotificationsLauncher() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<NotificationRoute | null>(null);
  const [routes, setRoutes] = useState<NotificationRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setRoutes(await listNotificationRoutes()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load saved routes.'); }
    finally { setLoading(false); }
  }, []);

  return <>
    <View style={[styles.launcher, { bottom: insets.bottom + 12 }]}>
      <Pressable accessibilityRole="button" onPress={() => { setOpen(true); void load(); }} style={styles.launchButton}>
        <Text style={styles.launchText}>Notification Preferences</Text>
      </Pressable>
    </View>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <ScrollView contentContainerStyle={[styles.panel, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.topbar}>
          <Text style={styles.brand}>DO:MOVE</Text>
          <Pressable accessibilityRole="button" onPress={() => { setOpen(false); setSelected(null); }} style={styles.close}><Text style={styles.link}>Close</Text></Pressable>
        </View>
        {selected ? <NotificationSettings route={selected} onBack={() => setSelected(null)} /> : <View style={styles.list}>
          <Text accessibilityRole="header" style={styles.title}>Saved routes</Text>
          <Text style={styles.hint}>Choose a route to manage construction alerts.</Text>
          <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={styles.refresh}><Text style={styles.link}>Refresh routes</Text></Pressable>
          {loading && <ActivityIndicator accessibilityLabel="Loading saved routes" />}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!loading && !error && routes.length === 0 && <Text style={styles.hint}>No saved routes yet. Create one in the routes feature first.</Text>}
          {routes.map((route) => <Pressable key={route.id} accessibilityRole="button" accessibilityLabel={`Notification preferences for ${route.start.label} to ${route.destination.label}`}
            onPress={() => setSelected(route)} style={styles.route}>
            <Text style={styles.routeText}>{route.start.label} → {route.destination.label}</Text>
            <Text style={styles.link}>Notification Preferences →</Text>
          </Pressable>)}
          {__DEV__ && <Pressable accessibilityRole="button" accessibilityLabel="Development sample route notification settings"
            onPress={() => setSelected(DEV_ROUTE)} style={styles.route}>
            <Text style={styles.routeText}>[TEST] Dortmund Hbf → TU Dortmund</Text>
            <Text style={styles.link}>Try notification settings and test alert →</Text>
          </Pressable>}
        </View>}
      </ScrollView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  launcher: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  launchButton: { backgroundColor: '#163f36', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 22, elevation: 3 },
  launchText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  panel: { flexGrow: 1, backgroundColor: '#f5f7f9', paddingHorizontal: 20, gap: 24 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e1e6eb' },
  brand: { color: '#163f36', fontWeight: '800', letterSpacing: 2, fontSize: 16 },
  close: { padding: 14 },
  link: { color: '#254636', fontWeight: '700' },
  list: { gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#182332' },
  hint: { color: '#526173', lineHeight: 21 },
  refresh: { alignSelf: 'flex-start', paddingVertical: 10 },
  route: { backgroundColor: '#fff', borderColor: '#e1e6eb', borderWidth: 1, borderRadius: 16, padding: 18, gap: 8 },
  routeText: { fontSize: 17, fontWeight: '600', color: '#182332' },
  error: { color: '#a52621' },
});
