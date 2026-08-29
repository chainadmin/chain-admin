import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAdminCommunicationsInventory,
  type CommunicationsDatabaseInventory,
  type CommunicationsInventoryProvider,
} from './adminCommunicationsService';

const database: CommunicationsDatabaseInventory = {
  tenants: [
    {
      tenantId: 'tenant-a',
      tenantName: 'Alpha',
      legacyAccountSid: 'AC_ALPHA',
      legacyPhoneNumber: '+1 (716) 555-0100',
    },
    {
      tenantId: 'tenant-b',
      tenantName: 'Beta',
      legacyAccountSid: 'AC_SHARED',
      legacyPhoneNumber: null,
    },
  ],
  smsConfigurations: [
    {
      tenantId: 'tenant-a',
      accountSid: 'AC_ALPHA',
      phoneNumber: '+17165550101',
      messagingServiceSid: 'MG_ALPHA',
      enabled: true,
    },
    {
      tenantId: 'tenant-b',
      accountSid: 'AC_SHARED',
      phoneNumber: '+12125550100',
      messagingServiceSid: null,
      enabled: true,
    },
  ],
  voipPhoneNumbers: [
    {
      id: 'number-a',
      tenantId: 'tenant-a',
      phoneNumber: '+17165550102',
      twilioPhoneSid: 'PN_ALPHA',
      twilioSubaccountSid: 'AC_ALPHA',
      status: 'ACTIVE',
      isActive: true,
    },
    {
      id: 'number-b',
      tenantId: 'tenant-b',
      phoneNumber: '+14155550100',
      twilioPhoneSid: 'PN_SHARED',
      twilioSubaccountSid: 'AC_SHARED',
      status: 'ACTIVE',
      isActive: true,
    },
    {
      id: 'number-conflict',
      tenantId: 'tenant-a',
      phoneNumber: '+14155550101',
      twilioPhoneSid: 'PN_CONFLICT',
      twilioSubaccountSid: 'AC_SHARED',
      status: 'ACTIVE',
      isActive: true,
    },
  ],
};

const store = {
  async loadInventory() {
    return database;
  },
};

test('reconciles provider accounts and numbers as mapped, unmapped, or ambiguous', async () => {
  const provider: CommunicationsInventoryProvider = {
    async listChildAccounts() {
      return [
        { sid: 'AC_ALPHA', friendlyName: 'Alpha account', status: 'active' },
        { sid: 'AC_SHARED', friendlyName: 'Conflicted account', status: 'active' },
        { sid: 'AC_UNKNOWN', friendlyName: 'Unknown account', status: 'suspended' },
      ];
    },
    async listIncomingNumbers(accountSid) {
      if (accountSid === 'AC_ALPHA') {
        return [
          { sid: 'PN_ALPHA', phoneNumber: '+17165550102', friendlyName: 'Voice' },
          { sid: 'PN_MISSING', phoneNumber: '+18005550199' },
        ];
      }
      if (accountSid === 'AC_SHARED') {
        return [{ sid: 'PN_SHARED', phoneNumber: '+14155550100' }];
      }
      return [];
    },
  };

  const result = await getAdminCommunicationsInventory({ provider, store });

  assert.equal(result.provider.status, 'available');
  assert.equal(result.provider.accounts[0].reconciliation, 'mapped');
  assert.deepEqual(result.provider.accounts[0].matches.map((match) => match.tenantId), ['tenant-a']);
  assert.equal(result.provider.accounts[0].incomingNumbers.items[0].reconciliation, 'mapped');
  assert.equal(result.provider.accounts[0].incomingNumbers.items[1].reconciliation, 'unmapped');
  assert.equal(result.provider.accounts[1].reconciliation, 'ambiguous');
  assert.deepEqual(
    result.provider.accounts[1].matches.map((match) => match.tenantId),
    ['tenant-a', 'tenant-b'],
  );
  assert.equal(result.provider.accounts[1].incomingNumbers.items[0].reconciliation, 'mapped');
  assert.equal(result.provider.accounts[2].reconciliation, 'unmapped');
});

test('retains safe database inventory and reports unavailable when provider listing fails', async () => {
  const provider: CommunicationsInventoryProvider = {
    async listChildAccounts() {
      throw new Error('request failed; auth token=do-not-return-this');
    },
    async listIncomingNumbers() {
      throw new Error('not reached');
    },
  };

  const result = await getAdminCommunicationsInventory({ provider, store });

  assert.equal(result.provider.status, 'unavailable');
  assert.match(result.provider.error!, /unavailable/);
  assert.doesNotMatch(JSON.stringify(result), /do-not-return-this|authSecret|authToken/);
  assert.deepEqual(result.database, database);
});

test('reports partial inventory when one account number listing fails', async () => {
  const provider: CommunicationsInventoryProvider = {
    async listChildAccounts() {
      return [{ sid: 'AC_ALPHA' }, { sid: 'AC_UNKNOWN' }];
    },
    async listIncomingNumbers(accountSid) {
      if (accountSid === 'AC_ALPHA') throw new Error('Twilio timeout');
      return [];
    },
  };

  const result = await getAdminCommunicationsInventory({ provider, store });

  assert.equal(result.provider.status, 'partial');
  assert.equal(result.provider.accounts[0].incomingNumbers.status, 'unavailable');
  assert.match(result.provider.accounts[0].incomingNumbers.error!, /unavailable/);
  assert.equal(result.provider.accounts[1].incomingNumbers.status, 'available');
  assert.deepEqual(result.database, database);
});

test('bounds concurrent provider number requests', async () => {
  let active = 0;
  let maxActive = 0;
  const provider: CommunicationsInventoryProvider = {
    async listChildAccounts() {
      return Array.from({ length: 12 }, (_, index) => ({ sid: `AC_${index}` }));
    },
    async listIncomingNumbers() {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return [];
    },
  };

  const result = await getAdminCommunicationsInventory({ provider, store });

  assert.equal(result.provider.status, 'available');
  assert.equal(result.provider.accounts.length, 12);
  assert.ok(maxActive <= 5, `expected at most 5 concurrent calls, observed ${maxActive}`);
});

test('does not release a concurrency slot while the underlying provider request is unresolved', async () => {
  let active = 0;
  let maxActive = 0;
  const releases: Array<() => void> = [];
  const provider: CommunicationsInventoryProvider = {
    async listChildAccounts() {
      return Array.from({ length: 6 }, (_, index) => ({ sid: `AC_HUNG_${index}` }));
    },
    listIncomingNumbers() {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise(resolve => {
        releases.push(() => {
          active -= 1;
          resolve([]);
        });
      });
    },
  };

  const pending = getAdminCommunicationsInventory({ provider, store });
  while (releases.length < 5) await new Promise(resolve => setTimeout(resolve, 1));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(releases.length, 5);
  assert.equal(active, 5);

  releases.slice(0, 5).forEach(release => release());
  while (releases.length < 6) await new Promise(resolve => setTimeout(resolve, 1));
  releases[5]();

  const result = await pending;
  assert.equal(result.provider.accounts.length, 6);
  assert.equal(maxActive, 5);
});