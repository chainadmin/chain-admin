import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Body, Button, Card, EmptyState, H1, Loader, Muted, Screen, Small,
} from '@/components/ui';
import { fetchEmailReplies, fetchSmsReplies } from '@/lib/api';
import type { EmailReply, SmsReply } from '@/types/api';
import type { MessagingStackParamList } from '@/navigation/types';
import { colors, radius, spacing } from '@/theme/colors';

type Tab = 'email' | 'sms';
type Nav = NativeStackNavigationProp<MessagingStackParamList, 'MessagingList'>;

export default function MessagingScreen() {
  const nav = useNavigation<Nav>();
  const [tab, setTab] = useState<Tab>('email');

  const emailQ = useQuery<EmailReply[]>({
    queryKey: ['email-replies'],
    queryFn: fetchEmailReplies,
    enabled: tab === 'email',
  });
  const smsQ = useQuery<SmsReply[]>({
    queryKey: ['sms-replies'],
    queryFn: fetchSmsReplies,
    enabled: tab === 'sms',
  });

  const isLoading = tab === 'email' ? emailQ.isLoading : smsQ.isLoading;
  const refreshing = tab === 'email' ? emailQ.isRefetching : smsQ.isRefetching;
  const refetch = () => (tab === 'email' ? emailQ.refetch() : smsQ.refetch());

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <H1>Messaging</H1>
          <Button size="sm" title="Compose" onPress={() => nav.navigate('Compose', {})} />
        </View>
        <Muted>
          Inbound consumer replies. Tap an account to see the full sent + received history for that consumer.
        </Muted>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['email', 'sms'] as const).map((t) => {
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
                    textTransform: 'uppercase',
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
      ) : tab === 'email' ? (
        <FlatList<EmailReply>
          data={emailQ.data ?? []}
          keyExtractor={(item, i) => item.id || String(i)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState title="No inbound email replies" />}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Small>{item.read || item.isRead ? 'READ' : 'UNREAD'}</Small>
                <Small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</Small>
              </View>
              <Body style={{ marginTop: 4, fontWeight: '600' }}>
                {item.subject || item.fromEmail || '(no subject)'}
              </Body>
              <Muted numberOfLines={3} style={{ marginTop: 4 }}>
                {item.body || item.htmlBody || ''}
              </Muted>
            </Card>
          )}
        />
      ) : (
        <FlatList<SmsReply>
          data={smsQ.data ?? []}
          keyExtractor={(item, i) => item.id || String(i)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState title="No inbound SMS replies" />}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Small>{item.read || item.isRead ? 'READ' : 'UNREAD'}</Small>
                <Small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</Small>
              </View>
              <Body style={{ marginTop: 4, fontWeight: '600' }}>
                {item.fromNumber || item.phoneNumber || '—'}
              </Body>
              <Muted numberOfLines={3} style={{ marginTop: 4 }}>
                {item.message || item.body || ''}
              </Muted>
            </Card>
          )}
        />
      )}
    </View>
  );
}
