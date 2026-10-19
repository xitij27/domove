import { setLanguage } from '../i18n';
import { notificationContent, reminderDate } from './core';
import type { RouteNotificationSettings, RouteObstacle } from './model';

const obstacle: RouteObstacle = { routeId: 'r1', siteId: 's1', siteTitle: 'Hohe Straße', destination: 'TU Dortmund', startsOn: '2026-10-30', endsOn: '2026-11-20' };
const now = new Date(2026, 9, 16, 8);
const week: RouteNotificationSettings = { preference: 'ONE_WEEK_BEFORE', notificationTime: '09:00' };
const day: RouteNotificationSettings = { preference: 'ONE_DAY_BEFORE', notificationTime: '18:30' };

test('reminds the chosen lead time before the start, at the notification time', () => {
  expect(reminderDate(obstacle, week, now)).toEqual(new Date(2026, 9, 23, 9));
  expect(reminderDate(obstacle, day, now)).toEqual(new Date(2026, 9, 29, 18, 30));
});

test('disabled routes and finished construction get no reminder', () => {
  expect(reminderDate(obstacle, { ...week, preference: 'DISABLED' }, now)).toBeNull();
  expect(reminderDate({ ...obstacle, startsOn: '2026-10-01', endsOn: '2026-10-15' }, week, now)).toBeNull();
});

test('too late for the lead time, or already under way: the next notification time', () => {
  const soon = { ...obstacle, startsOn: '2026-10-19' };
  expect(reminderDate(soon, week, now)).toEqual(new Date(2026, 9, 16, 9));
  expect(reminderDate(soon, week, new Date(2026, 9, 16, 10))).toEqual(new Date(2026, 9, 17, 9));
  expect(reminderDate({ ...obstacle, startsOn: '2026-10-01' }, week, now)).toEqual(new Date(2026, 9, 16, 9));
  expect(reminderDate({ ...obstacle, startsOn: null, endsOn: null }, week, now)).toEqual(new Date(2026, 9, 16, 9));
});

test('no reminder when construction ends before the next notification time', () => {
  expect(reminderDate({ ...obstacle, startsOn: '2026-10-01', endsOn: '2026-10-16' }, week, new Date(2026, 9, 16, 10))).toBeNull();
});

test('local wall-clock time survives daylight-saving changes', () => {
  // Germany leaves summer time on 25 Oct 2026; the reminder still shows 09:00 on the clock.
  expect(reminderDate({ ...obstacle, startsOn: '2026-11-01', endsOn: null }, week, now)).toEqual(new Date(2026, 9, 25, 9));
});

test('the message says when future work starts and that tapping opens Google Maps', () => {
  expect(notificationContent(obstacle, now).body).toBe(
    'There will be a Construction Site at Hohe Straße on your Route to TU Dortmund from 30/10/2026. Tap to open the route in Google Maps.');
  expect(notificationContent({ ...obstacle, startsOn: '2026-10-01', destination: null }, now).body).toBe(
    'There is a Construction Site at Hohe Straße on your Route. Tap to open the route in Google Maps.');
});

test('the message is in the app\'s language', () => {
  setLanguage('de', false);
  try {
    expect(notificationContent(obstacle, now)).toEqual({
      title: 'Baustelle auf deiner Route',
      body: 'Ab 30.10.2026 gibt es auf deiner Route nach TU Dortmund eine Baustelle: Hohe Straße. Tippe, um die Route in Google Maps zu öffnen.',
    });
  } finally {
    setLanguage('en', false);
  }
});
