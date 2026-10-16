import { createNotificationService, type NotificationDriver, type PendingReminder, type ReminderPayload } from './service';
import type { ConstructionObstacleEvent, NotificationRoute } from './model';

const route: NotificationRoute = { id: 'r1', start: { label: 'Home' }, destination: { label: 'Work' }, mode: 'car' };
const other: NotificationRoute = { id: 'r2', start: { label: 'Home' }, destination: { label: 'School' }, mode: 'pedestrian' };
const event: ConstructionObstacleEvent = { routeId: 'r1', obstacleId: 'c1', constructionLocation: 'Bridge', constructionStartDate: '2026-10-30' };
const now = () => new Date(2026, 9, 16, 8);

function setup(allowed = true) {
  const values = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
  const pending: PendingReminder[] = [];
  const scheduled: { date: Date; payload: ReminderPayload }[] = [];
  const cancelled: string[] = [];
  const driver: NotificationDriver = {
    permission: jest.fn(async () => allowed),
    pending: jest.fn(async () => [...pending]),
    schedule: jest.fn(async (date, payload) => {
      const id = `n${scheduled.length + 1}`;
      scheduled.push({ date, payload });
      pending.push({ id, routeId: payload.route.id, signature: payload.signature });
      return id;
    }),
    cancel: jest.fn(async (id) => {
      cancelled.push(id);
      const index = pending.findIndex((item) => item.id === id);
      if (index >= 0) pending.splice(index, 1);
    }),
  };
  return { storage, driver, pending, scheduled, cancelled, service: createNotificationService(storage, driver, now) };
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
