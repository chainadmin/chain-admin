import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import { Body, Button, Card, Field, formatCurrency, H1, H3, Muted, Pill, Screen, Small } from '@/components/ui';
import {
  estimateWalletCost,
  fetchTenantBillingMode,
  fetchWalletBalance,
  getApiBaseUrl,
  sendEmail,
  sendSms,
} from '@/lib/api';
import { colors, radius, spacing } from '@/theme/colors';
import type { AccountsStackParamList } from '@/navigation/types';
import { extractErrorMessage } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AccountsStackParamList, 'Compose'>;
type Route = RouteProp<AccountsStackParamList, 'Compose'>;

export default function ComposeMessageScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const params = route.params || {};
  const initialChannel: 'email' | 'sms' = params.email ? 'email' : params.phone ? 'sms' : 'email';
  const [channel, setChannel] = useState<'email' | 'sms'>(initialChannel);
  const [to, setTo] = useState<string>(channel === 'email' ? params.email || '' : params.phone || '');
  const [subject, setSubject] = useState<string>('Account update');
  const [message, setMessage] = useState<string>('');

  const qc = useQueryClient();
  const modeQ = useQuery({ queryKey: ['tenant', 'billing-mode'], queryFn: fetchTenantBillingMode });
  const isWalletMode = modeQ.data === 'wallet';

  const balanceQ = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: fetchWalletBalance,
    enabled: isWalletMode,
  });

  const [estimate, setEstimate] = useState<{ totalCents: number; segments?: number } | null>(null);
  useEffect(() => {
    if (!isWalletMode || !message) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const e = await estimateWalletCost({ channel, recipientCount: 1, message });
      if (!cancelled) setEstimate(e ? { totalCents: e.totalCents, segments: e.segments } : null);
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [isWalletMode, channel, message]);

  const insufficient = isWalletMode
    && estimate != null
    && (balanceQ.data?.balanceCents ?? 0) < estimate.totalCents;

  const performSend = () => {
    if (channel === 'email') {
      return sendEmail({ to, subject, message });
    }
    return sendSms({
      message,
      consumerId: params.consumerId,
      phoneNumber: params.consumerId ? undefined : to,
    });
  };

  const send = useMutation({
    mutationFn: async () => performSend(),
    onSuccess: () => {
      Alert.alert('Sent', 'Your message was sent.');
      nav.goBack();
    },
    onError: (e) => Alert.alert('Error', extractErrorMessage(e) || 'Failed to send'),
  });

  const openBillingForTopup = async () => {
    try {
      await WebBrowser.openBrowserAsync(`${getApiBaseUrl()}/billing#wallet`);
    } catch {}
    // Refresh wallet state when the user returns from the secure browser
    // so the UI reflects the new balance immediately.
    qc.invalidateQueries({ queryKey: ['wallet', 'balance'] });
    qc.invalidateQueries({ queryKey: ['wallet', 'ledger'] });
    balanceQ.refetch();
  };

  const onSendPress = () => {
    if (isWalletMode && insufficient && estimate) {
      const cost = formatCurrency(estimate.totalCents);
      Alert.alert(
        'Insufficient wallet balance',
        `This ${channel.toUpperCase()} will cost ${cost}, but your wallet balance is ${formatCurrency(balanceQ.data?.balanceCents ?? 0)}. Top up first to send.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Top up wallet', onPress: () => { void openBillingForTopup(); } },
        ],
      );
      return;
    }
    if (isWalletMode && estimate) {
      const cost = formatCurrency(estimate.totalCents);
      const seg = estimate.segments && channel === 'sms' ? ` (${estimate.segments} segment${estimate.segments === 1 ? '' : 's'})` : '';
      Alert.alert(
        `Send for ${cost}?`,
        `This ${channel.toUpperCase()} will charge your wallet ${cost}${seg}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send', onPress: () => send.mutate() },
        ],
      );
      return;
    }
    send.mutate();
  };

  const switchChannel = (c: 'email' | 'sms') => {
    setChannel(c);
    setTo(c === 'email' ? params.email || '' : params.phone || '');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
        <H1>Compose</H1>
        {params.name ? <Pill color={colors.info}>{`To: ${params.name}`}</Pill> : null}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['email', 'sms'] as const).map((c) => {
            const active = channel === c;
            return (
              <Pressable
                key={c}
                onPress={() => switchChannel(c)}
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
                    textTransform: 'uppercase',
                    fontWeight: '600',
                  }}
                >
                  {c}
                </Body>
              </Pressable>
            );
          })}
        </View>

        <Field
          label={channel === 'email' ? 'Recipient email' : 'Phone number'}
          value={to}
          onChangeText={setTo}
          autoCapitalize="none"
          keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
        />

        {channel === 'email' ? <Field label="Subject" value={subject} onChangeText={setSubject} /> : null}

        <Field
          label="Message"
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={6}
          style={{ minHeight: 140, textAlignVertical: 'top' }}
        />

        {isWalletMode ? (
          <Card style={{ borderColor: insufficient ? colors.danger : colors.primary + '55', borderWidth: 1 }}>
            <Small>Estimated wallet charge</Small>
            <H3 style={{ color: insufficient ? colors.danger : colors.primary, marginTop: 4 }}>
              {estimate ? formatCurrency(estimate.totalCents) : '—'}
              {channel === 'sms' && estimate?.segments
                ? ` · ${estimate.segments} seg`
                : ''}
            </H3>
            <Muted style={{ marginTop: 4 }}>
              Wallet balance: {formatCurrency(balanceQ.data?.balanceCents ?? 0)}
              {insufficient ? ' · Insufficient — top up first' : ''}
            </Muted>
            {insufficient ? (
              <Button
                title="Top up wallet"
                fullWidth
                onPress={() => { void openBillingForTopup(); }}
                style={{ marginTop: spacing.md }}
              />
            ) : null}
          </Card>
        ) : null}

        <H3>Reminder</H3>
        <Muted>
          Recipients who have replied STOP or are on the blocked-numbers list will be skipped automatically by the
          server.
        </Muted>

        <Button
          title={`Send ${channel.toUpperCase()}`}
          fullWidth
          loading={send.isPending}
          disabled={
            !message ||
            (channel === 'email' && (!to || !subject)) ||
            (channel === 'sms' && !to && !params.consumerId)
          }
          onPress={onSendPress}
        />
      </Screen>
    </ScrollView>
  );
}
