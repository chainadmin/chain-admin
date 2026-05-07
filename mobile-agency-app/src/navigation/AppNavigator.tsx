import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { navigateDeepLink } from '@/navigation/navigationRef';
import DashboardScreen from '@/screens/DashboardScreen';
import AccountsScreen from '@/screens/AccountsScreen';
import AccountDetailScreen from '@/screens/AccountDetailScreen';
import MessagingScreen from '@/screens/MessagingScreen';
import ComposeMessageScreen from '@/screens/ComposeMessageScreen';
import PaymentsScreen from '@/screens/PaymentsScreen';
import PostPaymentScreen from '@/screens/PostPaymentScreen';
import MoreScreen from '@/screens/MoreScreen';
import WalletScreen from '@/screens/WalletScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import TenantSwitcherScreen from '@/screens/TenantSwitcherScreen';
import { Text } from 'react-native';
import { colors } from '@/theme/colors';
import { registerForPushNotificationsAsync } from '@/lib/push';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.bgElevated },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '700' as const },
  contentStyle: { backgroundColor: colors.bg },
};

function tabIcon(label: string) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Text style={{ fontSize: 11, color, fontWeight: focused ? '700' : '500' }}>{label}</Text>
  );
}

function AccountsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="AccountsList" component={AccountsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AccountDetail" component={AccountDetailScreen} options={{ title: 'Account' }} />
      <Stack.Screen name="Compose" component={ComposeMessageScreen} options={{ title: 'Compose' }} />
      <Stack.Screen name="PostPayment" component={PostPaymentScreen} options={{ title: 'Post payment' }} />
    </Stack.Navigator>
  );
}

function MessagingStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MessagingList" component={MessagingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Compose" component={ComposeMessageScreen} options={{ title: 'Compose' }} />
    </Stack.Navigator>
  );
}

function PaymentsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="PaymentsList" component={PaymentsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PostPayment" component={PostPaymentScreen} options={{ title: 'Post payment' }} />
    </Stack.Navigator>
  );
}

function MoreStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MoreHome" component={MoreScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: 'Wallet' }} />
      <Stack.Screen name="TenantSwitcher" component={TenantSwitcherScreen} options={{ title: 'Tenant switcher' }} />
    </Stack.Navigator>
  );
}

type PushPayload = {
  type?: 'payment' | 'callback' | 'reply' | 'account';
  accountId?: string;
  consumerId?: string;
};

function deepLinkRoute(payload: PushPayload | undefined): { tab: string; screen?: string; params?: Record<string, unknown> } | null {
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

export default function AppNavigator() {
  useEffect(() => {
    registerForPushNotificationsAsync().catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as PushPayload | undefined;
      const route = deepLinkRoute(data);
      if (route) navigateDeepLink(route);
    });
    return () => sub.remove();
  }, []);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bgElevated, borderTopColor: colors.cardBorder },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarIcon: tabIcon('•'), tabBarLabel: 'Dashboard' }} />
      <Tab.Screen name="Accounts" component={AccountsStack} options={{ tabBarIcon: tabIcon('▣'), tabBarLabel: 'Accounts' }} />
      <Tab.Screen name="Messaging" component={MessagingStack} options={{ tabBarIcon: tabIcon('✉'), tabBarLabel: 'Messaging' }} />
      <Tab.Screen name="Payments" component={PaymentsStack} options={{ tabBarIcon: tabIcon('$'), tabBarLabel: 'Payments' }} />
      <Tab.Screen name="More" component={MoreStack} options={{ tabBarIcon: tabIcon('☰'), tabBarLabel: 'More' }} />
    </Tab.Navigator>
  );
}
