import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';

const { resolveSmsProviderConfiguration, smsService } = await import('./smsService');
const { storage } = await import('./storage');

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

test('reports success when Twilio accepts the message even if tracking-write bookkeeping fails afterward', async () => {
  const svc = smsService as any;
  const originalGetTwilioClient = svc.getTwilioClient;
  const originalGetThrottleConfig = svc.getThrottleConfig;
  const originalCanSendSms = svc.canSendSms;
  const originalGetSmsProviderConfiguration = svc.getSmsProviderConfiguration;
  const originalIsPhoneNumberBlocked = (storage as any).isPhoneNumberBlocked;
  const originalCreateSmsTracking = (storage as any).createSmsTracking;
  const originalRecordMessagingUsageEvent = (storage as any).recordMessagingUsageEvent;

  svc.getTwilioClient = async () => ({
    messages: { create: async () => ({ sid: 'SM_TEST_123', status: 'queued' }) },
  });
  svc.getThrottleConfig = async () => ({ maxPerMinute: 1000, tenantId: 'company-a' });
  svc.canSendSms = () => true;
  svc.getSmsProviderConfiguration = async () => ({
    tenantId: 'company-a',
    accountSid: 'ACcompanyA',
    authSecret: 'secret-a',
    phoneNumber: '+17165550100',
    messagingServiceSid: null,
    approvalStatus: 'active',
    enabled: true,
    configVersion: 1,
  });
  (storage as any).isPhoneNumberBlocked = async () => false;
  // Simulates a DB hiccup on the post-send bookkeeping write - Twilio has
  // already accepted the message by the time this runs.
  (storage as any).createSmsTracking = async () => { throw new Error('simulated tracking DB failure'); };
  (storage as any).recordMessagingUsageEvent = async () => { throw new Error('simulated billing DB failure'); };

  try {
    const result = await smsService.sendSms('+17165550199', 'Your payment is due', 'company-a');
    assert.equal(result.success, true);
    assert.equal(result.messageId, 'SM_TEST_123');
  } finally {
    svc.getTwilioClient = originalGetTwilioClient;
    svc.getThrottleConfig = originalGetThrottleConfig;
    svc.canSendSms = originalCanSendSms;
    svc.getSmsProviderConfiguration = originalGetSmsProviderConfiguration;
    (storage as any).isPhoneNumberBlocked = originalIsPhoneNumberBlocked;
    (storage as any).createSmsTracking = originalCreateSmsTracking;
    (storage as any).recordMessagingUsageEvent = originalRecordMessagingUsageEvent;
  }
});