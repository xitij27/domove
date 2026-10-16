export const PREFERENCES = {
  ONE_WEEK_BEFORE: '1 Week Before',
  ONE_DAY_BEFORE: '1 Day Before',
  DISABLED: 'Disabled',
} as const;

export type NotificationPreference = keyof typeof PREFERENCES;

export type RouteNotificationSettings = {
  preference: NotificationPreference;
  /** Device-local wall-clock time, HH:mm. */
  notificationTime: string;
};

export const DEFAULT_SETTINGS: RouteNotificationSettings = { preference: 'DISABLED', notificationTime: '09:00' };

/** A construction site on a saved route, as public.obstacles reports it. */
export type RouteObstacle = {
  routeId: string;
  siteId: string;
  siteTitle: string;
  /** The route's destination label; null when it was saved with a coordinate only. */
  destination: string | null;
  /** Calendar dates, YYYY-MM-DD. */
  startsOn: string | null;
  endsOn: string | null;
};

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isPreference(value: unknown): value is NotificationPreference {
  return typeof value === 'string' && Object.hasOwn(PREFERENCES, value);
}

export function isObstacle(value: unknown): value is RouteObstacle {
  if (!value || typeof value !== 'object') return false;
  const obstacle = value as Partial<RouteObstacle>;
  return typeof obstacle.routeId === 'string' && !!obstacle.routeId
    && typeof obstacle.siteId === 'string' && !!obstacle.siteId
    && typeof obstacle.siteTitle === 'string' && !!obstacle.siteTitle.trim()
    && [obstacle.destination, obstacle.startsOn, obstacle.endsOn].every((field) => field === null || typeof field === 'string');
}

export function isSettings(value: unknown): value is RouteNotificationSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<RouteNotificationSettings>;
  return isPreference(settings.preference) && isTime(settings.notificationTime);
}
