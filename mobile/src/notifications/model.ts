export const PREFERENCES = {
  ONE_WEEK_BEFORE: '1 Week Before',
  ONE_DAY_BEFORE: '1 Day Before',
  DISABLED: 'Disabled',
} as const;

export type NotificationPreference = keyof typeof PREFERENCES;
export type TransportMode = 'pedestrian' | 'bike' | 'car';
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Weekday = typeof WEEKDAYS[number];

export type RouteNotificationSettings = {
  preference: NotificationPreference;
  /** Device-local wall-clock time, HH:mm. */
  notificationTime: string;
  /** Omitted means no day-based filtering. */
  commuteDays?: Weekday[];
  /** Optional context for future time-aware obstacle data; does not suppress alerts by itself. */
  departureTime?: string;
  importantUpdates: boolean;
};

export const DEFAULT_SETTINGS: RouteNotificationSettings = {
  preference: 'DISABLED', notificationTime: '09:00', importantUpdates: false,
};

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'string' && WEEKDAYS.some((day) => day === value);
}

export function isSettings(value: unknown): value is RouteNotificationSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<RouteNotificationSettings>;
  return isPreference(settings.preference) && isTime(settings.notificationTime)
    && typeof settings.importantUpdates === 'boolean'
    && (settings.departureTime === undefined || isTime(settings.departureTime))
    && (settings.commuteDays === undefined || (Array.isArray(settings.commuteDays)
      && settings.commuteDays.every(isWeekday) && new Set(settings.commuteDays).size === settings.commuteDays.length));
}

/** Structural subset of Issue #1's SavedRoute; its model can be passed directly. */
export type NotificationRoute = {
  id: string;
  start: { label: string };
  destination: { label: string };
  mode: TransportMode;
  waypoints?: { label: string }[];
};

/** Supplied by obstacle detection only after it confirms this route is affected. */
export type ConstructionObstacleEvent = {
  routeId: string;
  obstacleId: string;
  constructionLocation: string;
  /** Calendar date at the construction site, YYYY-MM-DD (local). */
  constructionStartDate?: string;
  constructionEndDate?: string;
  /** Include only when calculated reliably by the obstacle feature. */
  additionalMinutes?: number;
  /** Ordered full replacement for intermediate stops when a supported detour exists. */
  alternativeWaypoints?: string[];
  /** Only when the obstacle source reliably knows the affected weekdays. */
  activeWeekdays?: Weekday[];
  /** For opt-in last-minute alerts: stable revision and actual publication/update time. */
  revision?: string;
  observedAt?: string;
  change?: 'NEW' | 'SIGNIFICANT_CHANGE' | 'UNCHANGED' | 'CANCELLED';
};

export type KnownObstacle = { route: NotificationRoute; event: ConstructionObstacleEvent };

export function isPreference(value: unknown): value is NotificationPreference {
  return value === 'ONE_WEEK_BEFORE' || value === 'ONE_DAY_BEFORE' || value === 'DISABLED';
}

export function isRoute(value: unknown): value is NotificationRoute {
  if (!value || typeof value !== 'object') return false;
  const route = value as Partial<NotificationRoute>;
  return typeof route.id === 'string' && !!route.id.trim() && route.id.length <= 128
    && typeof route.start?.label === 'string' && !!route.start.label.trim() && route.start.label.length <= 200
    && typeof route.destination?.label === 'string' && !!route.destination.label.trim() && route.destination.label.length <= 200
    && (route.mode === 'pedestrian' || route.mode === 'bike' || route.mode === 'car')
    && (route.waypoints === undefined || (Array.isArray(route.waypoints)
      && route.waypoints.length <= 50 && route.waypoints.every((stop) => typeof stop?.label === 'string' && stop.label.length <= 200)));
}

/** Avoid persisting coordinates, names, timestamps, or other fields on a larger SavedRoute. */
export function minimalRoute(route: NotificationRoute): NotificationRoute {
  return {
    id: route.id,
    start: { label: route.start.label.trim() },
    destination: { label: route.destination.label.trim() },
    mode: route.mode,
    waypoints: route.waypoints?.map(({ label }) => ({ label: label.trim() })).filter(({ label }) => !!label),
  };
}

export function isEvent(value: unknown): value is ConstructionObstacleEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<ConstructionObstacleEvent>;
  return typeof event.routeId === 'string' && !!event.routeId.trim() && event.routeId.length <= 128
    && typeof event.obstacleId === 'string' && !!event.obstacleId.trim() && event.obstacleId.length <= 128
    && typeof event.constructionLocation === 'string' && !!event.constructionLocation.trim() && event.constructionLocation.length <= 200
    && (event.constructionStartDate === undefined || typeof event.constructionStartDate === 'string')
    && (event.constructionEndDate === undefined || typeof event.constructionEndDate === 'string')
    && (event.additionalMinutes === undefined || (Number.isInteger(event.additionalMinutes) && event.additionalMinutes > 0))
    && (event.alternativeWaypoints === undefined || (Array.isArray(event.alternativeWaypoints)
      && event.alternativeWaypoints.length <= 50 && event.alternativeWaypoints.every((stop) => typeof stop === 'string' && stop.length <= 200)))
    && (event.activeWeekdays === undefined || (Array.isArray(event.activeWeekdays)
      && event.activeWeekdays.length > 0 && event.activeWeekdays.every(isWeekday)
      && new Set(event.activeWeekdays).size === event.activeWeekdays.length))
    && (event.revision === undefined || (typeof event.revision === 'string' && !!event.revision.trim() && event.revision.length <= 128))
    && (event.observedAt === undefined || (typeof event.observedAt === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(event.observedAt)
      && Number.isFinite(Date.parse(event.observedAt))))
    && (event.change === undefined || ['NEW', 'SIGNIFICANT_CHANGE', 'UNCHANGED', 'CANCELLED'].includes(event.change));
}

export function minimalEvent(event: ConstructionObstacleEvent): ConstructionObstacleEvent {
  return {
    routeId: event.routeId,
    obstacleId: event.obstacleId,
    constructionLocation: event.constructionLocation.trim(),
    constructionStartDate: event.constructionStartDate,
    constructionEndDate: event.constructionEndDate,
    additionalMinutes: event.additionalMinutes,
    alternativeWaypoints: event.alternativeWaypoints?.map((label) => label.trim()).filter(Boolean),
    activeWeekdays: event.activeWeekdays ? [...event.activeWeekdays] : undefined,
    revision: event.revision,
    observedAt: event.observedAt,
    change: event.change,
  };
}
