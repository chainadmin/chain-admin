import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DebtManagerProService,
  DmpImportError,
  normalizeDmpList,
} from './dmpService';
import { importDmpAccounts } from './dmpAccountImport';
import { storage } from './storage';

test('normalizes flat and wrapped DMP lists', () => {
  const portfolios = [{ id: 'portfolio-1', name: 'Primary' }];
  const accounts = [{ filenumber: 'file-1' }];

  assert.deepEqual(normalizeDmpList(portfolios, 'portfolios'), portfolios);
  assert.deepEqual(normalizeDmpList({ portfolios }, 'portfolios'), portfolios);
  assert.deepEqual(normalizeDmpList({ data: portfolios }, 'portfolios'), portfolios);
  assert.deepEqual(normalizeDmpList({ data: { accounts } }, 'accounts'), accounts);
});

test('accepts explicit empty lists but rejects truthy and malformed payloads', () => {
  assert.deepEqual(normalizeDmpList([], 'portfolios'), []);
  assert.deepEqual(normalizeDmpList({ accounts: [] }, 'accounts'), []);
  assert.throws(
    () => normalizeDmpList({ success: true }, 'portfolios'),
    /unsupported portfolios response format/
  );
  assert.throws(
    () => normalizeDmpList({ portfolios: [{ name: 'Missing ID' }] }, 'portfolios'),
    /without a valid ID/
  );
  assert.throws(
    () => normalizeDmpList({ accounts: [{ balance: 1 }] }, 'accounts'),
    /without a valid file number/
  );
});

test('connection test fails when DMP returns a truthy non-list object', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  storage.getTenantSettings = (async () => ({
    dmpEnabled: true,
    dmpApiUrl: 'https://dmp.example',
    dmpUsername: 'user',
    dmpPassword: 'password',
  })) as typeof storage.getTenantSettings;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    return url.endsWith('/api/v2/login')
      ? new Response(JSON.stringify({ token: 'test-token' }), { status: 200 })
      : new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await new DebtManagerProService().testConnection('tenant-1');
    assert.equal(result.success, false);
    assert.match(result.message, /unsupported portfolios response format/);
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
  }
});

test('import rejects invalid portfolio filters before contacting DMP', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  storage.getTenantSettings = (async () => ({
    dmpEnabled: true,
    dmpApiUrl: 'https://dmp.example',
    dmpUsername: 'user',
    dmpPassword: 'password',
  })) as typeof storage.getTenantSettings;
  globalThis.fetch = (async () => {
    fetchCount++;
    throw new Error('should not fetch');
  }) as typeof fetch;

  try {
    await assert.rejects(
      new DebtManagerProService().getAccounts('tenant-1', { portfolioId: '   ' }),
      (error: unknown) => error instanceof DmpImportError && error.statusCode === 400
    );
    assert.equal(fetchCount, 0);
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
  }
});

test('import surfaces upstream failures rather than reporting zero accounts', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  storage.getTenantSettings = (async () => ({
    dmpEnabled: true,
    dmpApiUrl: 'https://dmp.example',
    dmpUsername: 'user',
    dmpPassword: 'password',
  })) as typeof storage.getTenantSettings;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    return url.endsWith('/api/v2/login')
      ? new Response(JSON.stringify({ token: 'test-token' }), { status: 200 })
      : new Response('forbidden account data', { status: 403 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      new DebtManagerProService().getAccounts('tenant-1'),
      (error: unknown) =>
        error instanceof DmpImportError &&
        error.statusCode === 403 &&
        /permission was denied/.test(error.message) &&
        !error.message.includes('account data')
    );
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
  }
});

test('updates an existing account while preserving import payment fields', async () => {
  const updates: any[] = [];
  const fakeStorage = {
    getAccountsByTenant: async () => [{
      id: 'account-1',
      filenumber: 'file-1',
      accountNumber: 'account-number-1',
      status: 'active',
      creditor: 'Old creditor',
    }],
    updateAccount: async (id: string, values: any) => updates.push({ id, values }),
    getConsumerByEmailAndTenant: async () => null,
    getConsumerByPhoneAndTenant: async () => null,
    findConsumersByNameAndTenant: async () => [],
    createConsumer: async () => ({ id: 'consumer-1' }),
    createAccount: async () => undefined,
  };

  const result = await importDmpAccounts(fakeStorage, 'tenant-1', [{
    filenumber: 'file-1',
    accountNumber: 'account-number-1',
    balance: 12345,
    status: 'overdue',
    creditorName: 'New creditor',
  }]);

  assert.deepEqual(result, { imported: 0, updated: 1, skipped: 0, errors: [] });
  assert.deepEqual(updates, [{
    id: 'account-1',
    values: {
      balanceCents: 12345,
      status: 'overdue',
      creditor: 'New creditor',
    },
  }]);
});