import React, { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { Body, Button, Card, H1, H3, Muted, Pill, Screen, Small } from '@/components/ui';
import { api, fetchTenantBillingMode } from '@/lib/api';
import { extractErrorMessage } from '@/navigation/types';
import { colors, spacing } from '@/theme/colors';

type Addon = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  monthlyPriceCents: number;
  perUnitPriceCents?: number | null;
  unitLabel?: string | null;
  isActive: boolean;
};

type TenantAddon = {
  id: string;
  addonId: string;
  addonCode?: string;
  addonName?: string;
  status: 'active' | 'cancelled' | string;
  quantity: number;
  nextChargeAt?: string | null;
};

function priceLabel(addon: Addon) {
  const monthly = (addon.monthlyPriceCents || 0) / 100;
  const per = addon.perUnitPriceCents ? (addon.perUnitPriceCents / 100).toFixed(2) : null;
  if (monthly > 0 && per) return `$${monthly.toFixed(2)}/mo + $${per}/${addon.unitLabel || 'unit'}`;
  if (monthly > 0) return `$${monthly.toFixed(2)}/mo`;
  if (per) return `$${per}/${addon.unitLabel || 'unit'}`;
  return 'Free';
}

export default function AddOnsScreen() {
  const [catalog, setCatalog] = useState<Addon[]>([]);
  const [active, setActive] = useState<TenantAddon[]>([]);
  const [billingMode, setBillingMode] = useState<'wallet' | 'subscription'>('subscription');
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [catRes, mineRes, mode] = await Promise.all([
        api.get<{ addons: Addon[] } | Addon[]>('/api/addons'),
        api.get<{ tenantAddons: TenantAddon[] } | TenantAddon[]>('/api/tenant/addons'),
        fetchTenantBillingMode(),
      ]);
      const cat = Array.isArray(catRes.data) ? catRes.data : (catRes.data as any).addons || [];
      const mine = Array.isArray(mineRes.data) ? mineRes.data : (mineRes.data as any).tenantAddons || [];
      setCatalog(cat.filter((a) => a.isActive));
      setActive(mine);
      setBillingMode(mode);
    } catch (e) {
      Alert.alert('Could not load add-ons', extractErrorMessage(e) || 'Try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const isEnabled = (code: string) => active.some((a) => (a.addonCode || a.addonId) === code && a.status === 'active');

  const onEnable = async (addon: Addon) => {
    setBusyCode(addon.code);
    try {
      await api.post(`/api/tenant/addons/${addon.code}/enable`, { quantity: 1 });
      Alert.alert('Add-on enabled', `${addon.name} is now active.`);
      await load();
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 402) {
        Alert.alert('Insufficient wallet balance', 'Top up your wallet from the Wallet screen, then try again.');
      } else {
        Alert.alert('Could not enable add-on', extractErrorMessage(e) || 'Try again later.');
      }
    } finally {
      setBusyCode(null);
    }
  };

  const onDisable = async (addon: Addon) => {
    Alert.alert(
      `Disable ${addon.name}?`,
      'You will stop being charged for this add-on next cycle. Any provisioned resources (e.g. dedicated phone numbers) will be released.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            setBusyCode(addon.code);
            try {
              await api.post(`/api/tenant/addons/${addon.code}/disable`, {});
              await load();
            } catch (e) {
              Alert.alert('Could not disable add-on', extractErrorMessage(e) || 'Try again later.');
            } finally {
              setBusyCode(null);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Screen style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
        <H1>Add-ons</H1>
        <Muted>
          {billingMode === 'wallet'
            ? 'Wallet mode — monthly fees deduct from your wallet on the 1st of each month.'
            : 'Subscription mode — monthly fees are added to your invoice on the 1st of each month.'}
        </Muted>

        {loading ? (
          <Card><Body>Loading…</Body></Card>
        ) : catalog.length === 0 ? (
          <Card><Body>No add-ons available right now.</Body></Card>
        ) : (
          catalog.map((addon) => {
            const enabled = isEnabled(addon.code);
            const busy = busyCode === addon.code;
            return (
              <Card key={addon.code} testID={`addon-${addon.code}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <H3>{addon.name}</H3>
                  {enabled ? <Pill color={colors.success || colors.accent}>Active</Pill> : <Pill color={colors.textMuted}>Inactive</Pill>}
                </View>
                {addon.description ? <Muted style={{ marginTop: 4 }}>{addon.description}</Muted> : null}
                <Small style={{ marginTop: spacing.sm }}>{priceLabel(addon)}</Small>
                <View style={{ marginTop: spacing.md }}>
                  {enabled ? (
                    <Button title="Disable" variant="danger" loading={busy} onPress={() => onDisable(addon)} />
                  ) : (
                    <Button title="Enable" loading={busy} onPress={() => onEnable(addon)} />
                  )}
                </View>
              </Card>
            );
          })
        )}
      </Screen>
    </ScrollView>
  );
}
