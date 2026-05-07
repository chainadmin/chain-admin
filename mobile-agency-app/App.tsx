import React from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { navigationRef } from '@/navigation/navigationRef';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import LoginScreen from '@/screens/LoginScreen';
import AppNavigator from '@/navigation/AppNavigator';
import { colors } from '@/theme/colors';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.text,
    primary: colors.primary,
    border: colors.cardBorder,
    notification: colors.danger,
  },
};

function Root() {
  const { isReady, isAuthenticated } = useAuth();
  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {isAuthenticated ? <AppNavigator /> : <LoginScreen />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
          <Root />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
