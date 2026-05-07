import React from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Body, Button, Card, EmptyState, formatCurrency, H1, H3, Loader, Muted, Pill, Screen, Small } from '@/components/ui';
import { fetchWalletBalance, fetchWalletLedger, getApiBaseUrl } from '@/lib/api';
import { colors, spacing } from '@/theme/colors';

export default function WalletScreen() {
  const balanceQ = useQuery({ queryKey: ['wallet', 'balance'], queryFn: fetchWalletBalance });
  const ledgerQ = useQuery({ queryKey: ['wallet', 'ledger'], queryFn: fetchWalletLedger });

  const openTopUp = async () => {
    try {
      await WebBrowser.openBrowserAsync(`${getApiBaseUrl()}/billing#wallet`);
      // refresh after returning
      balanceQ.refetch();
      ledgerQ.refetch();
    } catch (e: any) {
      Alert.alert('Could not open browser', e?.message || 'Try again');
    }
  };

  if (balanceQ.isLoading) return <Loader />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={ledgerQ.data ?? []}
        keyExtractor={(item: any, i: number) => item.id || String(i)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            tintColor="#fff"
            refreshing={balanceQ.isRefetching || ledgerQ.isRefetching}
            onRefresh={() => {
              balanceQ.refetch();
              ledgerQ.refetch();
            }}
          />
        }
        ListHeaderComponent={
          <Screen style={{ paddingHorizontal: 0, gap: spacing.lg, paddingBottom: spacing.lg }}>
            <H1>Wallet</H1>
            <Card style={{ borderColor: colors.primary + '55', borderWidth: 2 }}>
              <Small>Current balance</Small>
              <H1 style={{ color: colors.primary, marginTop: 4 }}>
                {formatCurrency(balanceQ.data?.balanceCents)}
              </H1>
              {balanceQ.data?.planQuota ? (
                <View style={{ marginTop: 12, gap: 4 }}>
                  <Small>Plan quota usage</Small>
                  <Muted>
                    Email {balanceQ.data.planQuota.emailUsed ?? 0} / {balanceQ.data.planQuota.emailLimit ?? '∞'} ·
                    SMS {balanceQ.data.planQuota.smsUsed ?? 0} / {balanceQ.data.planQuota.smsLimit ?? '∞'}
                  </Muted>
                </View>
              ) : null}
              <Button title="Add funds" onPress={openTopUp} style={{ marginTop: 16 }} />
              <Pill color={colors.info}>Top up via secure web browser — no in-app purchases</Pill>
            </Card>
            {balanceQ.data === null ? (
              <Card>
                <H3>Wallet not yet active</H3>
                <Muted style={{ marginTop: 4 }}>
                  Wallet billing isn't enabled for this tenant yet. Once it's turned on by Chain support, your balance and
                  transaction history will appear here.
                </Muted>
              </Card>
            ) : (
              <H3>Transaction history</H3>
            )}
          </Screen>
        }
        ListEmptyComponent={balanceQ.data === null ? null : <EmptyState title="No transactions yet" />}
        renderItem={({ item }: any) => {
          const positive = (item.amountCents || 0) > 0;
          return (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '600' }}>{item.description || item.kind || 'Transaction'}</Body>
                  <Small>
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                  </Small>
                </View>
                <Body style={{ color: positive ? colors.success : colors.danger, fontWeight: '700' }}>
                  {positive ? '+' : ''}
                  {formatCurrency(item.amountCents)}
                </Body>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}
