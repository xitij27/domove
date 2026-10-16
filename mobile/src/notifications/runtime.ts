import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility, type NotificationResponse } from 'expo-notifications';
import { File, Paths } from 'expo-file-system';
import { notificationContent } from './core';
import { fetchObstacles } from './obstacles';
import { createNotificationService, type NotificationDriver } from './service';

const CHANNEL_ID = 'construction-reminders';

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
    return requests.flatMap(({ identifier, content }) => typeof content.data?.signature === 'string'
      ? [{ id: identifier, signature: content.data.signature }]
      : []);
  },
  schedule(date, { title, body, siteId, signature }) {
    return Notifications.scheduleNotificationAsync({
      content: { title, body, data: { siteId, signature } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
    });
  },
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
};

const settingsFile = () => new File(Paths.document, 'construction-notifications.json');

export const constructionNotifications = createNotificationService({
  read: () => {
    try {
      const file = settingsFile();
      return file.exists ? file.textSync() : null;
    } catch {
      return null;
    }
  },
  write: (value) => settingsFile().writeSync(value),
}, notificationDriver);

async function syncObstacles() {
  try {
    await constructionNotifications.sync(await fetchObstacles());
  } catch (error) {
    // Offline or backend down: the reminders scheduled last time stay as they are.
    console.warn('Could not check routes for construction', error);
  }
}

/** Checks the saved routes for construction now and whenever the app comes back to the foreground. */
export function startNotificationRuntime(): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  void syncObstacles();
  const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void syncObstacles(); });
  return () => subscription.remove();
}

/** The construction site of the alert the user tapped last; a new object for every tap, even on the same site. */
export function useTappedSite(): { siteId: string } | null {
  // The tap that launched the app, then every tap while it runs.
  const [tap, setTap] = useState(() => tappedSite(Notifications.getLastNotificationResponse()));
  useEffect(() => {
    // Otherwise the launching tap comes back on the next launch.
    Notifications.clearLastNotificationResponse();
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => setTap(tappedSite(response)));
    return () => subscription.remove();
  }, []);
  return tap;
}

function tappedSite(response: NotificationResponse | null) {
  const siteId = response?.notification.request.content.data?.siteId;
  return typeof siteId === 'string' ? { siteId } : null;
}

export async function sendDevelopmentTestAlert(routeId: string): Promise<void> {
  if (!__DEV__) throw new Error('Test alerts are available in development builds only.');
  if (!await notificationDriver.permission(true)) throw new Error('Allow notifications in your phone settings to see a test alert.');
  const [obstacle] = await constructionNotifications.obstaclesOn(routeId);
  if (!obstacle) throw new Error('No construction is known on this route yet. Reopen the app after the next obstacle check.');
  await Notifications.scheduleNotificationAsync({
    content: { ...notificationContent(obstacle), title: '[TEST] Construction on your route', data: { siteId: obstacle.siteId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, channelId: CHANNEL_ID },
  });
}
