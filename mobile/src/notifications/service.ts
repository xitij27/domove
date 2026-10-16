import { googleMapsDirectionsUrl, lastMinuteDecision, notificationContent, occurrenceKey, occurrenceSignature, scheduleDecision } from './core';
import { DEFAULT_SETTINGS, type ConstructionObstacleEvent, type KnownObstacle, type NotificationPreference, type NotificationRoute, type RouteNotificationSettings, isEvent, isPreference, isRoute, isSettings, minimalEvent, minimalRoute } from './model';

const STORAGE_KEY = '@domove/construction-notifications/v1';

export type StoredState = {
  settings: Record<string, RouteNotificationSettings>;
  obstacles: Record<string, KnownObstacle>;
  urgentSent: Record<string, string>;
  remoteRoutes: Record<string, boolean>;
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
  notifyNow: (payload: ReminderPayload) => Promise<void>;
  cancel: (id: string) => Promise<void>;
};
export type KeyValueStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };

function readState(raw: string | null): StoredState {
  if (!raw) return { settings: {}, obstacles: {}, urgentSent: {}, remoteRoutes: {} };
  try {
    const value = JSON.parse(raw) as Partial<StoredState> & { preferences?: Record<string, unknown> };
    const settings: StoredState['settings'] = {};
    const obstacles: StoredState['obstacles'] = {};
    const urgentSent: StoredState['urgentSent'] = {};
    const remoteRoutes: StoredState['remoteRoutes'] = {};
    // Preserve preferences written by the Issue #4 MVP before the settings shape existed.
    if (value.preferences && typeof value.preferences === 'object') {
      for (const [id, preference] of Object.entries(value.preferences)) {
        if (id && isPreference(preference) && preference !== 'DISABLED') settings[id] = { ...DEFAULT_SETTINGS, preference };
      }
    }
    if (value.settings && typeof value.settings === 'object') {
      for (const [id, selected] of Object.entries(value.settings)) {
        if (id && isSettings(selected)) settings[id] = selected;
      }
    }
    if (value.obstacles && typeof value.obstacles === 'object') {
      for (const [key, known] of Object.entries(value.obstacles)) {
        if (known && isRoute(known.route) && isEvent(known.event)
          && known.route.id === known.event.routeId
          && key === occurrenceKey(known.route.id, known.event.obstacleId)) {
          obstacles[key] = { route: minimalRoute(known.route), event: minimalEvent(known.event) };
        }
      }
    }
    if (value.urgentSent && typeof value.urgentSent === 'object') {
      for (const [key, revision] of Object.entries(value.urgentSent)) {
        if (typeof revision === 'string' && revision) urgentSent[key] = revision;
      }
    }
    if (value.remoteRoutes && typeof value.remoteRoutes === 'object') {
      for (const [routeId, enabled] of Object.entries(value.remoteRoutes)) if (routeId && enabled === true) remoteRoutes[routeId] = true;
    }
    return { settings, obstacles, urgentSent, remoteRoutes };
  } catch {
    return { settings: {}, obstacles: {}, urgentSent: {}, remoteRoutes: {} };
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
    const settings = state.settings[routeId] ?? DEFAULT_SETTINGS;
    const remoteManaged = state.remoteRoutes[routeId] === true;
    const knownForRoute = Object.values(state.obstacles).filter(({ route }) => route.id === routeId);
    const desired = knownForRoute.flatMap(({ route, event }) => {
      if (route.id !== routeId) return [];
      const decision = scheduleDecision(event, settings, now());
      if (!decision.date) return [];
      const content = notificationContent(route, event);
      return [{ date: decision.date, payload: {
        ...content, route, event,
        signature: occurrenceSignature(route, event, settings, decision.date),
      } }];
    });
    const allowed = settings.preference !== 'DISABLED' && !remoteManaged && await driver.permission(requestPermission);
    const signatures = new Set(allowed ? desired.map((item) => item.payload.signature) : []);
    const kept = new Set<string>();
    for (const item of current) {
      if (item.signature && signatures.has(item.signature) && !kept.has(item.signature)) kept.add(item.signature);
      else await driver.cancel(item.id);
    }
    if (!allowed) return settings.preference === 'DISABLED' || remoteManaged ? null : 'Notifications are disabled in device settings. Your preference was saved, but no reminder was scheduled.';
    for (const item of desired) {
      if (!kept.has(item.payload.signature)) {
        await driver.schedule(item.date, item.payload);
        kept.add(item.payload.signature);
      }
    }
    for (const { route, event } of knownForRoute) {
      const key = occurrenceKey(route.id, event.obstacleId);
      if (!lastMinuteDecision(event, settings, now()) || state.urgentSent[key] === event.revision) continue;
      await driver.notifyNow({ ...notificationContent(route, event), title: 'Important Construction Update', route, event, signature: `urgent:${key}:${event.revision}` });
      state.urgentSent[key] = event.revision!;
      await save(state);
    }
    return null;
  }

  async function updateSettings(route: NotificationRoute, settings: RouteNotificationSettings): Promise<string | null> {
    if (!isRoute(route) || !isSettings(settings)) throw new Error('Invalid route or notification settings.');
    const state = await load();
    state.settings[route.id] = settings;
    for (const known of Object.values(state.obstacles)) if (known.route.id === route.id) known.route = minimalRoute(route);
    await save(state);
    return reconcile(route.id, state, settings.preference !== 'DISABLED');
  }

  return {
    getPreference(routeId: string): Promise<NotificationPreference> {
      return enqueue(async () => (await load()).settings[routeId]?.preference ?? 'DISABLED');
    },
    getSettings(routeId: string): Promise<RouteNotificationSettings> {
      return enqueue(async () => ({ ...DEFAULT_SETTINGS, ...(await load()).settings[routeId] }));
    },
    listSettings(): Promise<Record<string, RouteNotificationSettings>> {
      return enqueue(async () => ({ ...(await load()).settings }));
    },
    setSettings(route: NotificationRoute, settings: RouteNotificationSettings): Promise<string | null> {
      return enqueue(() => updateSettings(route, settings));
    },
    /** Call only after the authenticated backend confirms remote delivery ownership. */
    setRemoteDelivery(routeId: string, enabled: boolean): Promise<void> {
      return enqueue(async () => {
        if (!routeId || typeof enabled !== 'boolean') throw new Error('Invalid delivery mode.');
        const state = await load();
        if (enabled) state.remoteRoutes[routeId] = true;
        else delete state.remoteRoutes[routeId];
        await save(state);
        await reconcile(routeId, state, false);
      });
    },
    setPreference(route: NotificationRoute, preference: NotificationPreference): Promise<string | null> {
      return enqueue(async () => {
        if (!isPreference(preference)) throw new Error('Invalid notification preference.');
        const existing = (await load()).settings[route.id] ?? DEFAULT_SETTINGS;
        return updateSettings(route, { ...existing, preference });
      });
    },
    processObstacle(route: NotificationRoute, event: ConstructionObstacleEvent): Promise<string | null> {
      return enqueue(async () => {
        if (!isRoute(route) || !isEvent(event) || route.id !== event.routeId) throw new Error('Invalid construction event or route.');
        const state = await load();
        const key = occurrenceKey(route.id, event.obstacleId);
        if (event.change === 'CANCELLED') delete state.obstacles[key];
        else state.obstacles[key] = { route: minimalRoute(route), event: minimalEvent(event) };
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
        delete state.settings[routeId];
        delete state.remoteRoutes[routeId];
        for (const [key, known] of Object.entries(state.obstacles)) {
          if (known.route.id === routeId) delete state.obstacles[key];
        }
        for (const key of Object.keys(state.urgentSent)) {
          try { if (JSON.parse(key)[0] === routeId) delete state.urgentSent[key]; }
          catch { delete state.urgentSent[key]; }
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
        const ids = new Set([...Object.keys(state.settings), ...Object.keys(state.remoteRoutes), ...Object.values(state.obstacles).map((known) => known.route.id)]);
        for (const item of await driver.pending()) if (item.routeId) ids.add(item.routeId);
        for (const id of ids) await reconcile(id, state, false);
      });
    },
    notificationTarget(routeId: string, obstacleId: string): Promise<KnownObstacle | null> {
      return enqueue(async () => (await load()).obstacles[occurrenceKey(routeId, obstacleId)] ?? null);
    },
    /** Testing and external links share the same validated Maps URL. */
    directionsUrl: googleMapsDirectionsUrl,
  };
}
