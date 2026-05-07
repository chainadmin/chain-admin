import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Field, H1, Muted, Screen, Small } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { extractErrorMessage } from '@/navigation/types';
import { colors, spacing } from '@/theme/colors';
import SignupChooserScreen from './SignupChooserScreen';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  if (showSignup) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SignupChooserScreen />
        <View style={{ padding: spacing.lg }}>
          <Button title="Back to sign in" variant="ghost" fullWidth onPress={() => setShowSignup(false)} />
        </View>
      </View>
    );
  }

  const onSubmit = async () => {
    if (!username || !password) {
      Alert.alert('Missing info', 'Please enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (e) {
      const msg = extractErrorMessage(e) || 'Login failed';
      Alert.alert('Login failed', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <Screen style={{ paddingVertical: spacing.xxl }}>
          <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
            <Image
              source={require('../../assets/icon.png')}
              style={{ width: 96, height: 96, borderRadius: 24, marginBottom: spacing.lg }}
              resizeMode="contain"
            />
            <H1>Chain Agency</H1>
            <Muted style={{ marginTop: 4 }}>Sign in to your agency dashboard</Muted>
          </View>

          <View style={{ gap: spacing.lg }}>
            <Field
              label="Username or email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={username}
              onChangeText={setUsername}
              placeholder="agency.user"
            />
            <Field
              label="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
            />
            <Button title="Sign in" onPress={onSubmit} loading={busy} fullWidth size="lg" />
            <Small style={{ textAlign: 'center', marginTop: spacing.md }}>
              Use the same credentials as the Chain web admin.
            </Small>

            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              <Muted style={{ textAlign: 'center' }}>New to Chain?</Muted>
              <Button
                title="Create an account"
                variant="ghost"
                fullWidth
                onPress={() => setShowSignup(true)}
              />
              <Small style={{ textAlign: 'center' }}>
                You'll choose Pay-as-you-go (Wallet) or Subscription on the next screen.
              </Small>
            </View>
          </View>
        </Screen>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
