import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';
import { googleMapsDirectionsUrl } from './core';
import { type KnownObstacle, isEvent, isRoute } from './model';
import { createNotificationService, type NotificationDriver, type ReminderPayload } from './service';

const CHANNEL_ID = 'construction-reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const notificationDriver: NotificationDriver = {
  async permission(request) {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Construction reminders',
        importance: AndroidImportance.HIGH,
        lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
      });
    }
    let permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted && request) permissions = await Notifications.requestPermissionsAsync();
    return permissions.granted;
  },
  async pending() {
    const requests = await Notifications.getAllScheduledNotificationsAsync();
    return requests.map((request) => ({
      id: request.identifier,
      routeId: typeof request.content.data?.notificationRouteId === 'string' ? request.content.data.notificationRouteId : undefined,
      signature: typeof request.content.data?.notificationSignature === 'string' ? request.content.data.notificationSignature : undefined,
    }));
  },
  schedule(date, payload) {
    return Notifications.scheduleNotificationAsync({
      content: {
        title: payload.title,
        body: payload.body,
        data: notificationData(payload),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
    });
  },
  async notifyNow(payload) {
    await Notifications.scheduleNotificationAsync({
      content: { title: payload.title, body: payload.body, data: notificationData(payload) },
      trigger: null,
    });
  },
  cancel(id) { return Notifications.cancelScheduledNotificationAsync(id); },
};

function notificationData(payload: ReminderPayload) {
  return {
    notificationRouteId: payload.route.id,
    notificationObstacleId: payload.event.obstacleId,
    notificationSignature: payload.signature,
  };
}

export const constructionNotifications = createNotificationService(AsyncStorage, notificationDriver);

/** Install only after an authenticated route API can verify ownership. */
let authenticatedTargetResolver: ((routeId: string, obstacleId: string) => Promise<KnownObstacle | null>) | null = null;
export function setAuthenticatedNotificationTargetResolver(
  resolver: ((routeId: string, obstacleId: string) => Promise<KnownObstacle | null>) | null,
) { authenticatedTargetResolver = resolver; }

export async function sendDevelopmentTestAlert(route: ReminderPayload['route']): Promise<void> {
  if (!__DEV__) throw new Error('Test alerts are available in development builds only.');
  if (!isRoute(route)) throw new Error('Select a valid route first.');
  if (!await notificationDriver.permission(true)) throw new Error('Allow notifications in device settings to see a test alert.');
  const event = {
    routeId: route.id,
    obstacleId: 'development-test',
    constructionLocation: 'TEST LOCATION',
  };
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '[TEST] Construction Alert',
      body: `Test notification for your route to ${route.destination.label}. Tap to open Google Maps.`,
      data: { ...notificationData({ route, event, title: '', body: '', signature: 'development-test' }), developmentRoute: route },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, channelId: CHANNEL_ID },
  });
}

export async function openNotificationInMaps(data: Record<string, unknown> | undefined): Promise<boolean> {
  const routeId = data?.notificationRouteId;
  const obstacleId = data?.notificationObstacleId;
  if (typeof routeId !== 'string' || typeof obstacleId !== 'string' || !routeId || !obstacleId) return false;
  let target: KnownObstacle | null = null;
  try { target = await constructionNotifications.notificationTarget(routeId, obstacleId); }
  catch { /* An authenticated resolver may still work when local storage is unavailable. */ }
  if (!target && authenticatedTargetResolver) {
    try { target = await authenticatedTargetResolver(routeId, obstacleId); }
    catch { /* keep the local fallback available while offline */ }
  }
  if (!target && __DEV__ && isRoute(data.developmentRoute) && data.developmentRoute.id === routeId) {
    target = { route: data.developmentRoute, event: { routeId, obstacleId, constructionLocation: 'TEST LOCATION' } };
  }
  // Already-delivered alerts from the previous MVP contained a route snapshot.
  if (!target && typeof data?.notificationSignature === 'string' && isRoute(data.route) && isEvent(data.event)
    && data.route.id === routeId && data.event.routeId === routeId && data.event.obstacleId === obstacleId) {
    target = { route: data.route, event: data.event };
  }
  if (!target || !isRoute(target.route) || !isEvent(target.event)
    || target.route.id !== routeId || target.event.routeId !== routeId || target.event.obstacleId !== obstacleId) return false;
  const url = googleMapsDirectionsUrl(target.route, target.event);
  if (!url) return false;
  try {
    await Linking.openURL(url); // Google Maps handles the universal link when installed; browser is the fallback.
    return true;
  } catch {
    return false;
  }
}

export function startNotificationRuntime(): () => void {
  const handled = new Set<string>();
  async function handle(response: Notifications.NotificationResponse) {
    const id = response.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);
    Notifications.clearLastNotificationResponse();
    const data = response.notification.request.content.data;
    const opened = await openNotificationInMaps(data);
    if (!opened) Alert.alert('Could not open route', 'Check that this route still exists and Google Maps or a browser is available.');
  }
  const received = Notifications.addNotificationReceivedListener(() => {
    // The foreground handler displays the alert. No second notification is generated here.
  });
  const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
    void handle(response).catch(() => Alert.alert('Could not open route', 'Please try again.'));
  });
  const initial = Notifications.getLastNotificationResponse();
  if (initial) void handle(initial).catch(() => Alert.alert('Could not open route', 'Please try again.'));
  void constructionNotifications.reconcileAll().catch((error) => console.warn('Could not reconcile construction reminders', error));
  return () => { received.remove(); tapped.remove(); };
}
