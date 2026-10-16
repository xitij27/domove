import { notificationContent, obstacleKey, reminderDate } from './core';
import { DEFAULT_SETTINGS, type RouteNotificationSettings, type RouteObstacle, isObstacle, isSettings } from './model';

type StoredState = {
  settings: Record<string, RouteNotificationSettings>;
  /** The last list the backend returned. */
  obstacles: RouteObstacle[];
  /** When each obstacle's reminder fires; a time in the past means it was delivered and is not sent again. */
  due: Record<string, number>;
};

/** A site's reminder as scheduled on the phone: when it fires, or fired. */
export type SiteReminder = { siteId: string; at: number; sent: boolean };
export type PendingReminder = { id: string; signature: string };
export type ReminderPayload = { title: string; body: string; siteId: string; signature: string };
export type NotificationDriver = {
  permission: (request: boolean) => Promise<boolean>;
  /** Only the reminders this service scheduled. */
  pending: () => Promise<PendingReminder[]>;
  schedule: (date: Date, payload: ReminderPayload) => Promise<string>;
  cancel: (id: string) => Promise<void>;
};
export type TextStorage = { read: () => string | null; write: (value: string) => void };

function readState(raw: string | null): StoredState {
  const state: StoredState = { settings: {}, obstacles: [], due: {} };
  try {
    const value = raw ? JSON.parse(raw) as Partial<StoredState> : {};
    for (const [id, settings] of Object.entries(value.settings ?? {})) if (isSettings(settings)) state.settings[id] = settings;
    if (Array.isArray(value.obstacles)) state.obstacles = value.obstacles.filter(isObstacle);
    for (const [key, at] of Object.entries(value.due ?? {})) if (Number.isFinite(at)) state.due[key] = at;
  } catch {
    // A broken file only costs the saved choices; it must not stop the app.
  }
  return state;
}

/** Operations run one at a time, so a sync and a settings change can't schedule the same reminder twice. */
export function createNotificationService(storage: TextStorage, driver: NotificationDriver, now: () => Date = () => new Date()) {
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  }
  const load = () => readState(storage.read());

  /** Brings the scheduled reminders in line with the state, then saves it. Returns a warning for the user, if any. */
  async function reconcile(state: StoredState, requestPermission: boolean): Promise<string | null> {
    const time = now();
    const due: StoredState['due'] = {};
    const wanted = new Map<string, { date: Date; key: string; payload: ReminderPayload }>();
    for (const obstacle of state.obstacles) {
      const key = obstacleKey(obstacle);
      if (state.due[key] !== undefined && state.due[key] <= time.getTime()) {
        due[key] = state.due[key];
        continue;
      }
      const date = reminderDate(obstacle, state.settings[obstacle.routeId] ?? DEFAULT_SETTINGS, time);
      if (!date) continue;
      const content = notificationContent(obstacle, time);
      const signature = JSON.stringify([key, date.getTime(), content.body]);
      wanted.set(signature, { date, key, payload: { ...content, siteId: obstacle.siteId, signature } });
    }
    const allowed = wanted.size > 0 && await driver.permission(requestPermission);
    const kept = new Set<string>();
    for (const item of await driver.pending()) {
      if (allowed && wanted.has(item.signature) && !kept.has(item.signature)) kept.add(item.signature);
      else await driver.cancel(item.id);
    }
    if (allowed) {
      for (const [signature, { date, key, payload }] of wanted) {
        if (!kept.has(signature)) await driver.schedule(date, payload);
        due[key] = date.getTime();
      }
    }
    state.due = due;
    storage.write(JSON.stringify(state));
    return wanted.size > 0 && !allowed
      ? 'Notifications are turned off for this app in your phone settings, so no alert was scheduled.'
      : null;
  }

  return {
    getSettings(routeId: string): Promise<RouteNotificationSettings> {
      return enqueue(async () => load().settings[routeId] ?? DEFAULT_SETTINGS);
    },
    setSettings(routeId: string, settings: RouteNotificationSettings): Promise<string | null> {
      return enqueue(async () => {
        if (!isSettings(settings)) throw new Error('Invalid notification settings.');
        const state = load();
        state.settings[routeId] = settings;
        return reconcile(state, settings.preference !== 'DISABLED');
      });
    },
    /** Replaces the known obstacles with the backend's current list. */
    sync(obstacles: RouteObstacle[]): Promise<void> {
      return enqueue(async () => {
        const state = load();
        state.obstacles = obstacles;
        await reconcile(state, false);
      });
    },
    forgetRoute(routeId: string): Promise<void> {
      return enqueue(async () => {
        const state = load();
        delete state.settings[routeId];
        state.obstacles = state.obstacles.filter((obstacle) => obstacle.routeId !== routeId);
        await reconcile(state, false);
      });
    },
    obstaclesOn(routeId: string): Promise<RouteObstacle[]> {
      return enqueue(async () => load().obstacles.filter((obstacle) => obstacle.routeId === routeId));
    },
    /** Only reminders that were really scheduled, so none while alerts are off or the phone blocks them. */
    remindersOn(routeId: string): Promise<SiteReminder[]> {
      return enqueue(async () => {
        const state = load();
        const time = now().getTime();
        return state.obstacles.flatMap((obstacle) => {
          const at = state.due[obstacleKey(obstacle)];
          return obstacle.routeId === routeId && at !== undefined ? [{ siteId: obstacle.siteId, at, sent: at <= time }] : [];
        });
      });
    },
  };
}
