import React from 'react';
import { ScrollView, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Body, Button, Card, H1, H3, Muted, Pill, Screen, Small } from '@/components/ui';
import { getApiBaseUrl } from '@/lib/api';
import { colors, spacing } from '@/theme/colors';

type Mode = 'wallet' | 'subscription';

function ModeCard({
  title,
  badge,
  badgeTone,
  pitch,
  bullets,
  cta,
  onPress,
}: {
  title: string;
  badge: string;
  badgeTone: 'success' | 'info';
  pitch: string;
  bullets: string[];
  cta: string;
  onPress: () => void;
}) {
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H3>{title}</H3>
        <Pill tone={badgeTone}>
          <Body style={{ color: badgeTone === 'success' ? colors.success : colors.info, fontSize: 12 }}>
            {badge}
          </Body>
        </Pill>
      </View>
      <Body>{pitch}</Body>
      <View style={{ gap: spacing.xs }}>
        {bullets.map((b) => (
          <Small key={b}>• {b}</Small>
        ))}
      </View>
      <Button title={cta} fullWidth onPress={onPress} />
    </Card>
  );
}

export default function SignupChooserScreen() {
  const open = (mode: Mode) =>
    WebBrowser.openBrowserAsync(`${getApiBaseUrl()}/agency-registration?billingMode=${mode}`);

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: colors.bg }}>
      <Screen style={{ paddingVertical: spacing.xl, gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <H1>Choose how you want to pay</H1>
          <Muted>Pick the billing mode that fits your usage. You can switch anytime from Billing.</Muted>
        </View>

        <View style={{ gap: spacing.lg }}>
          <ModeCard
            title="Pay-as-you-go (Wallet)"
            badge="No commitment"
            badgeTone="success"
            pitch="Top up funds and pay per send. Great for variable volume and seasonal campaigns."
            bullets={[
              'Per-segment SMS and per-email pricing',
              'Add à la carte add-ons (e.g. dedicated number)',
              'Optional auto-reload when balance gets low',
              'No monthly base — only pay for what you use',
            ]}
            cta="Start with Wallet"
            onPress={() => open('wallet')}
          />

          <ModeCard
            title="Subscription"
            badge="Best for steady volume"
            badgeTone="info"
            pitch="Predictable monthly plan with included email/SMS quotas and overage pricing."
            bullets={[
              'Monthly included quotas for SMS + email',
              'Optional add-ons: Document Signing, AI Auto-Response',
              'Lower per-unit cost at higher tiers',
              'Switch to Wallet anytime',
            ]}
            cta="Start with Subscription"
            onPress={() => open('subscription')}
          />
        </View>

        <Small style={{ textAlign: 'center', marginTop: spacing.md }}>
          Signup completes in a secure browser. After registration, sign in here with your new credentials.
        </Small>
      </Screen>
    </ScrollView>
  );
}
