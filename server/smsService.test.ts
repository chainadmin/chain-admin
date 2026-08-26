import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';

const { resolveSmsProviderConfiguration } = await import('./smsService');

const configurations = new Map([
  ['company-a', {
    tenantId: 'company-a',
    accountSid: 'ACcompanyA',
    authSecret: 'secret-a',
    phoneNumber: '+17165550100',
    messagingServiceSid: null,
    approvalStatus: 'active',
    enabled: true,
    configVersion: 1,
  }],
  ['company-b', {
    tenantId: 'company-b',
    accountSid: 'ACcompanyB',
    authSecret: 'secret-b',
    phoneNumber: '+12125550100',
    messagingServiceSid: null,
    approvalStatus: 'active',
    enabled: true,
    configVersion: 1,
  }],
]);

test('resolves SMS credentials only for the requested tenant', async () => {
  const requestedTenantIds: string[] = [];
  const configuration = await resolveSmsProviderConfiguration('company-b', async (tenantId) => {
    requestedTenantIds.push(tenantId);
    return configurations.get(tenantId);
  });

  assert.deepEqual(requestedTenantIds, ['company-b']);
  assert.equal(configuration?.accountSid, 'ACcompanyB');
  assert.notEqual(configuration?.authSecret, configurations.get('company-a')?.authSecret);
});

test('fails closed when tenant SMS configuration is absent despite platform credentials', async () => {
  process.env.TWILIO_ACCOUNT_SID = 'ACplatform';
  process.env.TWILIO_AUTH_TOKEN = 'platform-secret';
  process.env.TWILIO_PHONE_NUMBER = '+18005550100';

  const configuration = await resolveSmsProviderConfiguration(
    'unconfigured-company',
    async () => undefined,
  );

  assert.equal(configuration, null);
});

test('fails closed for disabled, unapproved, or cross-tenant configuration', async () => {
  const base = configurations.get('company-a')!;
  assert.equal(await resolveSmsProviderConfiguration('company-a', async () => ({ ...base, enabled: false })), null);
  assert.equal(await resolveSmsProviderConfiguration('company-a', async () => ({ ...base, approvalStatus: 'pending' })), null);
  assert.equal(await resolveSmsProviderConfiguration('company-a', async () => configurations.get('company-b')), null);
});