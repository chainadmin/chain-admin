import React from 'react';
import { ScrollView } from 'react-native';
import { Body, Card, H1, Muted, Screen, Small } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { colors, spacing } from '@/theme/colors';

export default function ProfileScreen() {
  const { user, tenant } = useAuth();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
        <H1>Profile</H1>
        <Card>
          <Small>Name</Small>
          <Body style={{ marginTop: 4 }}>{(user?.firstName || '') + ' ' + (user?.lastName || '')}</Body>
        </Card>
        <Card>
          <Small>Username</Small>
          <Body style={{ marginTop: 4 }}>{user?.username}</Body>
        </Card>
        <Card>
          <Small>Email</Small>
          <Body style={{ marginTop: 4 }}>{user?.email}</Body>
        </Card>
        <Card>
          <Small>Role</Small>
          <Body style={{ marginTop: 4 }}>{user?.role}</Body>
        </Card>
        <Card>
          <Small>Tenant</Small>
          <Body style={{ marginTop: 4 }}>{tenant?.name}</Body>
          <Muted>{tenant?.slug}</Muted>
        </Card>
      </Screen>
    </ScrollView>
  );
}
