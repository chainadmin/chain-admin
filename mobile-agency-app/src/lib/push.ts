import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushDevice } from './api';
import { navigateDeepLink } from '@/navigation/navigationRef';

type PushPayload = {
  type?: 'payment' | 'callback' | 'reply' | 'account';
  accountId?: string;
  consumerId?: string;
};

export function deepLinkRouteFromPayload(
  payload: PushPayload | undefined
): { tab: string; screen?: string; params?: Record<string, unknown> } | null {
  if (!payload || typeof payload !== 'object') return null;
  switch (payload.type) {
    case 'payment':
      return { tab: 'Payments' };
    case 'callback':
    case 'reply':
      return { tab: 'Messaging' };
    case 'account':
      return payload.accountId
        ? { tab: 'Accounts', screen: 'AccountDetail', params: { accountId: payload.accountId } }
        : { tab: 'Accounts' };
    default:
      return null;
  }
}

/** Cold-start: if the app was launched by tapping a notification, route now. */
export async function handleColdStartNotification(): Promise<void> {
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (!last) return;
    const data = last.notification.request.content.data as PushPayload | undefined;
    const route = deepLinkRouteFromPayload(data);
    if (route) navigateDeepLink(route);
  } catch {
    // ignore — not all platforms support this
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  let token: string | null = null;
  try {
    const result = await Notifications.getExpoPushTokenAsync();
    token = result.data;
  } catch {
    token = null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  if (token) {
    try {
      await registerPushDevice({
        pushToken: token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        expoToken: token,
      });
    } catch {
      // backend may not yet expose this endpoint; ignore
    }
  }
  return token;
}
