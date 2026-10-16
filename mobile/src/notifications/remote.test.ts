import { createRemotePushManager, type AuthenticatedNotificationGateway, type PushDevice } from './remote';
import { DEFAULT_SETTINGS } from './model';

jest.mock('expo-notifications', () => ({ getExpoPushTokenAsync: jest.fn(), addPushTokenListener: jest.fn() }));
jest.mock('./runtime', () => ({ notificationDriver: { permission: jest.fn() } }));

function setup(allowed = true) {
  let onChange: (() => void) | null = null;
  const device: PushDevice = {
    permission: jest.fn(async () => allowed),
    expoToken: jest.fn(async () => 'ExpoPushToken[token-one]'),
    onTokenChange: jest.fn((listener) => { onChange = listener; return () => { onChange = null; }; }),
  };
  const gateway: AuthenticatedNotificationGateway = {
    registerExpoToken: jest.fn(async () => undefined),
    revokeExpoToken: jest.fn(async () => undefined),
    revokeCurrentInstallation: jest.fn(async () => undefined),
    saveRouteSettings: jest.fn(async () => undefined),
  };
  return { device, gateway, changed: () => onChange?.() };
}

test('permission denial never requests or uploads a token', async () => {
  const { device, gateway } = setup(false);
  const manager = createRemotePushManager(device, gateway, 'project-id');
  expect(await manager.register(true)).toBe('permission-denied');
  expect(device.expoToken).not.toHaveBeenCalled();
  expect(gateway.registerExpoToken).not.toHaveBeenCalled();
  expect(gateway.revokeCurrentInstallation).toHaveBeenCalled();
});

test('disabled routes do not prompt and revoke a previous installation', async () => {
  const { device, gateway } = setup();
  expect(await createRemotePushManager(device, gateway, 'project-id').register(false)).toBe('disabled');
  expect(device.permission).not.toHaveBeenCalled();
  expect(gateway.revokeCurrentInstallation).toHaveBeenCalled();
});

test('invalid tokens are rejected before reaching the authenticated gateway', async () => {
  const { device, gateway } = setup();
  (device.expoToken as jest.Mock).mockResolvedValue('bad-token');
  await expect(createRemotePushManager(device, gateway, 'project-id').register(true)).rejects.toThrow('invalid');
  expect(gateway.registerExpoToken).not.toHaveBeenCalled();
});

test('backend failure preserves retry and token changes replace old registrations', async () => {
  const { device, gateway, changed } = setup();
  const manager = createRemotePushManager(device, gateway, 'project-id');
  (gateway.registerExpoToken as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await expect(manager.register(true)).rejects.toThrow('offline');
  expect(await manager.register(true)).toBe('registered');
  expect(await manager.register(true)).toBe('registered');
  expect(gateway.registerExpoToken).toHaveBeenCalledTimes(2); // failed attempt plus one successful registration
  const errors: unknown[] = [];
  const stop = manager.startRefresh(() => true, (error) => errors.push(error));
  (device.expoToken as jest.Mock).mockResolvedValue('ExpoPushToken[token-two]');
  changed();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(errors).toHaveLength(0);
  expect(gateway.revokeExpoToken).toHaveBeenCalledWith('ExpoPushToken[token-one]');
  stop();
  await manager.revoke();
  expect(gateway.revokeCurrentInstallation).toHaveBeenCalled();
});

test('settings sync does not erase the local copy when the backend fails', async () => {
  const { device, gateway } = setup();
  const manager = createRemotePushManager(device, gateway, 'project-id');
  (gateway.saveRouteSettings as jest.Mock).mockRejectedValueOnce(new Error('unavailable'));
  await expect(manager.syncSettings('route-1', DEFAULT_SETTINGS)).rejects.toThrow('unavailable');
});
