import * as Notifications from 'expo-notifications';
import { notificationDriver } from './runtime';
import type { RouteNotificationSettings } from './model';

/** Must be implemented only by an authenticated API that verifies route ownership. */
export type AuthenticatedNotificationGateway = {
  registerExpoToken: (token: string) => Promise<void>;
  revokeExpoToken: (token: string) => Promise<void>;
  /** Authenticated installation binding; also works after an app restart. */
  revokeCurrentInstallation: () => Promise<void>;
  saveRouteSettings: (routeId: string, settings: RouteNotificationSettings) => Promise<void>;
};

export type PushDevice = {
  permission: () => Promise<boolean>;
  expoToken: (projectId: string) => Promise<string>;
  onTokenChange: (listener: () => void) => () => void;
};

export function createExpoPushDevice(): PushDevice {
  return {
    permission: () => notificationDriver.permission(true),
    expoToken: async (projectId) => (await Notifications.getExpoPushTokenAsync({ projectId })).data,
    onTokenChange: (listener) => {
      const subscription = Notifications.addPushTokenListener(listener);
      return () => subscription.remove();
    },
  };
}

function validToken(token: string): boolean {
  return /^(Expo|Exponent)PushToken\[[^\]]{1,480}\]$/.test(token);
}

/** Inert until an authenticated gateway, an EAS project ID and push credentials exist. */
export function createRemotePushManager(device: PushDevice, gateway: AuthenticatedNotificationGateway, projectId: string) {
  let token: string | null = null;
  let stopListening: (() => void) | null = null;

  async function register(hasEnabledRoute: boolean): Promise<'registered' | 'permission-denied' | 'disabled'> {
    if (!hasEnabledRoute) {
      await gateway.revokeCurrentInstallation();
      token = null;
      return 'disabled';
    }
    if (!projectId) throw new Error('Remote push needs an EAS project ID.');
    if (!await device.permission()) {
      await gateway.revokeCurrentInstallation();
      token = null;
      return 'permission-denied';
    }
    const next = await device.expoToken(projectId);
    if (!validToken(next)) throw new Error('Expo returned an invalid push token.');
    if (next === token) return 'registered';
    await gateway.registerExpoToken(next); // The backend must derive user identity from its verified session.
    if (token && token !== next) await gateway.revokeExpoToken(token);
    token = next;
    return 'registered';
  }

  return {
    register,
    startRefresh(hasEnabledRoute: () => boolean, onError: (error: unknown) => void) {
      if (!stopListening) stopListening = device.onTokenChange(() => { void register(hasEnabledRoute()).catch(onError); });
      return () => { stopListening?.(); stopListening = null; };
    },
    async revoke() {
      await gateway.revokeCurrentInstallation();
      token = null;
      stopListening?.();
      stopListening = null;
    },
    async syncSettings(routeId: string, settings: RouteNotificationSettings) {
      // Keep the local copy until the authenticated backend confirms its write.
      await gateway.saveRouteSettings(routeId, settings);
    },
  };
}
