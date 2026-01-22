import { isExpoApp, getPlatform } from './expo-bridge';
import { apiCall } from './api';

export interface PushNotificationSchema {
  title?: string;
  body?: string;
  data?: Record<string, any>;
}

export interface ActionPerformed {
  notification: PushNotificationSchema;
  actionId: string;
}

export interface PushNotificationService {
  initialize: () => Promise<void>;
  registerToken: (token: string) => Promise<void>;
  handleNotification: (notification: PushNotificationSchema) => void;
  handleNotificationAction: (action: ActionPerformed) => void;
}

class PushNotificationManager implements PushNotificationService {
  private tokenRegisteredCallback?: (token: string) => void;
  private notificationReceivedCallback?: (notification: PushNotificationSchema) => void;
  private notificationActionCallback?: (action: ActionPerformed) => void;

  async initialize(): Promise<void> {
    if (!isExpoApp()) {
      console.log('Push notifications only available on native platforms');
      return;
    }

    console.log('Push notifications will be handled by native Expo wrapper');
  }

  async registerToken(token: string): Promise<void> {
    try {
      const authData = localStorage.getItem('consumerAuth');
      if (!authData) {
        console.log('No auth data available, token will be registered after login');
        localStorage.setItem('pendingPushToken', token);
        return;
      }

      const auth = JSON.parse(authData);
      const jwtToken = auth.token;
      
      if (!jwtToken) {
        console.log('No JWT token available');
        localStorage.setItem('pendingPushToken', token);
        return;
      }

      const response = await apiCall(
        'POST',
        '/api/consumer/push-token',
        { 
          token,
          platform: getPlatform(),
        },
        jwtToken
      );

      if (!response.ok) {
        console.error('Failed to register push token:', response.status, response.statusText);
        localStorage.setItem('pendingPushToken', token);
        return;
      }

      try {
        const data = await response.json();
        console.log('Push token registered successfully:', data);
      } catch (jsonError) {
        console.log('Push token registered (could not parse response)');
      }
      
      localStorage.removeItem('pendingPushToken');
      
      if (this.tokenRegisteredCallback) {
        this.tokenRegisteredCallback(token);
      }
    } catch (error) {
      console.error('Error registering push token:', error);
    }
  }

  handleNotification(notification: PushNotificationSchema): void {
    console.log('Handling notification:', notification);
    if (this.notificationReceivedCallback) {
      this.notificationReceivedCallback(notification);
    }
  }

  handleNotificationAction(action: ActionPerformed): void {
    console.log('Handling notification action:', action);
    
    const data = action.notification.data;
    
    if (data?.route) {
      window.location.href = data.route;
    }

    if (this.notificationActionCallback) {
      this.notificationActionCallback(action);
    }
  }

  onTokenRegistered(callback: (token: string) => void) {
    this.tokenRegisteredCallback = callback;
  }

  onNotificationReceived(callback: (notification: PushNotificationSchema) => void) {
    this.notificationReceivedCallback = callback;
  }

  onNotificationAction(callback: (action: ActionPerformed) => void) {
    this.notificationActionCallback = callback;
  }

  async registerPendingToken(): Promise<void> {
    const pendingToken = localStorage.getItem('pendingPushToken');
    if (pendingToken) {
      await this.registerToken(pendingToken);
    }
  }
}

export const pushNotificationService = new PushNotificationManager();
