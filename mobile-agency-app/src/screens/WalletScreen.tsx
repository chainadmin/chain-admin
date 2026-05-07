import React, { useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import {
  Body, Button, Card, EmptyState, Field, formatCurrency, H1, H3, Loader, Muted, Pill, Screen, Small,
} from '@/components/ui';
import {
  fetchWalletBalance,
  fetchWalletLedger,
  fetchTenantBillingMode,
  getApiBaseUrl,
  type WalletLedgerEntry,
} from '@/lib/api';
import { extractErrorMessage } from '@/navigation/types';
import { colors, spacing } from '@/theme/colors';

type LedgerEntry = WalletLedgerEntry;

export default function WalletScreen() {
  const qc = useQueryClient();
  const modeQ = useQuery({ queryKey: ['tenant', 'billing-mode'], queryFn: fetchTenantBillingMode });
  const isWalletMode = modeQ.data === 'wallet';

  const balanceQ = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: fetchWalletBalance,
    enabled: isWalletMode,
  });
  const ledgerQ = useQuery({
    queryKey: ['wallet', 'ledger'],
    queryFn: fetchWalletLedger,
    enabled: isWalletMode,
  });

  const [topupAmount, setTopupAmount] = useState('25');

  // Top-up is completed in the secure web checkout (Stripe Elements lives
  // on the web /billing page). We just deep-link there with the desired
  // amount; the server credits the wallet once Stripe confirms.
  const openTopupCheckout = async (amountDollars: number) => {
    const cents = Math.round(amountDollars * 100);
    if (!(cents > 0)) return;
    try {
      await WebBrowser.openBrowserAsync(
        `${getApiBaseUrl()}/billing?walletTopup=${cents}#wallet`,
      );
    } catch (e) {
      Alert.alert('Could not open billing', extractErrorMessage(e) || 'Try again');
      return;
    }
    qc.invalidateQueries({ queryKey: ['wallet', 'balance'] });
    qc.invalidateQueries({ queryKey: ['wallet', 'ledger'] });
    balanceQ.refetch();
    ledgerQ.refetch();
  };

  if (modeQ.isLoading) return <Loader />;

  if (!isWalletMode) {
    return (
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
        <H1>Wallet</H1>
        <Card>
          <H3>You're on a subscription plan</H3>
          <Muted style={{ marginTop: 4 }}>
            Wallet billing is only available for pay-as-you-go tenants. Switch billing mode in the web billing page to enable a wallet.
          </Muted>
        </Card>
      </Screen>
    );
  }

  const ledger: LedgerEntry[] = ledgerQ.data ?? [];
  const balance = balanceQ.data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList<LedgerEntry>
        data={ledger}
        keyExtractor={(item, i) => item.id || String(i)}
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
            <Card style={{
              borderColor: balance?.lowBalance ? colors.warning : colors.primary + '55',
              borderWidth: 2,
            }}>
              <Small>Current balance</Small>
              <H1 style={{ color: balance?.lowBalance ? colors.warning : colors.primary, marginTop: 4 }}>
                {formatCurrency(balance?.balanceCents ?? 0)}
              </H1>
              {balance?.lowBalance ? (
                <Pill color={colors.warning}>Low balance — top up to keep sending</Pill>
              ) : null}
              <View style={{ marginTop: spacing.md, gap: 4 }}>
                <Small>SMS rate</Small>
                <Muted>${((balance?.smsRateMicros ?? 0) / 1_000_000).toFixed(6)} per segment</Muted>
                <Small style={{ marginTop: 6 }}>Email rate</Small>
                <Muted>${((balance?.emailRateMicros ?? 0) / 1_000_000).toFixed(6)} per email</Muted>
              </View>
            </Card>

            <Card>
              <H3>Add funds</H3>
              <Field
                label="Amount (USD)"
                value={topupAmount}
                onChangeText={setTopupAmount}
                keyboardType="decimal-pad"
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md }}>
                {[25, 50, 100, 250].map((v) => (
                  <Pill key={v} color={colors.info}>
                    <Body
                      onPress={() => setTopupAmount(String(v))}
                      style={{ color: '#fff' }}
                    >
                      ${v}
                    </Body>
                  </Pill>
                ))}
              </View>
              <Button
                title={`Top up $${parseFloat(topupAmount || '0').toFixed(2)}`}
                fullWidth
                disabled={!(parseFloat(topupAmount) > 0)}
                onPress={() => { void openTopupCheckout(parseFloat(topupAmount)); }}
              />
              <Muted style={{ marginTop: spacing.sm, fontSize: 12 }}>
                Payment is completed in a secure browser. Your wallet is credited automatically when Stripe confirms.
              </Muted>
            </Card>

            <H3>Transaction history</H3>
          </Screen>
        }
        ListEmptyComponent={<EmptyState title="No transactions yet" />}
        renderItem={({ item }) => {
          const positive = (item.amountCents || 0) > 0;
          return (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '600' }}>{item.description || item.type || item.entryType || item.kind || 'Transaction'}</Body>
                  <Small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</Small>
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
