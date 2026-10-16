import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';
import { googleMapsDirectionsUrl } from './core';
import { isEvent, isRoute } from './model';
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
  cancel(id) { return Notifications.cancelScheduledNotificationAsync(id); },
};

function notificationData(payload: ReminderPayload) {
  return {
    notificationRouteId: payload.route.id,
    notificationSignature: payload.signature,
    route: payload.route,
    event: payload.event,
  };
}

export const constructionNotifications = createNotificationService(AsyncStorage, notificationDriver);

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
      data: notificationData({ route, event, title: '', body: '', signature: 'development-test' }),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, channelId: CHANNEL_ID },
  });
}

export async function openNotificationInMaps(data: Record<string, unknown> | undefined): Promise<boolean> {
  if (!isRoute(data?.route)) return false;
  const event = isEvent(data?.event) ? data.event : undefined;
  const url = googleMapsDirectionsUrl(data.route, event);
  if (!url) return false;
  try {
    await Linking.openURL(url); // Google Maps handles the universal link when installed; browser is the fallback.
    return true;
  } catch {
    Alert.alert('Could not open Google Maps', 'Please check that a browser or Google Maps is available.');
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
    if (!opened && !isRoute(data?.route)) Alert.alert('Route unavailable', 'This alert does not contain a valid saved route.');
  }
  const received = Notifications.addNotificationReceivedListener(() => {
    // The foreground handler displays the alert. No second notification is generated here.
  });
  const tapped = Notifications.addNotificationResponseReceivedListener((response) => { void handle(response); });
  const initial = Notifications.getLastNotificationResponse();
  if (initial) void handle(initial);
  void constructionNotifications.reconcileAll().catch((error) => console.warn('Could not reconcile construction reminders', error));
  return () => { received.remove(); tapped.remove(); };
}
