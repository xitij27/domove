import { googleMapsDirectionsUrl, notificationContent, scheduleDecision } from './core';
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
  expect(notificationContent(route, { ...event, additionalMinutes: 8 }).body).toContain('detour of 8 minutes');
  const fallback = notificationContent(route, event).body;
  expect(fallback).toContain('Main Street');
  expect(fallback).toContain('TU Dortmund');
  expect(fallback).not.toContain('detour of');
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
