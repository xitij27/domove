import { createNotificationService, type NotificationDriver, type PendingReminder, type ReminderPayload } from './service';
import type { ConstructionObstacleEvent, NotificationRoute } from './model';

const route: NotificationRoute = { id: 'r1', start: { label: 'Home' }, destination: { label: 'Work' }, mode: 'car' };
const other: NotificationRoute = { id: 'r2', start: { label: 'Home' }, destination: { label: 'School' }, mode: 'pedestrian' };
const event: ConstructionObstacleEvent = { routeId: 'r1', obstacleId: 'c1', constructionLocation: 'Bridge', constructionStartDate: '2026-10-30' };
const now = () => new Date(2026, 9, 16, 8);

function setup(allowed = true, clock = now) {
  const values = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
  const pending: PendingReminder[] = [];
  const scheduled: { date: Date; payload: ReminderPayload }[] = [];
  const cancelled: string[] = [];
  const urgent: ReminderPayload[] = [];
  const driver: NotificationDriver = {
    permission: jest.fn(async () => allowed),
    pending: jest.fn(async () => [...pending]),
    schedule: jest.fn(async (date, payload) => {
      const id = `n${scheduled.length + 1}`;
      scheduled.push({ date, payload });
      pending.push({ id, routeId: payload.route.id, signature: payload.signature });
      return id;
    }),
    notifyNow: jest.fn(async (payload) => { urgent.push(payload); }),
    cancel: jest.fn(async (id) => {
      cancelled.push(id);
      const index = pending.findIndex((item) => item.id === id);
      if (index >= 0) pending.splice(index, 1);
    }),
  };
  return { storage, driver, pending, scheduled, cancelled, urgent, service: createNotificationService(storage, driver, clock) };
}

test('defaults to disabled and persists independent route preferences', async () => {
  const ctx = setup();
  expect(await ctx.service.getPreference(route.id)).toBe('DISABLED');
  await ctx.service.setPreference(route, 'ONE_WEEK_BEFORE');
  await ctx.service.setPreference(other, 'ONE_DAY_BEFORE');
  const reloaded = createNotificationService(ctx.storage, ctx.driver, now);
  expect(await reloaded.getPreference(route.id)).toBe('ONE_WEEK_BEFORE');
  expect(await reloaded.getPreference(other.id)).toBe('ONE_DAY_BEFORE');
  expect(await reloaded.getPreference('new')).toBe('DISABLED');
});

test('same event only schedules once across calls and app restarts', async () => {
  const ctx = setup();
  await ctx.service.setPreference(route, 'ONE_WEEK_BEFORE');
  await ctx.service.processObstacle(route, event);
  await ctx.service.processObstacle(route, event);
  await createNotificationService(ctx.storage, ctx.driver, now).reconcileAll();
  expect(ctx.scheduled).toHaveLength(1);
  expect(ctx.scheduled[0].date).toEqual(new Date(2026, 9, 23, 9));
  expect(ctx.pending).toHaveLength(1);
});

test('changing preference cancels old reminder and schedules new one', async () => {
  const ctx = setup();
  await ctx.service.setPreference(route, 'ONE_WEEK_BEFORE');
  await ctx.service.processObstacle(route, event);
  await ctx.service.setPreference(route, 'ONE_DAY_BEFORE');
  expect(ctx.cancelled).toEqual(['n1']);
  expect(ctx.pending).toHaveLength(1);
  expect(ctx.scheduled[1].date).toEqual(new Date(2026, 9, 29, 9));
});

test('disabled and deleted routes remove pending reminders and preferences', async () => {
  const ctx = setup();
  await ctx.service.setPreference(route, 'ONE_DAY_BEFORE');
  await ctx.service.processObstacle(route, event);
  await ctx.service.setPreference(route, 'DISABLED');
  expect(ctx.pending).toHaveLength(0);
  expect(await ctx.service.getPreference(route.id)).toBe('DISABLED');
  await ctx.service.setPreference(route, 'ONE_DAY_BEFORE');
  expect(ctx.pending).toHaveLength(1);
  await ctx.service.forgetRoute(route.id);
  expect(ctx.pending).toHaveLength(0);
  expect(await ctx.service.getPreference(route.id)).toBe('DISABLED');
});

test('updated and removed obstacles replace or cancel old reminders', async () => {
  const ctx = setup();
  await ctx.service.setPreference(route, 'ONE_WEEK_BEFORE');
  await ctx.service.processObstacle(route, event);
  await ctx.service.processObstacle(route, { ...event, constructionStartDate: '2026-11-06' });
  expect(ctx.cancelled).toEqual(['n1']);
  expect(ctx.scheduled[1].date).toEqual(new Date(2026, 9, 30, 9));
  await ctx.service.removeObstacle(route.id, event.obstacleId);
  expect(ctx.pending).toHaveLength(0);
});

test('missing dates, late announcements and denied permission do not schedule', async () => {
  const ctx = setup(false);
  await ctx.service.setPreference(route, 'ONE_DAY_BEFORE');
  expect(await ctx.service.processObstacle(route, event)).toMatch(/disabled in device settings/);
  expect(ctx.scheduled).toHaveLength(0);
  const allowed = setup();
  await allowed.service.setPreference(route, 'ONE_DAY_BEFORE');
  await allowed.service.processObstacle(route, { ...event, constructionStartDate: undefined });
  await allowed.service.processObstacle(route, { ...event, constructionStartDate: '2026-10-16' });
  expect(allowed.scheduled).toHaveLength(0);
});

