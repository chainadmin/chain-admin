import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Body, Button, Field, H1, H3, Muted, Pill, Screen } from '@/components/ui';
import { sendEmail, sendSms } from '@/lib/api';
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

  const send = useMutation({
    mutationFn: async () => {
      if (channel === 'email') {
        return sendEmail({ to, subject, message });
      }
      return sendSms({
        message,
        consumerId: params.consumerId,
        phoneNumber: params.consumerId ? undefined : to,
      });
    },
    onSuccess: () => {
      Alert.alert('Sent', 'Your message was sent.');
      nav.goBack();
    },
    onError: (e) => Alert.alert('Error', extractErrorMessage(e) || 'Failed to send'),
  });

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
          onPress={() => send.mutate()}
        />
      </Screen>
    </ScrollView>
  );
}
