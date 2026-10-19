import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility, type NotificationResponse } from 'expo-notifications';
import { File, Paths } from 'expo-file-system';
import { notificationContent } from './core';
import { notificationRouteLink } from './link';
import { fetchObstacles } from './obstacles';
import type { RouteObstacle } from './model';
import { createNotificationService, type NotificationDriver } from './service';
import { planTrip } from '../detours/trip';
import { strings, subscribeLanguage } from '../i18n';
import { routesRepository } from '../routes/api';
import { googleMapsDirectionsUrl } from '../routes/googleMaps';
import type { SavedRoute } from '../routes/model';

const CHANNEL_ID = 'construction-reminders';

export const notificationDriver: NotificationDriver = {
  async permission(request) {
    if (Platform.OS === 'android') {
      // set each time, so the channel's name in the phone's settings follows the app's language
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: strings().alerts.channel,
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
  schedule(date, { title, body, routeId, siteId, signature, googleMapsUrl }) {
    return Notifications.scheduleNotificationAsync({
      content: { title, body, data: { routeId, siteId, signature, googleMapsUrl } },
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
}, notificationDriver, undefined, notificationGoogleMapsUrl);

let routesCache: { at: number; value: Promise<SavedRoute[]> } | null = null;

/** Plans the same construction-aware route as the map; if that fails, Google still gets the original saved trip. */
async function notificationGoogleMapsUrl(routeId: string): Promise<string | null> {
  const now = Date.now();
  if (!routesCache || now - routesCache.at > 60_000) {
    const value = routesRepository.list();
    const entry = { at: now, value };
    routesCache = entry;
    value.catch(() => { if (routesCache === entry) routesCache = null; });
  }
  const route = (await routesCache.value).find((item) => item.id === routeId);
  if (!route) return null;
  try {
    const { plan } = await planTrip(route);
    return googleMapsDirectionsUrl(route, plan.options[0], plan.direct) ?? googleMapsDirectionsUrl(route);
  } catch {
    return googleMapsDirectionsUrl(route);
  }
}

async function syncObstacles() {
  try {
    await constructionNotifications.sync(await fetchObstacles());
  } catch (error) {
    // Offline or backend down: the reminders scheduled last time stay as they are.
    console.warn('Could not check routes for construction', error);
  }
}

/**
 * Checks the saved routes for construction now and whenever the app comes back to the foreground, and words the
 * scheduled reminders again when the language changes.
 */
export function startNotificationRuntime(): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  void syncObstacles();
  const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void syncObstacles(); });
  const unsubscribe = subscribeLanguage(() => {
    constructionNotifications.reword().catch((error: unknown) => console.warn('Could not reword the reminders', error));
  });
  return () => {
    subscription.remove();
    unsubscribe();
  };
}

/** The construction site of the alert the user tapped last; a new object for every tap, even on the same site. */
export function useTappedSite(): { siteId: string } | null {
  // The tap that launched the app, then every tap while it runs.
  const [initial] = useState(() => Notifications.getLastNotificationResponse());
  const [tap, setTap] = useState(() => notificationLink(initial) ? null : tappedSite(initial));
  useEffect(() => {
    // Otherwise the launching tap comes back on the next launch.
    void openNotificationRoute(initial);
    Notifications.clearLastNotificationResponse();
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (notificationLink(response)) void openNotificationRoute(response);
      else setTap(tappedSite(response));
    });
    return () => subscription.remove();
  }, [initial]);
  return tap;
}

const notificationLink = (response: NotificationResponse | null) =>
  notificationRouteLink(response?.notification.request.content.data);

async function openNotificationRoute(response: NotificationResponse | null): Promise<void> {
  const link = notificationLink(response);
  if (!link) return;
  try {
    await Linking.openURL(link);
  } catch {
    Alert.alert(strings().app.googleMapsFailed, strings().alerts.openFailed);
  }
}

function tappedSite(response: NotificationResponse | null) {
  const siteId = response?.notification.request.content.data?.siteId;
  return typeof siteId === 'string' ? { siteId } : null;
}

export async function sendDevelopmentTestAlert(routeId: string): Promise<void> {
  if (!__DEV__) throw new Error(strings().alerts.devOnly);
  const [obstacle] = await constructionNotifications.obstaclesOn(routeId);
  if (!obstacle) throw new Error(strings().alerts.noneKnown);
  await sendAlertSoon(obstacle, 2, strings().alerts.testTitle);
}

/** An obstacle's alert in a few seconds, worded as its reminder; for the test button and the demo. */
export async function sendAlertSoon(obstacle: RouteObstacle, seconds: number, title?: string): Promise<void> {
  if (!await notificationDriver.permission(true)) throw new Error(strings().alerts.allow);
  const content = notificationContent(obstacle);
  const googleMapsUrl = await notificationGoogleMapsUrl(obstacle.routeId);
  await Notifications.scheduleNotificationAsync({
    // No signature, so the reminder sync leaves it alone.
    content: { ...content, title: title ?? content.title, data: { routeId: obstacle.routeId, siteId: obstacle.siteId, googleMapsUrl } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL_ID },
  });
}