test('invalid inputs and corrupted persisted preferences fall back safely', async () => {
  const ctx = setup();
  await expect(ctx.service.processObstacle(other, event)).rejects.toThrow('Invalid');
  await expect(ctx.service.setPreference(route, 'ALWAYS' as never)).rejects.toThrow('Invalid');
  await ctx.storage.setItem('@domove/construction-notifications/v1', JSON.stringify({ preferences: { r1: 'ALWAYS' }, obstacles: {} }));
  expect(await ctx.service.getPreference(route.id)).toBe('DISABLED');
});

test('old preferences migrate without losing a saved choice', async () => {
  const ctx = setup();
  await ctx.storage.setItem('@domove/construction-notifications/v1', JSON.stringify({ preferences: { r1: 'ONE_WEEK_BEFORE' }, obstacles: {} }));
  expect(await ctx.service.getSettings(route.id)).toEqual({ preference: 'ONE_WEEK_BEFORE', notificationTime: '09:00', importantUpdates: false });
});

test('custom time persists and preference changes preserve it', async () => {
  const ctx = setup();
  await ctx.service.setSettings(route, { preference: 'ONE_DAY_BEFORE', notificationTime: '18:00', commuteDays: ['monday'], departureTime: '07:30', importantUpdates: true });
  await ctx.service.processObstacle(route, event);
  expect(ctx.scheduled[0].date).toEqual(new Date(2026, 9, 29, 18));
  await ctx.service.setPreference(route, 'DISABLED');
  await ctx.service.setPreference(route, 'ONE_WEEK_BEFORE');
  expect(await ctx.service.getSettings(route.id)).toEqual({ preference: 'ONE_WEEK_BEFORE', notificationTime: '18:00', commuteDays: ['monday'], departureTime: '07:30', importantUpdates: true });
});

test('recent late updates alert once per route and revision, then cancel cleanly', async () => {
  const lateNow = () => new Date(2026, 9, 16, 10);
  const ctx = setup(true, lateNow);
  const late = { ...event, constructionStartDate: '2026-10-17', observedAt: '2026-10-16T05:30:00Z', revision: 'rev-1', change: 'NEW' as const };
  await ctx.service.setSettings(route, { preference: 'ONE_DAY_BEFORE', notificationTime: '09:00', importantUpdates: true });
  await ctx.service.processObstacle(route, late);
  await ctx.service.processObstacle(route, late);
  await createNotificationService(ctx.storage, ctx.driver, lateNow).reconcileAll();
  expect(ctx.urgent).toHaveLength(1);
  expect(ctx.scheduled).toHaveLength(0);
  await ctx.service.processObstacle(route, { ...late, revision: 'rev-2', change: 'SIGNIFICANT_CHANGE' });
  expect(ctx.urgent).toHaveLength(2);
  await ctx.service.processObstacle(route, { ...late, revision: 'rev-3', change: 'CANCELLED' });
  expect(await ctx.service.notificationTarget(route.id, event.obstacleId)).toBeNull();
  expect(ctx.urgent).toHaveLength(2);
});

test('disabled settings never send last-minute alerts and separate routes stay independent', async () => {
  const ctx = setup(true, () => new Date(2026, 9, 16, 10));
  const late = { ...event, constructionStartDate: '2026-10-17', observedAt: '2026-10-16T05:30:00Z', revision: 'rev-1', change: 'NEW' as const };
  await ctx.service.processObstacle(route, late);
  expect(ctx.urgent).toHaveLength(0);
  await ctx.service.setSettings(other, { preference: 'ONE_DAY_BEFORE', notificationTime: '09:00', importantUpdates: true });
  await ctx.service.processObstacle(other, { ...late, routeId: other.id });
  expect(ctx.urgent).toHaveLength(1);
  expect(await ctx.service.getPreference(route.id)).toBe('DISABLED');
});

test('only minimal route and obstacle fields are persisted', async () => {
  const ctx = setup();
  await ctx.service.processObstacle({ ...route, start: { label: 'Home', coordinate: { latitude: 1, longitude: 2 } } } as never,
    { ...event, internalGeometry: [1, 2, 3] } as never);
  const target = await ctx.service.notificationTarget(route.id, event.obstacleId);
  expect(target?.route.start).toEqual({ label: 'Home' });
  expect(target?.event).not.toHaveProperty('internalGeometry');
});

test('confirmed remote delivery cancels local reminders and can return to local mode', async () => {
  const ctx = setup();
  await ctx.service.setPreference(route, 'ONE_DAY_BEFORE');
  await ctx.service.processObstacle(route, event);
  expect(ctx.pending).toHaveLength(1);
  await ctx.service.setRemoteDelivery(route.id, true);
  expect(ctx.pending).toHaveLength(0);
  await ctx.service.processObstacle(route, event);
  expect(ctx.scheduled).toHaveLength(1);
  await ctx.service.setRemoteDelivery(route.id, false);
  expect(ctx.pending).toHaveLength(1);
});
