import { PushNotifications } from '@capacitor/push-notifications';
import type { Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { apiCall } from './api';

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
    if (!Capacitor.isNativePlatform()) {
      console.log('Push notifications only available on native platforms');
      return;
    }

    try {
      // Request permission to use push notifications
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.log('Push notification permissions not granted');
        return; // Don't throw, just return quietly
      }

      // Register with Apple / Google to receive push via APNS/FCM
      await PushNotifications.register();

      // On success, we should be able to receive notifications
      await this.addListeners();

      console.log('Push notifications initialized successfully');
    } catch (error) {
      console.error('Error initializing push notifications:', error);
      // Don't throw - just log and continue
    }
  }

  private async addListeners() {
    // Registration success
    await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('Push registration success, token:', token.value);
      await this.registerToken(token.value);
    });

    // Registration error
    await PushNotifications.addListener('registrationError', (error: any) => {
      console.error('Push registration error:', error);
    });

    // Show us the notification payload if the app is open on our device
    await PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        console.log('Push notification received:', notification);
        this.handleNotification(notification);
      }
    );

    // Method called when tapping on a notification
    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: ActionPerformed) => {
        console.log('Push notification action performed:', action);
        this.handleNotificationAction(action);
      }
    );
  }

  async registerToken(token: string): Promise<void> {
    try {
      // Get consumer auth from localStorage
      const authData = localStorage.getItem('consumerAuth');
      if (!authData) {
        console.log('No auth data available, token will be registered after login');
        // Store token temporarily to register after login
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

      // Send token to backend using apiCall helper (works on mobile)
      const response = await apiCall(
        'POST',
        '/api/consumer/push-token',
        { 
          token,
          platform: Capacitor.getPlatform(),
        },
        jwtToken
      );

      if (!response.ok) {
        console.error('Failed to register push token:', response.status, response.statusText);
        // Store token to retry later
        localStorage.setItem('pendingPushToken', token);
        return;
      }

      // Try to parse JSON response, but don't crash if it fails
      try {
        const data = await response.json();
        console.log('Push token registered successfully:', data);
      } catch (jsonError) {
        console.log('Push token registered (could not parse response)');
      }
      
      // Remove pending token
      localStorage.removeItem('pendingPushToken');
      
      if (this.tokenRegisteredCallback) {
        this.tokenRegisteredCallback(token);
      }
    } catch (error) {
      console.error('Error registering push token:', error);
      // Don't crash - just log and continue
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
    
    // Navigate based on notification data
    const data = action.notification.data;
    
    if (data.route) {
      // Use wouter or native routing to navigate
      window.location.href = data.route;
    }

    if (this.notificationActionCallback) {
      this.notificationActionCallback(action);
    }
  }

  // Allow components to set callbacks
  onTokenRegistered(callback: (token: string) => void) {
    this.tokenRegisteredCallback = callback;
  }

  onNotificationReceived(callback: (notification: PushNotificationSchema) => void) {
    this.notificationReceivedCallback = callback;
  }

  onNotificationAction(callback: (action: ActionPerformed) => void) {
    this.notificationActionCallback = callback;
  }

  // Check for pending token and register it
  async registerPendingToken(): Promise<void> {
    const pendingToken = localStorage.getItem('pendingPushToken');
    if (pendingToken) {
      await this.registerToken(pendingToken);
    }
  }
}

export const pushNotificationService = new PushNotificationManager();
