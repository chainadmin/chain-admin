import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS, type AccountStatus } from '@shared/constants';
import { Body, Card, EmptyState, Field, formatCurrency, H1, Loader, Muted, Pill, Screen, Small } from '@/components/ui';
import { fetchAccounts } from '@/lib/api';
import type { Account } from '@/types/api';
import { colors, radius, spacing, statusColor } from '@/theme/colors';

type Filter = 'all' | AccountStatus;
const FILTERS: readonly Filter[] = ['all', ...ACCOUNT_STATUSES] as const;

export default function AccountsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<{ AccountDetail: { accountId: string } }>>();
  const accountsQ = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: fetchAccounts });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo<Account[]>(() => {
    const arr = accountsQ.data ?? [];
    return arr.filter((a) => {
      if (filter !== 'all' && (a.status || '').toLowerCase() !== filter) return false;
      if (!search) return true;
      const hay = [
        a.consumer?.firstName,
        a.consumer?.lastName,
        a.consumer?.email,
        a.consumer?.phone,
        a.accountNumber,
        a.creditor,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [accountsQ.data, filter, search]);

  const labelFor = (f: Filter) => (f === 'all' ? 'All' : ACCOUNT_STATUS_LABELS[f]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.md }}>
        <H1>Accounts</H1>
        <Field
          placeholder="Search by name, email, account #…"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FlatList
          data={FILTERS as readonly Filter[]}
          horizontal
          keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          renderItem={({ item }) => {
            const active = item === filter;
            return (
              <Pressable
                onPress={() => setFilter(item)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.cardBorder,
                  borderWidth: 1,
                }}
              >
                <Body style={{ fontSize: 13, color: active ? '#fff' : colors.textMuted }}>{labelFor(item)}</Body>
              </Pressable>
            );
          }}
        />
      </Screen>

      {accountsQ.isLoading ? (
        <Loader />
      ) : (
        <FlatList<Account>
          data={filtered}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={
            <RefreshControl tintColor="#fff" refreshing={accountsQ.isRefetching} onRefresh={() => accountsQ.refetch()} />
          }
          ListEmptyComponent={
            <EmptyState title="No accounts" message="Try another filter or import accounts from the web admin." />
          }
          renderItem={({ item }) => {
            const consumerName = [item.consumer?.firstName, item.consumer?.lastName].filter(Boolean).join(' ') || 'Unknown';
            const balance = formatCurrency(
              typeof item.balanceCents === 'number' ? item.balanceCents : Number(item.balanceCents ?? 0)
            );
            const sc = statusColor(item.status);
            return (
              <Pressable onPress={() => nav.navigate('AccountDetail', { accountId: item.id })}>
                <Card style={{ borderLeftWidth: 3, borderLeftColor: sc }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Body style={{ fontWeight: '700' }}>{consumerName}</Body>
                      <Muted>{item.creditor || 'No creditor'}</Muted>
                      <Small style={{ marginTop: 4 }}>Acct #{item.accountNumber || '—'}</Small>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Body style={{ fontWeight: '700' }}>{balance}</Body>
                      <Pill color={sc}>{item.status || 'unknown'}</Pill>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
