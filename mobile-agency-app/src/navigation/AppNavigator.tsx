import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { navigateDeepLink } from '@/navigation/navigationRef';
import { deepLinkRouteFromPayload, handleColdStartNotification, registerForPushNotificationsAsync } from '@/lib/push';
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
import type {
  AccountsStackParamList,
  MessagingStackParamList,
  MoreStackParamList,
  PaymentsStackParamList,
  RootTabParamList,
} from '@/navigation/types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const AccountsNav = createNativeStackNavigator<AccountsStackParamList>();
const MessagingNav = createNativeStackNavigator<MessagingStackParamList>();
const PaymentsNav = createNativeStackNavigator<PaymentsStackParamList>();
const MoreNav = createNativeStackNavigator<MoreStackParamList>();

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
    <AccountsNav.Navigator screenOptions={screenOptions}>
      <AccountsNav.Screen name="AccountsList" component={AccountsScreen} options={{ headerShown: false }} />
      <AccountsNav.Screen name="AccountDetail" component={AccountDetailScreen} options={{ title: 'Account' }} />
      <AccountsNav.Screen name="Compose" component={ComposeMessageScreen} options={{ title: 'Compose' }} />
      <AccountsNav.Screen name="PostPayment" component={PostPaymentScreen} options={{ title: 'Post payment' }} />
    </AccountsNav.Navigator>
  );
}

function MessagingStack() {
  return (
    <MessagingNav.Navigator screenOptions={screenOptions}>
      <MessagingNav.Screen name="MessagingList" component={MessagingScreen} options={{ headerShown: false }} />
      <MessagingNav.Screen name="Compose" component={ComposeMessageScreen} options={{ title: 'Compose' }} />
    </MessagingNav.Navigator>
  );
}

function PaymentsStack() {
  return (
    <PaymentsNav.Navigator screenOptions={screenOptions}>
      <PaymentsNav.Screen name="PaymentsList" component={PaymentsScreen} options={{ headerShown: false }} />
      <PaymentsNav.Screen name="PostPayment" component={PostPaymentScreen} options={{ title: 'Post payment' }} />
    </PaymentsNav.Navigator>
  );
}

function MoreStack() {
  return (
    <MoreNav.Navigator screenOptions={screenOptions}>
      <MoreNav.Screen name="MoreHome" component={MoreScreen} options={{ headerShown: false }} />
      <MoreNav.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <MoreNav.Screen name="Wallet" component={WalletScreen} options={{ title: 'Wallet' }} />
      <MoreNav.Screen name="TenantSwitcher" component={TenantSwitcherScreen} options={{ title: 'Tenant switcher' }} />
    </MoreNav.Navigator>
  );
}

export default function AppNavigator() {
  useEffect(() => {
    registerForPushNotificationsAsync().catch(() => undefined);
    // Cold-start: route immediately if the app launched via notification tap.
    handleColdStartNotification();
    // Warm: route on subsequent taps.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Parameters<typeof deepLinkRouteFromPayload>[0];
      const route = deepLinkRouteFromPayload(data);
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
