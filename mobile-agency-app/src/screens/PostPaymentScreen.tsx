import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Body, Button, Card, EmptyState, Field, formatCurrency, H1, H3, Loader, Muted, Pill, Screen, Small,
} from '@/components/ui';
import { fetchAccounts, processPayment } from '@/lib/api';
import type { Account } from '@/types/api';
import type { AccountsStackParamList } from '@/navigation/types';
import { extractErrorMessage } from '@/navigation/types';
import { colors, spacing } from '@/theme/colors';

type Nav = NativeStackNavigationProp<AccountsStackParamList, 'PostPayment'>;
type Route = RouteProp<AccountsStackParamList, 'PostPayment'>;

export default function PostPaymentScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const qc = useQueryClient();

  const accountsQ = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: fetchAccounts });
  const [accountId, setAccountId] = useState<string>(route.params?.accountId || '');
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');

  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [zipCode, setZipCode] = useState('');

  const account = useMemo<Account | undefined>(
    () => accountsQ.data?.find((a) => a.id === accountId),
    [accountsQ.data, accountId]
  );

  const filtered = useMemo<Account[]>(() => {
    const arr = accountsQ.data ?? [];
    if (!search) return arr.slice(0, 25);
    const q = search.toLowerCase();
    return arr
      .filter((a) =>
        [a.consumer?.firstName, a.consumer?.lastName, a.accountNumber, a.consumer?.email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 25);
  }, [accountsQ.data, search]);

  const submit = useMutation({
    mutationFn: () => {
      const cents = Math.round(Number(amount) * 100);
      if (!Number.isFinite(cents) || cents <= 0) throw new Error('Enter a valid amount');
      if (!account) throw new Error('Choose an account');
      const consumerEmail = account.consumer?.email || route.params?.consumerEmail;
      if (!consumerEmail) throw new Error('Consumer has no email on file');
      if (!cardName || !cardNumber || !expiryDate || !cvv) {
        throw new Error('Fill in all card fields');
      }
      return processPayment({
        consumerEmail,
        amountCents: cents,
        cardNumber: cardNumber.replace(/\s+/g, ''),
        expiryDate,
        cvv,
        cardName,
        zipCode: zipCode || undefined,
        accountId: account.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      Alert.alert('Payment posted', 'The payment has been submitted.');
      nav.goBack();
    },
    onError: (e) =>
      Alert.alert('Payment failed', extractErrorMessage(e) || 'Try again'),
  });

  if (accountsQ.isLoading) return <Loader />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
        <H1>Post a payment</H1>

        {account ? (
          <Card>
            <Small>Account</Small>
            <Body style={{ fontWeight: '700', marginTop: 4 }}>
              {[account.consumer?.firstName, account.consumer?.lastName].filter(Boolean).join(' ')}
            </Body>
            <Muted>
              Acct #{account.accountNumber || '—'} · Balance {formatCurrency(account.balanceCents)}
            </Muted>
            <Muted>{account.consumer?.email}</Muted>
            <Button size="sm" variant="ghost" title="Change" onPress={() => setAccountId('')} style={{ marginTop: 8 }} />
          </Card>
        ) : (
          <>
            <Field placeholder="Search accounts…" value={search} onChangeText={setSearch} autoCapitalize="none" />
            {filtered.length === 0 ? (
              <EmptyState title="No matching accounts" />
            ) : (
              filtered.map((a) => (
                <Card key={a.id} style={{ paddingVertical: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Body style={{ fontWeight: '600' }}>
                        {[a.consumer?.firstName, a.consumer?.lastName].filter(Boolean).join(' ') || 'Unknown'}
                      </Body>
                      <Muted>
                        Acct #{a.accountNumber || '—'} · {formatCurrency(a.balanceCents)}
                      </Muted>
                    </View>
                    <Button size="sm" title="Select" onPress={() => setAccountId(a.id)} />
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {account ? (
          <>
            <Field
              label="Amount (USD)"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
            />

            <H3>Card details</H3>
            <Field label="Name on card" value={cardName} onChangeText={setCardName} autoCapitalize="words" />
            <Field
              label="Card number"
              value={cardNumber}
              onChangeText={setCardNumber}
              keyboardType="number-pad"
              placeholder="4242 4242 4242 4242"
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Expiry (MM/YY)" value={expiryDate} onChangeText={setExpiryDate} placeholder="12/27" />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="CVV"
                  value={cvv}
                  onChangeText={setCvv}
                  keyboardType="number-pad"
                  secureTextEntry
                  placeholder="123"
                />
              </View>
            </View>
            <Field label="ZIP (optional)" value={zipCode} onChangeText={setZipCode} keyboardType="number-pad" />

            <Button
              title={amount ? `Charge ${formatCurrency(Math.round(Number(amount || '0') * 100))}` : 'Charge payment'}
              fullWidth
              loading={submit.isPending}
              disabled={!amount || !cardName || !cardNumber || !expiryDate || !cvv}
              onPress={() => submit.mutate()}
            />
            <Pill color={colors.info}>Card data is sent securely over TLS to your tenant's processor</Pill>
          </>
        ) : null}
      </Screen>
    </ScrollView>
  );
}
