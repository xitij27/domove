import { googleMapsDirectionsUrl, lastMinuteDecision, notificationContent, scheduleDecision } from './core';
import { DEFAULT_SETTINGS } from './model';
import type { ConstructionObstacleEvent, NotificationRoute } from './model';

const route: NotificationRoute = { id: 'route-1', start: { label: 'Home' }, destination: { label: 'TU Dortmund' }, mode: 'bike', waypoints: [{ label: 'Park' }] };
const event: ConstructionObstacleEvent = { routeId: 'route-1', obstacleId: 'site-1', constructionLocation: 'Main Street', constructionStartDate: '2026-10-30' };
const now = new Date(2026, 9, 16, 8);

test('one week and one day are calculated at 09:00 local time', () => {
  expect(scheduleDecision(event, 'ONE_WEEK_BEFORE', now).date).toEqual(new Date(2026, 9, 23, 9));
  expect(scheduleDecision(event, 'ONE_DAY_BEFORE', now).date).toEqual(new Date(2026, 9, 29, 9));
});

test('disabled, missing, invalid and late dates do not schedule', () => {
  expect(scheduleDecision(event, 'DISABLED', now).date).toBeNull();
  expect(scheduleDecision({ ...event, constructionStartDate: undefined }, 'ONE_DAY_BEFORE', now).date).toBeNull();
  expect(scheduleDecision({ ...event, constructionStartDate: '2026-02-30' }, 'ONE_DAY_BEFORE', now).date).toBeNull();
  expect(scheduleDecision({ ...event, constructionStartDate: '2026-10-16' }, 'ONE_DAY_BEFORE', now).reason).toMatch(/passed/);
  expect(scheduleDecision({ ...event, constructionStartDate: '2026-10-01', constructionEndDate: '2026-10-02' }, 'ONE_DAY_BEFORE', now).reason).toMatch(/ended/);
  expect(scheduleDecision({ ...event, constructionEndDate: '2026-10-01' }, 'ONE_DAY_BEFORE', now).reason).toMatch(/before it starts/);
});

test('message contains only supplied detour estimates', () => {
  expect(notificationContent(route, { ...event, additionalMinutes: 8 }).body).toContain('Estimated additional travel time: 8 minutes');
  const fallback = notificationContent(route, event).body;
  expect(fallback).toContain('Main Street');
  expect(fallback).toContain('TU Dortmund');
  expect(fallback).not.toContain('Estimated additional travel time');
});

test('Google Maps directions URL maps mode and uses supported alternative waypoints', () => {
  const url = googleMapsDirectionsUrl(route, { ...event, alternativeWaypoints: ['Detour A', 'Detour B'] });
  expect(url).toContain('api=1');
  expect(url).toContain('travelmode=bicycling');
  expect(url).toContain('waypoints=Detour%20A%7CDetour%20B');
  expect(url).not.toContain('Park');
  expect(googleMapsDirectionsUrl({ ...route, mode: 'car' })).toContain('travelmode=driving');
  expect(googleMapsDirectionsUrl({ ...route, mode: 'pedestrian' })).toContain('travelmode=walking');
  expect(googleMapsDirectionsUrl({ ...route, start: { label: '' } })).toBeNull();
});

test('custom time is local and only reliable active weekdays filter a commute', () => {
  const settings = { ...DEFAULT_SETTINGS, preference: 'ONE_DAY_BEFORE' as const, notificationTime: '18:00', commuteDays: ['monday', 'tuesday'] as ('monday' | 'tuesday')[] };
  expect(scheduleDecision(event, settings, now).date).toEqual(new Date(2026, 9, 29, 18));
  expect(scheduleDecision({ ...event, activeWeekdays: ['sunday'] }, settings, now).reason).toMatch(/does not overlap/);
  expect(scheduleDecision({ ...event, activeWeekdays: undefined }, settings, now).date).not.toBeNull();
});

test('last-minute updates require explicit opt-in and a recent meaningful revision', () => {
  const late = { ...event, constructionStartDate: '2026-10-17', revision: 'v2', observedAt: '2026-10-16T05:30:00.000Z', change: 'NEW' as const };
  const settings = { ...DEFAULT_SETTINGS, preference: 'ONE_DAY_BEFORE' as const, importantUpdates: true };
  const afterReminder = new Date(2026, 9, 16, 10);
  expect(lastMinuteDecision(late, settings, afterReminder)).toBe(true);
  expect(lastMinuteDecision(late, { ...settings, importantUpdates: false }, afterReminder)).toBe(false);
  expect(lastMinuteDecision({ ...late, change: 'UNCHANGED' }, settings, afterReminder)).toBe(false);
  expect(lastMinuteDecision({ ...late, observedAt: '2026-10-01T00:00:00Z' }, settings, afterReminder)).toBe(false);
});

test('local wall-clock time survives daylight-saving changes', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/Berlin';
  try {
    const spring = scheduleDecision({ ...event, constructionStartDate: '2027-03-29' }, { ...DEFAULT_SETTINGS, preference: 'ONE_DAY_BEFORE', notificationTime: '09:00' }, new Date(2027, 2, 1));
    const autumn = scheduleDecision({ ...event, constructionStartDate: '2027-11-01' }, { ...DEFAULT_SETTINGS, preference: 'ONE_DAY_BEFORE', notificationTime: '09:00' }, new Date(2027, 9, 1));
    expect(spring.date?.getHours()).toBe(9);
    expect(spring.date?.getDate()).toBe(28);
    expect(autumn.date?.getHours()).toBe(9);
    expect(autumn.date?.getDate()).toBe(31);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
