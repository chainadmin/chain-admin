import React from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { Body, Button, Card, EmptyState, formatCurrency, H1, Loader, Muted, Pill, Screen, Small } from '@/components/ui';
import { fetchPayments, fetchWalletBalance } from '@/lib/api';
import { colors, spacing } from '@/theme/colors';

export default function PaymentsScreen() {
  const nav = useNavigation<any>();
  const paymentsQ = useQuery({ queryKey: ['payments'], queryFn: fetchPayments });
  const walletQ = useQuery({ queryKey: ['wallet', 'balance'], queryFn: fetchWalletBalance });

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
      </Screen>

      {paymentsQ.isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={paymentsQ.data ?? []}
          keyExtractor={(p: any) => p.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={
            <RefreshControl tintColor="#fff" refreshing={paymentsQ.isRefetching} onRefresh={() => paymentsQ.refetch()} />
          }
          ListEmptyComponent={<EmptyState title="No payments yet" />}
          renderItem={({ item }: any) => (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Body style={{ fontWeight: '700' }}>{formatCurrency(item.amountCents)}</Body>
                  <Muted>{item.consumerName || item.consumer?.firstName || ''} {item.consumer?.lastName || ''}</Muted>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Pill color={item.status === 'completed' || item.status === 'success' ? colors.success : colors.warning}>
                    {item.status || 'pending'}
                  </Pill>
                  <Small style={{ marginTop: 4 }}>
                    {item.paymentDate ? new Date(item.paymentDate).toLocaleDateString() : (item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '')}
                  </Small>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
