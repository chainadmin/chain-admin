import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { Body, Button, Card, EmptyState, H1, Loader, Muted, Screen, Small } from '@/components/ui';
import { fetchEmailReplies, fetchSmsReplies } from '@/lib/api';
import { colors, radius, spacing } from '@/theme/colors';

export default function MessagingScreen() {
  const nav = useNavigation<any>();
  const [tab, setTab] = useState<'email' | 'sms'>('email');

  const emailQ = useQuery({ queryKey: ['email-replies'], queryFn: fetchEmailReplies, enabled: tab === 'email' });
  const smsQ = useQuery({ queryKey: ['sms-replies'], queryFn: fetchSmsReplies, enabled: tab === 'sms' });

  const data = tab === 'email' ? emailQ.data : smsQ.data;
  const isLoading = tab === 'email' ? emailQ.isLoading : smsQ.isLoading;
  const refetch = () => (tab === 'email' ? emailQ.refetch() : smsQ.refetch());

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <H1>Messaging</H1>
          <Button size="sm" title="Compose" onPress={() => nav.navigate('Compose', {})} />
        </View>
        <Muted>Recent inbound replies from consumers</Muted>
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
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item: any, i: number) => item.id || String(i)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl tintColor="#fff" refreshing={false} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState title={`No inbound ${tab} replies`} />}
          renderItem={({ item }: any) => (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Small>{item.read || item.isRead ? 'READ' : 'UNREAD'}</Small>
                <Small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</Small>
              </View>
              <Body style={{ marginTop: 4, fontWeight: '600' }}>
                {tab === 'email'
                  ? item.subject || item.fromEmail || '(no subject)'
                  : item.fromNumber || item.phoneNumber || '—'}
              </Body>
              <Muted numberOfLines={3} style={{ marginTop: 4 }}>
                {tab === 'email'
                  ? item.body || item.message || item.htmlBody || ''
                  : item.message || item.body || ''}
              </Muted>
            </Card>
          )}
        />
      )}
    </View>
  );
}
