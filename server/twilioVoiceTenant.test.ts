import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test';

test('provisions only missing company Voice resources', async () => {
  const { provisionMissingCompanyVoiceResources } = await import('./companyTwilioService');
  const calls: string[] = [];
  const provisioner = {
    async createCompanyApiKey(subaccountSid: string) {
      calls.push(`key:${subaccountSid}`);
      return { sid: 'SK-company', secret: 'company-secret' };
    },
    async createCompanyTwimlApp(subaccountSid: string, _name: string, voiceUrl: string) {
      calls.push(`app:${subaccountSid}:${voiceUrl}`);
      return { sid: 'AP-company' };
    },
  };

  const created = await provisionMissingCompanyVoiceResources(
    'AC-company',
    'Company',
    { apiKeySid: null, apiKeySecret: null, twimlAppSid: null },
    provisioner,
    'https://company.example/api/voice/outbound',
  );
  assert.deepEqual(created, {
    apiKeySid: 'SK-company',
    apiKeySecret: 'company-secret',
    twimlAppSid: 'AP-company',
  });
  assert.deepEqual(calls, [
    'key:AC-company',
    'app:AC-company:https://company.example/api/voice/outbound',
  ]);

  calls.length = 0;
  assert.deepEqual(
    await provisionMissingCompanyVoiceResources(
      'AC-company',
      'Company',
      created,
      provisioner,
      'https://company.example/api/voice/outbound',
    ),
    created,
  );
  assert.deepEqual(calls, []);
});

test('replaces an unrecoverable API key and persists progress before TwiML work', async () => {
  const { provisionMissingCompanyVoiceResources } = await import('./companyTwilioService');
  const calls: string[] = [];
  const progress: any[] = [];
  const provisioner = {
    async createCompanyApiKey() { calls.push('create-key'); return { sid:'SK-new', secret:'new-secret' }; },
    async createCompanyTwimlApp() { calls.push('create-app'); return { sid:'AP-new' }; },
    async findCompanyApiKey() { calls.push('find-key'); return { sid:'SK-old' }; },
    async deleteCompanyApiKey(_account: string, sid: string) { calls.push(`delete:${sid}`); },
  };
  const result = await provisionMissingCompanyVoiceResources(
    'AC-company', 'Company', { apiKeySid:'SK-old', apiKeySecret:null, twimlAppSid:null },
    provisioner, 'https://company.example/api/voice/outbound',
    async value => { progress.push({ ...value }); },
  );
  assert.equal(result.apiKeySid, 'SK-new');
  assert.deepEqual(calls, ['find-key', 'delete:SK-old', 'create-key', 'create-app']);
  assert.equal(progress.length, 2);
  assert.equal(progress[0].apiKeySecret, 'new-secret');
  assert.equal(progress[1].twimlAppSid, 'AP-new');
});

test('Voice token uses company credentials and a tenant/user-bound identity', async () => {
  const { buildTenantVoiceIdentity, generateVoiceToken } = await import('./twilioVoiceService');
  const token = await generateVoiceToken('same-user', 'tenant-a', async () => ({
    tenantId: 'tenant-a',
    subaccountSid: 'AC11111111111111111111111111111111',
    apiKeySid: 'SK11111111111111111111111111111111',
    apiKeySecret: 'company-secret',
    twimlAppSid: 'AP11111111111111111111111111111111',
  }));
  const [, encodedPayload] = token.split('.');
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

  assert.equal(payload.iss, 'SK11111111111111111111111111111111');
  assert.equal(payload.sub, 'AC11111111111111111111111111111111');
  assert.equal(payload.grants.identity, buildTenantVoiceIdentity('tenant-a', 'same-user'));
  assert.notEqual(
    buildTenantVoiceIdentity('tenant-a', 'same-user'),
    buildTenantVoiceIdentity('tenant-b', 'same-user'),
  );
});

test('call primitives resolve only the requested company client', async () => {
  const { getRecordingUrl, hangupCall, initiateOutboundCall } = await import('./twilioVoiceService');
  const requestedTenants: string[] = [];
  const clientFactory = async (tenantId: string) => {
    requestedTenants.push(tenantId);
    const calls = Object.assign(
      (sid: string) => ({ update: async () => assert.equal(sid, 'CA-company') }),
      { create: async () => ({ sid: 'CA-company', status: 'queued' }) },
    );
    return {
      calls,
      recordings: () => ({ fetch: async () => ({ uri: '/Recordings/RE-company.json' }) }),
    } as any;
  };

  assert.deepEqual(
    await initiateOutboundCall('tenant-a', '2125550100', '7165550100', 'https://example.test/api/voice/outbound', clientFactory),
    { callSid: 'CA-company', status: 'queued' },
  );
  assert.equal(
    await getRecordingUrl('tenant-a', 'RE-company', clientFactory),
    'https://api.twilio.com/Recordings/RE-company.mp3',
  );
  assert.equal(await hangupCall('tenant-a', 'CA-company', clientFactory), true);
  assert.deepEqual(requestedTenants, ['tenant-a', 'tenant-a', 'tenant-a']);
});