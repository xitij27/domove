import type { RouteObstacle } from './model';
import { createNotificationService, type NotificationDriver, type ReminderPayload } from './service';

const bridge: RouteObstacle = { routeId: 'r1', siteId: 's1', siteTitle: 'Bridge', destination: 'Work', startsOn: '2026-10-30', endsOn: null };
const school: RouteObstacle = { routeId: 'r2', siteId: 's2', siteTitle: 'Park', destination: 'School', startsOn: '2026-10-30', endsOn: null };
const week = { preference: 'ONE_WEEK_BEFORE', notificationTime: '09:00' } as const;

function setup(allowed = true, routeLink = jest.fn(async (routeId: string) => `https://www.google.com/maps/dir/?api=1&origin=${routeId}&destination=work`)) {
  let file: string | null = null;
  const storage = { read: () => file, write: (value: string) => { file = value; } };
  const clock = { now: new Date(2026, 9, 16, 8) };
  // Like the phone: a reminder leaves the pending list once it has fired.
  const scheduled: { id: string; date: Date; payload: ReminderPayload }[] = [];
  const pending: typeof scheduled = [];
  const driver: NotificationDriver = {
    permission: jest.fn(async () => allowed),
    pending: async () => pending.filter((item) => item.date > clock.now).map(({ id, payload }) => ({ id, signature: payload.signature })),
    schedule: jest.fn(async (date, payload) => {
      const item = { id: `n${scheduled.length + 1}`, date, payload };
      scheduled.push(item);
      pending.push(item);
      return item.id;
    }),
    cancel: jest.fn(async (id) => { pending.splice(pending.findIndex((item) => item.id === id), 1); }),
  };
  const create = () => createNotificationService(storage, driver, () => clock.now, routeLink);
  return { storage, clock, driver, routeLink, scheduled, pending, create, service: create(), setFile: (value: string) => { file = value; } };
}

test('settings default to disabled and are kept per route across restarts', async () => {
  const ctx = setup();
  expect((await ctx.service.getSettings('r1')).preference).toBe('DISABLED');
  await ctx.service.setSettings('r1', week);
  await ctx.service.setSettings('r2', { preference: 'ONE_DAY_BEFORE', notificationTime: '18:00' });
  const reloaded = ctx.create();
  expect(await reloaded.getSettings('r1')).toEqual(week);
  expect((await reloaded.getSettings('r2')).preference).toBe('ONE_DAY_BEFORE');
  expect((await reloaded.getSettings('r3')).preference).toBe('DISABLED');
});

test('only routes with alerts on get a reminder, and only once across syncs and restarts', async () => {
  const ctx = setup();
  await ctx.service.setSettings('r1', week);
  await ctx.service.sync([bridge, school]);
  await ctx.service.sync([bridge, school]);
  await ctx.create().sync([bridge, school]);
  expect(ctx.scheduled).toHaveLength(1);
  expect(ctx.scheduled[0].date).toEqual(new Date(2026, 9, 23, 9));
  expect(ctx.scheduled[0].payload).toMatchObject({
    routeId: 'r1', siteId: 's1', googleMapsUrl: 'https://www.google.com/maps/dir/?api=1&origin=r1&destination=work',
  });
  expect(ctx.routeLink).toHaveBeenCalledWith('r1');
});

test('changing the setting moves the reminder and disabling cancels it', async () => {
  const ctx = setup();
  await ctx.service.sync([bridge]);
  await ctx.service.setSettings('r1', week);
  await ctx.service.setSettings('r1', { preference: 'ONE_DAY_BEFORE', notificationTime: '09:00' });
  expect(ctx.pending.map((item) => item.date)).toEqual([new Date(2026, 9, 29, 9)]);
  await ctx.service.setSettings('r1', { ...week, preference: 'DISABLED' });
  expect(ctx.pending).toHaveLength(0);
});

test('a delivered reminder is not sent again', async () => {
  const ctx = setup();
  await ctx.service.setSettings('r1', week);
  await ctx.service.sync([{ ...bridge, startsOn: '2026-10-01' }]);
  expect(ctx.scheduled[0].date).toEqual(new Date(2026, 9, 16, 9));
  ctx.clock.now = new Date(2026, 9, 16, 12);
  await ctx.service.sync([{ ...bridge, startsOn: '2026-10-01' }]);
  ctx.clock.now = new Date(2026, 9, 20, 12);
  await ctx.create().sync([{ ...bridge, startsOn: '2026-10-01' }]);
  expect(ctx.scheduled).toHaveLength(1);
});

test('reports each site\'s reminder on a route as scheduled or sent, and none while alerts are off or blocked', async () => {
  const ctx = setup();
  const started = { ...bridge, siteId: 's3', startsOn: '2026-10-01' };
  await ctx.service.sync([bridge, started, school]);
  expect(await ctx.service.remindersOn('r1')).toEqual([]);
  await ctx.service.setSettings('r1', week);
  expect(await ctx.service.remindersOn('r1')).toEqual([
    { siteId: 's1', at: new Date(2026, 9, 23, 9).getTime(), sent: false },
    { siteId: 's3', at: new Date(2026, 9, 16, 9).getTime(), sent: false },
  ]);
  ctx.clock.now = new Date(2026, 9, 16, 12);
  await ctx.service.setSettings('r1', { ...week, preference: 'DISABLED' });
  expect(await ctx.service.remindersOn('r1')).toEqual([{ siteId: 's3', at: new Date(2026, 9, 16, 9).getTime(), sent: true }]);
  const blocked = setup(false);
  await blocked.service.sync([bridge]);
  await blocked.service.setSettings('r1', week);
  expect(await blocked.service.remindersOn('r1')).toEqual([]);
});

test('obstacles gone from the backend and deleted routes lose their reminders', async () => {
  const ctx = setup();
  await ctx.service.setSettings('r1', week);
  await ctx.service.setSettings('r2', week);
  await ctx.service.sync([bridge, school]);
  expect(ctx.pending).toHaveLength(2);
  await ctx.service.sync([school]);
  expect(ctx.pending.map((item) => item.payload.siteId)).toEqual(['s2']);
  await ctx.service.forgetRoute('r2');
  expect(ctx.pending).toHaveLength(0);
  expect((await ctx.service.getSettings('r2')).preference).toBe('DISABLED');
});

test('denied permission keeps the choice and warns', async () => {
  const ctx = setup(false);
  await ctx.service.sync([bridge]);
  expect(await ctx.service.setSettings('r1', week)).toMatch(/turned off/);
  expect(ctx.driver.permission).toHaveBeenLastCalledWith(true);
  expect(ctx.scheduled).toHaveLength(0);
  expect(await ctx.service.getSettings('r1')).toEqual(week);
});

test('a broken file and invalid settings fall back safely', async () => {
  const ctx = setup();
  ctx.setFile('{"settings":{"r1":{"preference":"SOON"}},"obstacles":[{"routeId":1}],"due":"x"}');
  expect((await ctx.service.getSettings('r1')).preference).toBe('DISABLED');
  await expect(ctx.service.setSettings('r1', { preference: 'ONE_WEEK_BEFORE', notificationTime: '9am' })).rejects.toThrow();
  ctx.setFile('not json');
  await ctx.service.sync([bridge]);
  expect(ctx.scheduled).toHaveLength(0);
});
