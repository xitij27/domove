import { googleMapsDirectionsUrl, notificationContent, occurrenceKey, occurrenceSignature, scheduleDecision } from './core';
import { type ConstructionObstacleEvent, type KnownObstacle, type NotificationPreference, type NotificationRoute, isEvent, isPreference, isRoute } from './model';

const STORAGE_KEY = '@domove/construction-notifications/v1';

export type StoredState = {
  preferences: Record<string, NotificationPreference>;
  obstacles: Record<string, KnownObstacle>;
};

export type PendingReminder = { id: string; routeId?: string; signature?: string };
export type ReminderPayload = {
  title: string;
  body: string;
  route: NotificationRoute;
  event: ConstructionObstacleEvent;
  signature: string;
};
export type NotificationDriver = {
  permission: (request: boolean) => Promise<boolean>;
  pending: () => Promise<PendingReminder[]>;
  schedule: (date: Date, payload: ReminderPayload) => Promise<string>;
  cancel: (id: string) => Promise<void>;
};
export type KeyValueStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };

function readState(raw: string | null): StoredState {
  if (!raw) return { preferences: {}, obstacles: {} };
  try {
    const value = JSON.parse(raw) as Partial<StoredState>;
    const preferences: StoredState['preferences'] = {};
    const obstacles: StoredState['obstacles'] = {};
    if (value.preferences && typeof value.preferences === 'object') {
      for (const [id, preference] of Object.entries(value.preferences)) {
        if (id && isPreference(preference) && preference !== 'DISABLED') preferences[id] = preference;
      }
    }
    if (value.obstacles && typeof value.obstacles === 'object') {
      for (const [key, known] of Object.entries(value.obstacles)) {
        if (known && isRoute(known.route) && isEvent(known.event)
          && known.route.id === known.event.routeId
          && key === occurrenceKey(known.route.id, known.event.obstacleId)) obstacles[key] = known;
      }
    }
    return { preferences, obstacles };
  } catch {
    return { preferences: {}, obstacles: {} };
  }
}

/** Serialized operations prevent duplicate schedules from simultaneous event and setting updates. */
export function createNotificationService(storage: KeyValueStorage, driver: NotificationDriver, now: () => Date = () => new Date()) {
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  }
  async function load() { return readState(await storage.getItem(STORAGE_KEY)); }
  async function save(state: StoredState) { await storage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  async function reconcile(routeId: string, state: StoredState, requestPermission: boolean): Promise<string | null> {
    const current = (await driver.pending()).filter((item) => item.routeId === routeId);
    const preference = state.preferences[routeId] ?? 'DISABLED';
    const desired = Object.values(state.obstacles).flatMap(({ route, event }) => {
      if (route.id !== routeId) return [];
      const decision = scheduleDecision(event, preference, now());
      if (!decision.date) return [];
      const content = notificationContent(route, event);
      return [{ date: decision.date, payload: {
        ...content, route, event,
        signature: occurrenceSignature(route, event, preference, decision.date),
      } }];
    });
    const allowed = preference !== 'DISABLED' && await driver.permission(requestPermission);
    const signatures = new Set(allowed ? desired.map((item) => item.payload.signature) : []);
    const kept = new Set<string>();
    for (const item of current) {
      if (item.signature && signatures.has(item.signature) && !kept.has(item.signature)) kept.add(item.signature);
      else await driver.cancel(item.id);
    }
    if (!allowed) return preference === 'DISABLED' ? null : 'Notifications are disabled in device settings. Your preference was saved, but no reminder was scheduled.';
    for (const item of desired) {
      if (!kept.has(item.payload.signature)) {
        await driver.schedule(item.date, item.payload);
        kept.add(item.payload.signature);
      }
    }
    return null;
  }

  return {
    getPreference(routeId: string): Promise<NotificationPreference> {
      return enqueue(async () => (await load()).preferences[routeId] ?? 'DISABLED');
    },
    setPreference(route: NotificationRoute, preference: NotificationPreference): Promise<string | null> {
      return enqueue(async () => {
        if (!isRoute(route) || !isPreference(preference)) throw new Error('Invalid route or notification preference.');
        const state = await load();
        if (preference === 'DISABLED') delete state.preferences[route.id];
        else state.preferences[route.id] = preference;
        for (const known of Object.values(state.obstacles)) {
          if (known.route.id === route.id) known.route = route;
        }
        await save(state);
        return reconcile(route.id, state, preference !== 'DISABLED');
      });
    },
    processObstacle(route: NotificationRoute, event: ConstructionObstacleEvent): Promise<string | null> {
      return enqueue(async () => {
        if (!isRoute(route) || !isEvent(event) || route.id !== event.routeId) throw new Error('Invalid construction event or route.');
        const state = await load();
        state.obstacles[occurrenceKey(route.id, event.obstacleId)] = { route, event };
        await save(state);
        return reconcile(route.id, state, false);
      });
    },
    removeObstacle(routeId: string, obstacleId: string): Promise<void> {
      return enqueue(async () => {
        const state = await load();
        delete state.obstacles[occurrenceKey(routeId, obstacleId)];
        await save(state);
        await reconcile(routeId, state, false);
      });
    },
    forgetRoute(routeId: string): Promise<void> {
      return enqueue(async () => {
        const state = await load();
        delete state.preferences[routeId];
        for (const [key, known] of Object.entries(state.obstacles)) {
          if (known.route.id === routeId) delete state.obstacles[key];
        }
        await save(state);
        for (const item of await driver.pending()) {
          if (item.routeId === routeId) await driver.cancel(item.id);
        }
      });
    },
    reconcileAll(): Promise<void> {
      return enqueue(async () => {
        const state = await load();
        const ids = new Set([...Object.keys(state.preferences), ...Object.values(state.obstacles).map((known) => known.route.id)]);
        for (const item of await driver.pending()) if (item.routeId) ids.add(item.routeId);
        for (const id of ids) await reconcile(id, state, false);
      });
    },
    /** Testing and external links share the same validated Maps URL. */
    directionsUrl: googleMapsDirectionsUrl,
  };
}
