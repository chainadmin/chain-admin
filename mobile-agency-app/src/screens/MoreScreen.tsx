import React from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Body, Button, Card, H1, H3, Muted, Pill, Screen, Small } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import type { MoreStackParamList } from '@/navigation/types';
import { colors, spacing } from '@/theme/colors';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MoreHome'>;

export default function MoreScreen() {
  const nav = useNavigation<Nav>();
  const { user, tenant, logout, biometricEnabled, enableBiometric, disableBiometric } = useAuth();

  const onToggleBiometric = async () => {
    if (biometricEnabled) {
      await disableBiometric();
      return;
    }
    const ok = await enableBiometric();
    if (!ok) Alert.alert('Biometrics unavailable', 'Set up Face ID / Touch ID on this device first.');
  };

  const isPlatformAdmin = user?.role === 'platform_admin';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
        <H1>More</H1>

        <Card>
          <Small>Signed in as</Small>
          <Body style={{ fontWeight: '700', marginTop: 4 }}>
            {(user?.firstName || '') + ' ' + (user?.lastName || '') || user?.username}
          </Body>
          <Muted>{user?.email}</Muted>
          <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
            <Pill color={colors.info}>{user?.role || 'agent'}</Pill>
            <Pill color={colors.accent}>{tenant?.name || ''}</Pill>
          </View>
        </Card>

        <Card>
          <H3>Profile</H3>
          <Button variant="ghost" title="View profile" onPress={() => nav.navigate('Profile')} />
        </Card>

        <Card>
          <H3>Wallet</H3>
          <Button variant="ghost" title="Open wallet" onPress={() => nav.navigate('Wallet')} />
        </Card>

        <Card>
          <H3>Settings</H3>
          <Button
            variant="ghost"
            title={biometricEnabled ? 'Disable biometric unlock' : 'Enable biometric unlock'}
            onPress={onToggleBiometric}
          />
        </Card>

        {isPlatformAdmin ? (
          <Card style={{ borderColor: colors.accent + '55', borderWidth: 2 }}>
            <H3>Platform admin</H3>
            <Muted style={{ marginTop: 4 }}>Switch the active tenant context.</Muted>
            <Button title="Tenant switcher" onPress={() => nav.navigate('TenantSwitcher')} style={{ marginTop: 8 }} />
          </Card>
        ) : null}

        <Button title="Log out" variant="danger" fullWidth onPress={logout} />
      </Screen>
    </ScrollView>
  );
}
