export const PREFERENCES = {
  ONE_WEEK_BEFORE: '1 Week Before',
  ONE_DAY_BEFORE: '1 Day Before',
  DISABLED: 'Disabled',
} as const;

export type NotificationPreference = keyof typeof PREFERENCES;
export type TransportMode = 'pedestrian' | 'bike' | 'car';

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
};

export type KnownObstacle = { route: NotificationRoute; event: ConstructionObstacleEvent };

export function isPreference(value: unknown): value is NotificationPreference {
  return value === 'ONE_WEEK_BEFORE' || value === 'ONE_DAY_BEFORE' || value === 'DISABLED';
}

export function isRoute(value: unknown): value is NotificationRoute {
  if (!value || typeof value !== 'object') return false;
  const route = value as Partial<NotificationRoute>;
  return typeof route.id === 'string' && !!route.id.trim()
    && typeof route.start?.label === 'string' && !!route.start.label.trim()
    && typeof route.destination?.label === 'string' && !!route.destination.label.trim()
    && (route.mode === 'pedestrian' || route.mode === 'bike' || route.mode === 'car')
    && (route.waypoints === undefined || (Array.isArray(route.waypoints)
      && route.waypoints.every((stop) => typeof stop?.label === 'string')));
}

export function isEvent(value: unknown): value is ConstructionObstacleEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<ConstructionObstacleEvent>;
  return typeof event.routeId === 'string' && !!event.routeId.trim()
    && typeof event.obstacleId === 'string' && !!event.obstacleId.trim()
    && typeof event.constructionLocation === 'string' && !!event.constructionLocation.trim()
    && (event.constructionStartDate === undefined || typeof event.constructionStartDate === 'string')
    && (event.constructionEndDate === undefined || typeof event.constructionEndDate === 'string')
    && (event.additionalMinutes === undefined || (Number.isInteger(event.additionalMinutes) && event.additionalMinutes > 0))
    && (event.alternativeWaypoints === undefined || (Array.isArray(event.alternativeWaypoints)
      && event.alternativeWaypoints.every((stop) => typeof stop === 'string')));
}
