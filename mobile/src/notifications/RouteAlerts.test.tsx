import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import RouteAlerts, { siteAlert, useRouteAlerts } from './RouteAlerts';
import type { RouteNotificationSettings } from './model';
import { constructionNotifications } from './runtime';

jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));
jest.mock('./runtime', () => ({
  constructionNotifications: { getSettings: jest.fn(), remindersOn: jest.fn(), setSettings: jest.fn() },
  sendDevelopmentTestAlert: jest.fn(),
}));

const blocked = 'Notifications are turned off for this app in your phone settings, so no alert was scheduled.';
let stored: RouteNotificationSettings;

/** The route card's alerts, and the line the card of site s1 shows. */
function OnMap() {
  const alerts = useRouteAlerts('r1');
  if (!alerts) return null;
  return (
    <>
      <RouteAlerts alerts={alerts} theme="day" />
      <Text>{siteAlert(alerts, 's1') ?? 'Unknown'}</Text>
    </>
  );
}

beforeEach(() => {
  stored = { preference: 'DISABLED', notificationTime: '09:00' };
  jest.mocked(constructionNotifications.getSettings).mockImplementation(async () => stored);
  jest.mocked(constructionNotifications.remindersOn).mockImplementation(async () =>
    stored.preference === 'DISABLED' ? [] : [{ siteId: 's1', at: new Date(2026, 9, 23, 9).getTime(), sent: false }]);
  jest.mocked(constructionNotifications.setSettings).mockImplementation(async (_routeId, settings) => { stored = settings; return null; });
});

test('alerts are turned on in the route card, and the site card says when its alert comes', async () => {
  await render(<OnMap />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Alerts off' }));
  expect(screen.getByText('Alerts are off for this route')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: '1 day before' }));
  expect(constructionNotifications.setSettings).toHaveBeenCalledWith('r1', { preference: 'ONE_DAY_BEFORE', notificationTime: '09:00' });
  expect(await screen.findByText(/^Alert .*09:00$/)).toBeOnTheScreen();
  expect(screen.getByText('Alerts 1 day before at 09:00')).toBeOnTheScreen();
  expect(screen.getByText(/^Next .*09:00$/)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Alert time' })).toBeOnTheScreen();
});

test('a phone that blocks alerts keeps the choice and says why none is scheduled', async () => {
  jest.mocked(constructionNotifications.remindersOn).mockResolvedValue([]);
  jest.mocked(constructionNotifications.setSettings).mockImplementationOnce(async (_routeId, settings) => { stored = settings; return blocked; });
  await render(<OnMap />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Alerts off' }));
  await fireEvent.press(screen.getByRole('radio', { name: '1 week before' }));
  expect(await screen.findByText(blocked)).toBeOnTheScreen();
  expect(screen.getByText('Alerts 1 week before at 09:00')).toBeOnTheScreen();
  expect(screen.getByText('No alert scheduled')).toBeOnTheScreen();
});
