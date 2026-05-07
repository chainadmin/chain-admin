import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import {
  Body, Button, Card, EmptyState, formatCurrency, H1, Loader, Muted, Pill, Screen, Small,
} from '@/components/ui';
import { fetchPayments, fetchPaymentSchedules, fetchWalletBalance } from '@/lib/api';
import type { Payment, PaymentSchedule } from '@/types/api';
import { colors, radius, spacing } from '@/theme/colors';

type Tab = 'payments' | 'arrangements';

export default function PaymentsScreen() {
  const nav = useNavigation<{ navigate: (n: string, p?: Record<string, unknown>) => void }>() as any;
  const [tab, setTab] = useState<Tab>('payments');
  const paymentsQ = useQuery<Payment[]>({ queryKey: ['payments'], queryFn: fetchPayments, enabled: tab === 'payments' });
  const schedulesQ = useQuery<PaymentSchedule[]>({
    queryKey: ['payment-schedules'],
    queryFn: fetchPaymentSchedules,
    enabled: tab === 'arrangements',
  });
  const walletQ = useQuery({ queryKey: ['wallet', 'balance'], queryFn: fetchWalletBalance });

  const isLoading = tab === 'payments' ? paymentsQ.isLoading : schedulesQ.isLoading;
  const refreshing = tab === 'payments' ? paymentsQ.isRefetching : schedulesQ.isRefetching;
  const refetch = () => (tab === 'payments' ? paymentsQ.refetch() : schedulesQ.refetch());

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <H1>Payments</H1>
          {walletQ.data ? (
            <Pill color={colors.primary}>{`Wallet ${formatCurrency(walletQ.data.balanceCents)}`}</Pill>
          ) : null}
        </View>
        <Button title="Post a payment" onPress={() => nav.navigate('PostPayment', {})} />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['payments', 'arrangements'] as const).map((t) => {
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.cardBorder,
                  borderWidth: 1,
                }}
              >
                <Body
                  style={{
                    color: active ? '#fff' : colors.textMuted,
                    textTransform: 'capitalize',
                    fontWeight: '600',
                  }}
                >
                  {t}
                </Body>
              </Pressable>
            );
          })}
        </View>
      </Screen>

      {isLoading ? (
        <Loader />
      ) : tab === 'payments' ? (
        <FlatList<Payment>
          data={paymentsQ.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState title="No payments yet" />}
          renderItem={({ item }) => {
            const status = (item.status || 'pending').toLowerCase();
            const ok = status === 'completed' || status === 'success' || status === 'succeeded';
            return (
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Body style={{ fontWeight: '700' }}>{formatCurrency(item.amountCents)}</Body>
                    <Muted>
                      {item.consumerName ||
                        [item.consumer?.firstName, item.consumer?.lastName].filter(Boolean).join(' ') ||
                        '—'}
                    </Muted>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Pill color={ok ? colors.success : status === 'failed' ? colors.danger : colors.warning}>
                      {item.status || 'pending'}
                    </Pill>
                    <Small style={{ marginTop: 4 }}>
                      {item.paymentDate
                        ? new Date(item.paymentDate).toLocaleDateString()
                        : item.createdAt
                          ? new Date(item.createdAt).toLocaleDateString()
                          : ''}
                    </Small>
                  </View>
                </View>
              </Card>
            );
          }}
        />
      ) : (
        <FlatList<PaymentSchedule>
          data={schedulesQ.data ?? []}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState title="No active payment plans" />}
          renderItem={({ item }) => {
            const status = (item.status || 'pending').toLowerCase();
            const tone =
              status === 'active' ? colors.success :
              status === 'completed' ? colors.info :
              status === 'failed' ? colors.danger : colors.warning;
            return (
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Body style={{ fontWeight: '700' }}>
                      {item.arrangementType ? prettyArrangement(item.arrangementType) : 'Plan'}
                      {item.frequency ? ` · ${item.frequency}` : ''}
                    </Body>
                    <Muted>
                      {formatCurrency(item.amountCents)}
                      {item.totalPayments
                        ? ` · ${item.paymentsCompleted ?? 0}/${item.totalPayments} payments`
                        : ''}
                    </Muted>
                    <Small style={{ marginTop: 4 }}>
                      Acct #{item.accountNumber || '—'}
                      {item.cardLast4 ? ` · ${item.cardBrand || 'card'} •••• ${item.cardLast4}` : ''}
                    </Small>
                    {item.nextPaymentDate ? (
                      <Small style={{ marginTop: 2, color: colors.info }}>
                        Next: {new Date(item.nextPaymentDate).toLocaleDateString()}
                      </Small>
                    ) : null}
                  </View>
                  <Pill color={tone}>{item.status || 'pending'}</Pill>
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

function prettyArrangement(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
