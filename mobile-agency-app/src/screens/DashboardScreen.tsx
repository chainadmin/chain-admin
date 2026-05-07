import React, { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, formatCurrency, H1, H3, Loader, Muted, Small, Screen } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import {
  fetchCallbackRequests,
  fetchPayments,
  fetchStats,
  fetchWalletBalance,
} from '@/lib/api';
import type { CallbackRequest, Payment, TenantStats } from '@/types/api';
import { colors, spacing } from '@/theme/colors';

function StatTile({
  label,
  value,
  accent = colors.primary,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card style={{ flex: 1, minWidth: '47%', borderLeftWidth: 3, borderLeftColor: accent }}>
      <Small>{label}</Small>
      <H3 style={{ marginTop: 6, color: '#fff' }}>{value}</H3>
    </Card>
  );
}

export default function DashboardScreen() {
  const { user, tenant } = useAuth();

  const statsQ = useQuery<TenantStats>({ queryKey: ['stats'], queryFn: fetchStats });
  const walletQ = useQuery({ queryKey: ['wallet', 'balance'], queryFn: fetchWalletBalance });
  const paymentsQ = useQuery<Payment[]>({ queryKey: ['payments'], queryFn: fetchPayments });
  const callbacksQ = useQuery<CallbackRequest[]>({
    queryKey: ['callback-requests'],
    queryFn: fetchCallbackRequests,
  });

  const onRefresh = useCallback(() => {
    statsQ.refetch();
    walletQ.refetch();
    paymentsQ.refetch();
    callbacksQ.refetch();
  }, [statsQ, walletQ, paymentsQ, callbacksQ]);

  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }, []);

  const todaysPayments = useMemo(() => {
    const list = paymentsQ.data ?? [];
    const successful = list.filter((p) => {
      const status = (p.status || '').toLowerCase();
      if (status !== 'completed' && status !== 'success' && status !== 'succeeded') return false;
      const ts = p.paymentDate || p.createdAt;
      return !!ts && new Date(ts).getTime() >= today;
    });
    const cents = successful.reduce((sum, p) => sum + (p.amountCents || 0), 0);
    return { count: successful.length, cents };
  }, [paymentsQ.data, today]);

  const pendingCallbacks = useMemo(() => {
    const list = callbacksQ.data ?? [];
    return list.filter((c) => (c.status || 'pending').toLowerCase() === 'pending').length;
  }, [callbacksQ.data]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl tintColor="#fff" refreshing={statsQ.isRefetching} onRefresh={onRefresh} />}
    >
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
        <View>
          <Small>Welcome back</Small>
          <H1 style={{ marginTop: 4 }}>
            {user?.firstName || user?.username || 'Agency'}{' '}
            <Muted style={{ fontSize: 18 }}>· {tenant?.name}</Muted>
          </H1>
        </View>

        {walletQ.data ? (
          <Card style={{ borderColor: colors.primary + '55' }}>
            <Small>Wallet balance</Small>
            <H1 style={{ marginTop: 4, color: colors.primary }}>
              {formatCurrency(walletQ.data.balanceCents)}
            </H1>
          </Card>
        ) : null}

        {statsQ.isLoading ? (
          <Loader />
        ) : statsQ.error ? (
          <EmptyState title="Couldn't load metrics" message="Pull to refresh and try again." />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' }}>
              <StatTile
                label="Today's payments"
                value={`${formatCurrency(todaysPayments.cents)} · ${todaysPayments.count}`}
                accent={colors.success}
              />
              <StatTile
                label="Pending callbacks"
                value={pendingCallbacks.toLocaleString()}
                accent={colors.warning}
              />
              <StatTile
                label="Total consumers"
                value={(statsQ.data?.totalConsumers ?? 0).toLocaleString()}
                accent={colors.info}
              />
              <StatTile
                label="Active accounts"
                value={(statsQ.data?.activeAccounts ?? 0).toLocaleString()}
                accent={colors.success}
              />
              <StatTile
                label="Total balance"
                value={`$${(statsQ.data?.totalBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                accent={colors.accent}
              />
              <StatTile
                label="Collection rate"
                value={`${statsQ.data?.collectionRate ?? 0}%`}
                accent={colors.warning}
              />
            </View>

            {statsQ.data?.paymentMetrics ? (
              <Card>
                <H3>Payments (lifetime)</H3>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }}>
                  <View>
                    <Small>Total collected</Small>
                    <H3 style={{ color: colors.success }}>
                      ${(statsQ.data.paymentMetrics.totalCollected ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </H3>
                  </View>
                  <View>
                    <Small>Last 30 days</Small>
                    <H3 style={{ color: colors.info }}>
                      ${(statsQ.data.paymentMetrics.monthlyCollected ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </H3>
                  </View>
                  <View>
                    <Small>Declined</Small>
                    <H3 style={{ color: colors.danger }}>{statsQ.data.paymentMetrics.declinedPayments ?? 0}</H3>
                  </View>
                </View>
              </Card>
            ) : null}

            {statsQ.data?.emailMetrics || statsQ.data?.smsMetrics ? (
              <Card>
                <H3>Communications</H3>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }}>
                  <View>
                    <Small>Emails sent</Small>
                    <H3>{(statsQ.data?.emailMetrics?.totalSent ?? 0).toLocaleString()}</H3>
                  </View>
                  <View>
                    <Small>SMS sent</Small>
                    <H3>{(statsQ.data?.smsMetrics?.totalSent ?? 0).toLocaleString()}</H3>
                  </View>
                  <View>
                    <Small>Open rate</Small>
                    <H3>{statsQ.data?.emailMetrics?.openRate ?? 0}%</H3>
                  </View>
                </View>
              </Card>
            ) : null}
          </>
        )}
      </Screen>
    </ScrollView>
  );
}
