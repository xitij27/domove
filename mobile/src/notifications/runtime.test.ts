import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { openNotificationInMaps, startNotificationRuntime } from './runtime';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
}));

const route = { id: 'r1', start: { label: 'Home' }, destination: { label: 'Work' }, mode: 'car' };

test('notification data opens the saved route in Google Maps', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(undefined);
  expect(await openNotificationInMaps({ route })).toBe(true);
  expect(open).toHaveBeenCalledWith(expect.stringContaining('origin=Home&destination=Work&travelmode=driving'));
  open.mockRestore();
});

test('invalid route data is ignored without opening Maps', async () => {
  const open = jest.spyOn(Linking, 'openURL');
  expect(await openNotificationInMaps({ route: { id: 'r1' } })).toBe(false);
  expect(open).not.toHaveBeenCalled();
  open.mockRestore();
});

test('tap listener handles an already-opened app and clears consumed response', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const stop = startNotificationRuntime();
  const listener = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls[0][0];
  listener({ notification: { request: { identifier: 'test-1', content: { data: { route } } } } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(open).toHaveBeenCalledTimes(1);
  expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
  stop();
  open.mockRestore();
});
