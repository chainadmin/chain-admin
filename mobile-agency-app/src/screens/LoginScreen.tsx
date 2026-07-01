import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Card, Field, H1, H3, Muted, Screen, Small } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { extractErrorMessage } from '@/navigation/types';
import { colors, radius, spacing } from '@/theme/colors';
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
            <View
              style={{
                width: 112,
                height: 112,
                borderRadius: 32,
                marginBottom: spacing.lg,
                backgroundColor: colors.cardElevated,
                borderColor: colors.cardBorderStrong,
                borderWidth: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image
                source={require('../../assets/icon.png')}
                style={{ width: 88, height: 88, borderRadius: 24 }}
                resizeMode="contain"
              />
            </View>
            <H1>Chain Agency</H1>
            <Muted style={{ marginTop: 6, textAlign: 'center' }}>Secure mobile command center for your agency</Muted>
          </View>

          <Card style={{ gap: spacing.lg }}>
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
            <Button title="Sign in securely" onPress={onSubmit} loading={busy} fullWidth size="lg" />
            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['Encrypted', 'Biometric-ready', 'Admin access'].map((item) => (
                <View
                  key={item}
                  style={{
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                  }}
                >
                  <Small style={{ color: colors.textMuted }}>{item}</Small>
                </View>
              ))}
            </View>
            <Small style={{ textAlign: 'center' }}>
              Use the same credentials as the Chain web admin.
            </Small>

            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
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
          </Card>

          <View style={{ alignItems: 'center', marginTop: spacing.xl }}>
            <H3 style={{ fontSize: 16 }}>Built for production workflows</H3>
            <Muted style={{ textAlign: 'center', marginTop: spacing.xs }}>
              Review accounts, payments, messages, and wallet activity from a polished mobile workspace.
            </Muted>
          </View>
        </Screen>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
