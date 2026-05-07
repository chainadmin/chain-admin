import React, { useMemo, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import {
  Body, Button, Card, EmptyState, Field, H1, Loader, Muted, Pill, Screen, Small,
} from '@/components/ui';
import { fetchTenants, impersonateTenant } from '@/lib/api';
import { colors, spacing } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';

export default function TenantSwitcherScreen() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const { tenant: currentTenant, applyImpersonation } = useAuth();
  const [search, setSearch] = useState('');

  const tenantsQ = useQuery({ queryKey: ['admin', 'tenants'], queryFn: fetchTenants });

  const filtered = useMemo(() => {
    const arr = tenantsQ.data ?? [];
    if (!search) return arr;
    const q = search.toLowerCase();
    return arr.filter((t: any) =>
      [t.name, t.slug, t.id].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [tenantsQ.data, search]);

  const switchTo = useMutation({
    mutationFn: (id: string) => impersonateTenant(id),
    onSuccess: async (res) => {
      await applyImpersonation(res.token, res.tenant, res.user);
      qc.clear();
      Alert.alert('Tenant switched', `Now viewing ${res.tenant.name}.`);
      nav.goBack();
    },
    onError: (e: any) =>
      Alert.alert('Could not switch', e?.response?.data?.message || 'Make sure you have platform admin access.'),
  });

  if (tenantsQ.isLoading) return <Loader />;

  if (tenantsQ.error) {
    return (
      <Screen style={{ paddingTop: spacing.lg }}>
        <H1>Tenant switcher</H1>
        <EmptyState
          title="Unable to load tenants"
          message="Make sure your account has platform admin access."
        />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.md }}>
        <H1>Tenant switcher</H1>
        <Muted>Issue a 4-hour impersonation token and view another tenant's dashboard.</Muted>
        <Field placeholder="Search tenants…" value={search} onChangeText={setSearch} autoCapitalize="none" />
      </Screen>
      <FlatList
        data={filtered}
        keyExtractor={(t: any) => t.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        ListEmptyComponent={<EmptyState title="No tenants" />}
        renderItem={({ item }: any) => {
          const selected = item.id === currentTenant?.id;
          const busy = switchTo.isPending && switchTo.variables === item.id;
          return (
            <Card
              style={{
                borderColor: selected ? colors.primary : colors.cardBorder,
                borderWidth: selected ? 2 : 1,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>{item.name}</Body>
                  <Small>{item.slug}</Small>
                  {selected ? <Pill color={colors.info}>active</Pill> : null}
                </View>
                <Button
                  size="sm"
                  title={selected ? 'Active' : 'Switch'}
                  loading={busy}
                  onPress={() => switchTo.mutate(item.id)}
                  disabled={selected}
                />
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}
