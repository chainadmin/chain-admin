import React, { useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS, type AccountStatus } from '@shared/constants';
import {
  Body, Button, Card, EmptyState, formatCurrency, H1, H3, Loader, Muted, Pill, Screen, Small,
} from '@/components/ui';
import {
  fetchAccountManualPayments,
  fetchAccounts,
  fetchConsumerConversation,
  patchAccount,
} from '@/lib/api';
import type { Account, Conversation, ManualPayment } from '@/types/api';
import { colors, spacing, statusColor } from '@/theme/colors';

type ParamList = { AccountDetail: { accountId: string } };

export default function AccountDetailScreen() {
  const route = useRoute<RouteProp<ParamList, 'AccountDetail'>>();
  const nav = useNavigation<{ navigate: (name: string, params?: Record<string, unknown>) => void }>() as any;
  const qc = useQueryClient();
  const accountId = route.params?.accountId;

  const accountsQ = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: fetchAccounts });
  const account = useMemo<Account | undefined>(
    () => accountsQ.data?.find((a) => a.id === accountId),
    [accountsQ.data, accountId]
  );

  const paymentsQ = useQuery<ManualPayment[]>({
    queryKey: ['accounts', accountId, 'manual-payments'],
    queryFn: () => fetchAccountManualPayments(accountId),
    enabled: !!accountId,
  });

  const conversationQ = useQuery<Conversation>({
    queryKey: ['consumers', account?.consumer?.id, 'conversation'],
    queryFn: () => fetchConsumerConversation(account!.consumer!.id),
    enabled: !!account?.consumer?.id,
  });

  const [savingStatus, setSavingStatus] = useState<AccountStatus | null>(null);

  const updateStatus = useMutation({
    mutationFn: (status: AccountStatus) => patchAccount(accountId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      Alert.alert('Updated', 'Account status updated');
    },
    onError: (e: unknown) =>
      Alert.alert('Error', extractErrorMessage(e) || 'Failed to update status'),
    onSettled: () => setSavingStatus(null),
  });

  if (accountsQ.isLoading) return <Loader />;
  if (!account) return <EmptyState title="Account not found" />;

  const name = [account.consumer?.firstName, account.consumer?.lastName].filter(Boolean).join(' ') || 'Unknown';
  const sc = statusColor(account.status);

  const callPhone = (phone: string) => Linking.openURL(`tel:${phone}`);
  const smsPhone = (phone: string) => Linking.openURL(`sms:${phone}`);
  const emailTo = (email: string) => Linking.openURL(`mailto:${email}`);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
        <View>
          <Small>Account #{account.accountNumber || '—'}</Small>
          <H1 style={{ marginTop: 4 }}>{name}</H1>
          <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
            <Pill color={sc}>{account.status || 'unknown'}</Pill>
          </View>
        </View>

        <Card>
          <H3>Balance</H3>
          <H1 style={{ color: colors.primary, marginTop: 4 }}>{formatCurrency(account.balanceCents)}</H1>
          <Muted style={{ marginTop: 4 }}>Creditor: {account.creditor || '—'}</Muted>
        </Card>

        <Card>
          <H3>Contact</H3>
          <View style={{ gap: 8, marginTop: spacing.sm }}>
            {account.consumer?.email ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Body>{account.consumer.email}</Body>
                <Button size="sm" variant="ghost" title="Email" onPress={() => emailTo(account.consumer!.email!)} />
              </View>
            ) : null}
            {account.consumer?.phone ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Body>{account.consumer.phone}</Body>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button size="sm" variant="ghost" title="Call" onPress={() => callPhone(account.consumer!.phone!)} />
                  <Button size="sm" variant="ghost" title="SMS" onPress={() => smsPhone(account.consumer!.phone!)} />
                </View>
              </View>
            ) : null}
          </View>
        </Card>

        <Card>
          <H3>Update status</H3>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm }}>
            {ACCOUNT_STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                title={ACCOUNT_STATUS_LABELS[s]}
                variant={account.status === s ? 'primary' : 'secondary'}
                loading={savingStatus === s}
                onPress={() => {
                  setSavingStatus(s);
                  updateStatus.mutate(s);
                }}
              />
            ))}
          </View>
        </Card>

        <Card>
          <H3>Recent payments</H3>
          {paymentsQ.isLoading ? <Loader /> : null}
          {paymentsQ.data && paymentsQ.data.length > 0 ? (
            paymentsQ.data.slice(0, 5).map((p) => (
              <View key={p.id} style={{ paddingVertical: 8, borderBottomColor: colors.cardBorder, borderBottomWidth: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Body>{formatCurrency(p.amountCents)}</Body>
                  <Muted>{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : ''}</Muted>
                </View>
                {p.notes ? <Small>{p.notes}</Small> : null}
              </View>
            ))
          ) : !paymentsQ.isLoading ? (
            <Muted style={{ marginTop: 8 }}>No payments on file.</Muted>
          ) : null}
        </Card>

        <Card>
          <H3>Recent communications</H3>
          {conversationQ.isLoading ? <Loader /> : null}
          {conversationQ.data?.messages && conversationQ.data.messages.length > 0 ? (
            conversationQ.data.messages.slice(0, 12).map((m, i) => (
              <View key={i} style={{ paddingVertical: 6, borderBottomColor: colors.cardBorder, borderBottomWidth: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Small>
                    {m.channel.toUpperCase()} · {m.direction}
                  </Small>
                  <Small>{m.timestamp ? new Date(m.timestamp).toLocaleString() : ''}</Small>
                </View>
                <Body numberOfLines={2}>{m.subject || m.body || m.message || '—'}</Body>
              </View>
            ))
          ) : !conversationQ.isLoading ? (
            <Muted style={{ marginTop: 8 }}>No communications yet.</Muted>
          ) : null}
        </Card>

        <Button
          title="Send a message"
          variant="secondary"
          fullWidth
          onPress={() =>
            nav.navigate('Compose', {
              consumerId: account.consumer?.id,
              email: account.consumer?.email,
              phone: account.consumer?.phone,
              name,
            })
          }
        />
        <Button
          title="Post a payment"
          fullWidth
          onPress={() =>
            nav.navigate('PostPayment', {
              accountId: account.id,
              consumerId: account.consumerId,
              consumerEmail: account.consumer?.email,
              name,
              balanceCents: account.balanceCents,
            })
          }
        />
      </Screen>
    </ScrollView>
  );
}

function extractErrorMessage(e: unknown): string | undefined {
  if (typeof e === 'object' && e && 'response' in e) {
    const r = (e as { response?: { data?: { message?: string } } }).response;
    return r?.data?.message;
  }
  return undefined;
}
