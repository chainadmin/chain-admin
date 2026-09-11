import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDmpEmailOpenNote,
  DebtManagerProService,
  DmpImportError,
  normalizeDmpList,
  REDACTED_DMP_PASSWORD,
  sanitizeDmpTestOverrides,
} from './dmpService';
import {
  canDeleteAllDmpAccounts,
  DMP_DELETE_CONFIRMATION,
  hydrateDmpAccountPhones,
  importDmpAccounts,
  syncDmpAccountPayments,
} from './dmpAccountImport';
import { applyDmpBalanceRepair, planDmpBalanceRepair } from './dmpBalanceRepair';
import { storage } from './storage';

test('manual DMP sync hydrates missing account phones from the dedicated phone endpoint', async () => {
  const requested: string[] = [];
  const accounts = await hydrateDmpAccountPhones([
    { filenumber: 'file-1' },
    { filenumber: 'file-2', consumerPhone: '+12125550002' },
    { filenumber: 'file-3' },
  ], async filenumber => {
    requested.push(filenumber);
    if (filenumber === 'file-1') return [{ phone_number: '+12125550001' }];
    return [];
  });

  assert.deepEqual(requested.sort(), ['file-1', 'file-3']);
  assert.equal(accounts[0].consumerPhone, '+12125550001');
  assert.equal(accounts[1].consumerPhone, '+12125550002');
  assert.equal(accounts[2].consumerPhone, undefined);
});

test('builds a DMP note for a Postmark email-open event', () => {
  assert.deepEqual(buildDmpEmailOpenNote(' file-1 ', ' person@example.com '), {
    filenumber: 'file-1',
    collectorname: 'System',
    logmessage: 'Email opened by person@example.com',
  });
  assert.equal(
    buildDmpEmailOpenNote('file-1').logmessage,
    'Email opened by recipient',
  );
});

test('manual DMP sync caches posted history and pending payments on each DMP account', async () => {
  const updates: any[] = [];
  const result = await syncDmpAccountPayments({
    getAccountsByTenant: async () => [
      { id: 'account-1', filenumber: 'file-1', additionalData: { dmpSource: 'dmp', retained: true } },
      { id: 'local-account', filenumber: 'local-1', additionalData: {} },
    ],
    updateAccount: async (id: string, values: any) => updates.push({ id, values }),
  }, 'tenant-1', async filenumber => {
    assert.equal(filenumber, 'file-1');
    return [
      { paymentdate: '2026-09-01', paymentamount: '25.50', paymentstatus: 'Posted', transactionid: 'txn-1' },
      { scheduled_date: '2026-10-01', amount: 30, status: 'Scheduled', method: 'ACH' },
      { paymentdate: '2026-08-01', paymentamount: 10, paymentstatus: 'Declined' },
    ];
  });

  assert.deepEqual({
    accountsSynced: result.accountsSynced,
    historyPayments: result.historyPayments,
    pendingPayments: result.pendingPayments,
    errors: result.errors,
  }, { accountsSynced: 1, historyPayments: 1, pendingPayments: 1, errors: [] });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'account-1');
  assert.equal(updates[0].values.additionalData.retained, true);
  assert.deepEqual(updates[0].values.additionalData.dmpPaymentHistory, [{
    date: '2026-09-01', amountCents: 2550, status: 'Posted', transactionId: 'txn-1', paymentMethod: null,
  }]);
  assert.deepEqual(updates[0].values.additionalData.dmpPendingPayments, [{
    date: '2026-10-01', amountCents: 3000, status: 'Scheduled', transactionId: null, paymentMethod: 'ACH',
  }]);
  assert.match(updates[0].values.additionalData.dmpPaymentsSyncedAt, /^\d{4}-\d{2}-\d{2}T/);
});

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

test('DMP connection-test overrides use entered values without replacing a saved masked password', () => {
  assert.deepEqual(sanitizeDmpTestOverrides({
    dmpEnabled: true,
    dmpApiUrl: ' https://new-dmp.example/ ',
    dmpUsername: ' new-user ',
    dmpPassword: ' new-password ',
  }), {
    enabled: true,
    apiUrl: 'https://new-dmp.example/',
    username: 'new-user',
    password: 'new-password',
  });
  assert.deepEqual(sanitizeDmpTestOverrides({
    dmpPassword: REDACTED_DMP_PASSWORD,
  }), {});
  assert.deepEqual(sanitizeDmpTestOverrides({
    dmpPassword: '   ',
  }), {});
});

test('delete-all DMP policy is limited to owners and platform administrators', () => {
  assert.equal(DMP_DELETE_CONFIRMATION, 'DELETE ALL ACCOUNTS');
  assert.equal(canDeleteAllDmpAccounts('owner'), true);
  assert.equal(canDeleteAllDmpAccounts('platform_admin'), true);
  assert.equal(canDeleteAllDmpAccounts('manager'), false);
  assert.equal(canDeleteAllDmpAccounts('user'), false);
  assert.equal(canDeleteAllDmpAccounts(undefined), false);
});

test('connection test authenticates with unsaved form overrides and leaves saved settings untouched', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  let settingsReads = 0;
  const requests: Array<{ url: string; body?: unknown }> = [];
  storage.getTenantSettings = (async () => {
    settingsReads++;
    return {
      dmpEnabled: false,
      dmpApiUrl: 'https://saved.example',
      dmpUsername: 'saved-user',
      dmpPassword: 'saved-password',
    };
  }) as typeof storage.getTenantSettings;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return url.endsWith('/api/v2/login')
      ? new Response(JSON.stringify({ token: 'test-token' }), { status: 200 })
      : new Response(JSON.stringify([{ id: 'portfolio-1', name: 'Primary' }]), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await new DebtManagerProService().testConnection('tenant-1', {
      enabled: true,
      apiUrl: 'https://entered.example',
      username: 'entered-user',
      password: 'entered-password',
    });
    assert.equal(result.success, true);
    assert.equal(settingsReads, 1);
    assert.deepEqual(requests, [
      {
        url: 'https://entered.example/api/v2/login',
        body: { username: 'entered-user', password: 'entered-password' },
      },
      {
        url: 'https://entered.example/api/v2/getportfoliolist',
        body: undefined,
      },
    ]);
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

test('import surfaces a structured DMP validation reason without exposing other response fields', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const loggedValues: unknown[] = [];
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
      : new Response(JSON.stringify({
        message: 'portfolioId is required for private-account with SSN 123-45-6789',
        token: 'provider-secret-that-must-not-appear',
        account: { filenumber: 'private-account' },
      }), {
        status: 400,
        headers: { 'x-request-id': 'request-123' },
      });
  }) as typeof fetch;
  console.error = (...values: unknown[]) => {
    loggedValues.push(...values);
  };

  try {
    await assert.rejects(
      new DebtManagerProService().getAccounts('tenant-1', { portfolioId: 'private-portfolio-id' }),
      (error: unknown) =>
        error instanceof DmpImportError
        && error.statusCode === 502
        && error.message.includes('DMP requires a top-level portfolioId')
        && !error.message.includes('provider-secret')
        && !error.message.includes('private-account'),
    );
    const logs = JSON.stringify(loggedValues);
    assert.match(logs, /request-123/);
    assert.match(logs, /DMP requires a top-level portfolioId/);
    assert.doesNotMatch(logs, /provider-secret/);
    assert.doesNotMatch(logs, /private-account/);
    assert.doesNotMatch(logs, /private-portfolio-id/);
    assert.doesNotMatch(logs, /123-45-6789/);
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

for (const accountCount of [0, 100, 101, 500, 537]) {
  test(`imports all ${accountCount} DMP accounts with the confirmed paginated request contract`, async () => {
    const originalSettings = storage.getTenantSettings;
    const originalFetch = globalThis.fetch;
    const accountRequests: Array<{ body: any; authorization?: string; contentType?: string }> = [];
    const sourceAccounts = Array.from({ length: accountCount }, (_, index) => ({
      filenumber: `file-${index + 1}`,
      accountnumber: `account-${index + 1}`,
    }));
    storage.getTenantSettings = (async () => ({
      dmpEnabled: true,
      dmpApiUrl: 'https://dmp.example',
      dmpUsername: 'user',
      dmpPassword: 'password',
    })) as typeof storage.getTenantSettings;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v2/login')) {
        return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body));
      accountRequests.push({
        body,
        authorization: new Headers(init?.headers).get('Authorization') || undefined,
        contentType: new Headers(init?.headers).get('Content-Type') || undefined,
      });
      return new Response(JSON.stringify({
        accounts: sourceAccounts.slice(body.offset, body.offset + body.limit),
      }), { status: 200 });
    }) as typeof fetch;

    try {
      const accounts = await new DebtManagerProService().getAccounts(
        'tenant-1',
        { portfolioId: 'portfolio-1' },
      );
      assert.equal(accounts.length, accountCount);
      assert.equal(new Set(accounts.map(account => account.filenumber)).size, accountCount);
      assert.deepEqual(
        accountRequests.map(request => request.body),
        Array.from(
          {
            length: accountCount === 0
              ? 1
              : Math.ceil(accountCount / 100) + (accountCount % 100 === 0 ? 1 : 0),
          },
          (_, index) => ({
            portfolioId: 'portfolio-1',
            limit: 100,
            offset: index * 100,
          }),
        ),
      );
      assert.ok(accountRequests.every(request => request.authorization === 'Bearer test-token'));
      assert.ok(accountRequests.every(request => request.contentType === 'application/json'));
    } finally {
      storage.getTenantSettings = originalSettings;
      globalThis.fetch = originalFetch;
    }
  });
}

test('normalizes DMP file-number key variants and reports unusable rows without exposing values', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  const originalConsoleWarn = console.warn;
  const warnings: unknown[] = [];
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
      : new Response(JSON.stringify({
        accounts: [
          { FileNumber: ' file-1 ' },
          { file_number: 2 },
          { 'file-number': 'file-3' },
          { accountnumber: 'must-not-be-used-as-identity' },
          null,
        ],
      }), { status: 200 });
  }) as typeof fetch;
  console.warn = (...values: unknown[]) => {
    warnings.push(...values);
  };

  try {
    const result = await new DebtManagerProService().getAccountsWithStats(
      'tenant-1',
      { portfolioId: 'private-portfolio-id' },
    );
    assert.deepEqual(result.accounts.map(account => account.filenumber), [
      'file-1',
      '2',
      'file-3',
    ]);
    assert.equal(result.fetched, 5);
    assert.equal(result.rejected, 2);
    const warningText = JSON.stringify(warnings);
    assert.match(warningText, /"fetched":5/);
    assert.match(warningText, /"rejected":2/);
    assert.doesNotMatch(warningText, /must-not-be-used-as-identity/);
    assert.doesNotMatch(warningText, /private-portfolio-id/);
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
    console.warn = originalConsoleWarn;
  }
});

test('mixed-quality DMP pages continue beyond 500 rows using provider row offsets', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  const originalConsoleWarn = console.warn;
  const offsets: number[] = [];
  const sourceRows = Array.from({ length: 537 }, (_, index) => {
    if (index === 99) return { accountnumber: 'not-a-file-number' };
    if (index === 500) return { FileNumber: 'variant-501' };
    return { filenumber: `file-${index + 1}` };
  });
  storage.getTenantSettings = (async () => ({
    dmpEnabled: true,
    dmpApiUrl: 'https://dmp.example',
    dmpUsername: 'user',
    dmpPassword: 'password',
  })) as typeof storage.getTenantSettings;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/v2/login')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body));
    offsets.push(body.offset);
    return new Response(JSON.stringify({
      accounts: sourceRows.slice(body.offset, body.offset + body.limit),
      total: sourceRows.length,
    }), { status: 200 });
  }) as typeof fetch;
  console.warn = () => undefined;

  try {
    const result = await new DebtManagerProService().getAccountsWithStats(
      'tenant-1',
      { portfolioId: 'portfolio-1' },
    );
    assert.equal(result.fetched, 537);
    assert.equal(result.rejected, 1);
    assert.equal(result.accounts.length, 536);
    assert.ok(result.accounts.some(account => account.filenumber === 'variant-501'));
    assert.deepEqual(offsets, [0, 100, 200, 300, 400, 500]);
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
    console.warn = originalConsoleWarn;
  }
});

test('fails clearly when every returned DMP account row lacks a valid file number', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  const originalConsoleWarn = console.warn;
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
      : new Response(JSON.stringify({
        accounts: [
          { accountnumber: 'account-1' },
          { filenumber: '   ' },
        ],
      }), { status: 200 });
  }) as typeof fetch;
  console.warn = () => undefined;

  try {
    await assert.rejects(
      new DebtManagerProService().getAccountsWithStats(
        'tenant-1',
        { portfolioId: 'portfolio-1' },
      ),
      /none had a valid file number/,
    );
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
    console.warn = originalConsoleWarn;
  }
});

test('stops safely when DMP repeats a full page made only of unusable rows', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  const originalConsoleWarn = console.warn;
  let accountRequestCount = 0;
  storage.getTenantSettings = (async () => ({
    dmpEnabled: true,
    dmpApiUrl: 'https://dmp.example',
    dmpUsername: 'user',
    dmpPassword: 'password',
  })) as typeof storage.getTenantSettings;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/v2/login')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 });
    }
    accountRequestCount++;
    return new Response(JSON.stringify({
      accounts: Array.from({ length: 100 }, (_, index) => ({
        accountnumber: `account-${index + 1}`,
      })),
    }), { status: 200 });
  }) as typeof fetch;
  console.warn = () => undefined;

  try {
    await assert.rejects(
      new DebtManagerProService().getAccountsWithStats(
        'tenant-1',
        { portfolioId: 'private-portfolio-id' },
      ),
      (error: unknown) =>
        error instanceof DmpImportError
        && /repeated an account page/.test(error.message)
        && !error.message.includes('private-portfolio-id'),
    );
    assert.equal(accountRequestCount, 2);
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
    console.warn = originalConsoleWarn;
  }
});

test('imports every DMP portfolio and removes duplicate accounts across portfolios', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  const requestedPortfolioIds: string[] = [];
  storage.getTenantSettings = (async () => ({
    dmpEnabled: true,
    dmpApiUrl: 'https://dmp.example',
    dmpUsername: 'user',
    dmpPassword: 'password',
  })) as typeof storage.getTenantSettings;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/v2/login')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 });
    }
    if (url.endsWith('/api/v2/getportfoliolist')) {
      return new Response(JSON.stringify({
        portfolios: Array.from({ length: 7 }, (_, index) => ({
          id: `portfolio-${index + 1}`,
          name: `Portfolio ${index + 1}`,
        })),
      }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body));
    requestedPortfolioIds.push(body.portfolioId);
    return new Response(JSON.stringify({
      accounts: [
        { filenumber: 'shared-file' },
        { filenumber: `file-${body.portfolioId}` },
      ],
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const accounts = await new DebtManagerProService().getAccounts('tenant-1');
    assert.deepEqual(requestedPortfolioIds, Array.from(
      { length: 7 },
      (_, index) => `portfolio-${index + 1}`,
    ));
    assert.equal(accounts.length, 8);
    assert.equal(accounts.filter(account => account.filenumber === 'shared-file').length, 1);
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
  }
});

test('stops safely when DMP repeats a full account page', async () => {
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
      : new Response(JSON.stringify({
        accounts: Array.from({ length: 100 }, (_, index) => ({
          filenumber: `file-${index + 1}`,
        })),
      }), { status: 200 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      new DebtManagerProService().getAccounts('tenant-1', { portfolioId: 'private-portfolio-id' }),
      (error: unknown) =>
        error instanceof DmpImportError
        && /repeated an account page/.test(error.message)
        && !error.message.includes('private-portfolio-id'),
    );
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
  }
});

test('uses DMP total metadata to complete a full final page without an extra request', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  let accountRequestCount = 0;
  storage.getTenantSettings = (async () => ({
    dmpEnabled: true,
    dmpApiUrl: 'https://dmp.example',
    dmpUsername: 'user',
    dmpPassword: 'password',
  })) as typeof storage.getTenantSettings;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/v2/login')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 });
    }
    accountRequestCount++;
    return new Response(JSON.stringify({
      accounts: Array.from({ length: 100 }, (_, index) => ({
        filenumber: `file-${index + 1}`,
      })),
      pagination: { total: 100 },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const accounts = await new DebtManagerProService().getAccounts(
      'tenant-1',
      { portfolioId: 'portfolio-1' },
    );
    assert.equal(accounts.length, 100);
    assert.equal(accountRequestCount, 1);
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
      accountNumber: 'account-number-1',
      balanceCents: 12345,
      originalBalanceCents: 12345,
      status: 'overdue',
      creditor: 'New creditor',
      additionalData: {
        dmpSource: 'dmp',
        dmpClientName: null,
        dmpLastContactDate: null,
        dmpNextFollowUpDate: null,
        dmpPortfolioId: null,
        dmpAssignedCollectorId: null,
      },
    },
  }]);
});

test('DMP imports place accounts in the folder matching their status', async () => {
  const updates: any[] = [];
  const createdAccounts: any[] = [];
  const fakeStorage = {
    getAccountsByTenant: async () => [{
      id: 'existing-account',
      filenumber: 'existing-file',
      status: 'active',
      creditor: 'Existing creditor',
    }],
    getFoldersByTenant: async () => [
      { id: 'newbiz-folder', name: 'New Biz' },
      { id: 'active-folder', name: 'Active' },
    ],
    updateAccount: async (id: string, values: any) => updates.push({ id, values }),
    getConsumerByEmailAndTenant: async () => null,
    getConsumerByPhoneAndTenant: async () => null,
    findConsumersByNameAndTenant: async () => [],
    createConsumer: async () => ({ id: 'consumer-1' }),
    createAccount: async (values: any) => createdAccounts.push(values),
  };

  const result = await importDmpAccounts(fakeStorage, 'tenant-1', [
    { filenumber: 'existing-file', status: 'NEWBIZ' },
    { filenumber: 'new-file', status: 'new-biz' },
  ]);

  assert.deepEqual(result, { imported: 1, updated: 1, skipped: 0, errors: [] });
  assert.equal(updates[0].values.folderId, 'newbiz-folder');
  assert.equal(createdAccounts[0].folderId, 'newbiz-folder');
});

test('DMP imports create missing status folders unless a different folder was selected', async () => {
  const createdFolders: any[] = [];
  const createdAccounts: any[] = [];
  const fakeStorage = {
    getAccountsByTenant: async () => [],
    getFoldersByTenant: async () => [],
    createFolder: async (values: any) => {
      createdFolders.push(values);
      return { ...values, id: `folder-${createdFolders.length}` };
    },
    updateAccount: async () => undefined,
    getConsumerByEmailAndTenant: async () => null,
    getConsumerByPhoneAndTenant: async () => null,
    findConsumersByNameAndTenant: async () => [],
    createConsumer: async () => ({ id: 'consumer-1' }),
    createAccount: async (values: any) => createdAccounts.push(values),
  };

  await importDmpAccounts(fakeStorage, 'tenant-1', [
    { filenumber: 'new-1', status: 'NewBiz' },
    { filenumber: 'new-2', status: 'new-biz' },
  ]);

  assert.equal(createdFolders.length, 1);
  assert.equal(createdFolders[0].name, 'NewBiz');
  assert.deepEqual(createdAccounts.map(account => account.folderId), ['folder-1', 'folder-1']);

  createdFolders.length = 0;
  createdAccounts.length = 0;
  await importDmpAccounts(fakeStorage, 'tenant-1', [
    { filenumber: 'new-3', status: 'Legal' },
  ], 'selected-folder');

  assert.equal(createdFolders.length, 0);
  assert.equal(createdAccounts[0].folderId, 'selected-folder');
});

test('DMP imports never update an account based only on a colliding Chain account number', async () => {
  const createdAccounts: any[] = [];
  const updatedAccounts: any[] = [];
  const fakeStorage = {
    getAccountsByTenant: async () => [{
      id: 'chain-account',
      filenumber: null,
      accountNumber: 'shared-number',
      status: 'active',
      creditor: 'Chain creditor',
    }],
    updateAccount: async (id: string, values: any) => updatedAccounts.push({ id, values }),
    getConsumerByEmailAndTenant: async () => null,
    getConsumerByPhoneAndTenant: async () => null,
    findConsumersByNameAndTenant: async () => [],
    createConsumer: async () => ({ id: 'consumer-1' }),
    createAccount: async (values: any) => createdAccounts.push(values),
  };

  const result = await importDmpAccounts(fakeStorage, 'tenant-1', [{
    filenumber: 'dmp-file-1',
    accountNumber: 'shared-number',
    balance: 12345,
  }]);

  assert.equal(result.imported, 1);
  assert.equal(result.updated, 0);
  assert.equal(updatedAccounts.length, 0);
  assert.equal(createdAccounts[0].filenumber, 'dmp-file-1');
});

test('DMP imports normalize numeric file numbers before matching and persistence', async () => {
  const createdAccounts: any[] = [];
  const fakeStorage = {
    getAccountsByTenant: async () => [],
    updateAccount: async () => undefined,
    getConsumerByEmailAndTenant: async () => null,
    getConsumerByPhoneAndTenant: async () => null,
    findConsumersByNameAndTenant: async () => [],
    createConsumer: async () => ({ id: 'consumer-1' }),
    createAccount: async (values: any) => createdAccounts.push(values),
  };

  const result = await importDmpAccounts(fakeStorage, 'tenant-1', [{
    filenumber: 12345,
    balance: 1000,
  }]);

  assert.deepEqual(result, { imported: 1, updated: 0, skipped: 0, errors: [] });
  assert.equal(createdAccounts[0].filenumber, '12345');
  assert.equal(createdAccounts[0].accountNumber, '12345');
});

test('scheduled DMP import options reuse the shared importer without creating disabled accounts', async () => {
  const consumerUpdates: any[] = [];
  const createdAccounts: any[] = [];
  const fakeStorage = {
    getAccountsByTenant: async () => [{
      id: 'existing-account',
      filenumber: 'existing-file',
      consumerId: 'consumer-1',
      status: 'active',
      creditor: 'Old creditor',
    }],
    updateAccount: async () => undefined,
    updateConsumer: async (id: string, values: any) => consumerUpdates.push({ id, values }),
    getConsumerByEmailAndTenant: async () => null,
    getConsumerByPhoneAndTenant: async () => null,
    findConsumersByNameAndTenant: async () => [],
    createConsumer: async () => ({ id: 'consumer-created' }),
    createAccount: async (values: any) => createdAccounts.push(values),
  };

  const result = await importDmpAccounts(
    fakeStorage,
    'tenant-1',
    [
      {
        filenumber: 'existing-file',
        consumerEmail: 'updated@example.com',
        city: 'Updated City',
      },
      {
        filenumber: 'new-file',
        consumerEmail: 'new@example.com',
      },
    ],
    null,
    {
      createMissing: false,
      syncExistingConsumerContact: true,
    },
  );

  assert.deepEqual(result, { imported: 0, updated: 1, skipped: 1, errors: [] });
  assert.deepEqual(consumerUpdates, [{
    id: 'consumer-1',
    values: {
      email: 'updated@example.com',
      city: 'Updated City',
    },
  }]);
  assert.equal(createdAccounts.length, 0);
});

test('maps the confirmed camelCase DMP response into complete consumer and account records', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  const createdConsumers: any[] = [];
  const createdAccounts: any[] = [];
  storage.getTenantSettings = (async () => ({
    dmpEnabled: true,
    dmpApiUrl: 'https://dmp.example',
    dmpUsername: 'user',
    dmpPassword: 'password',
  })) as typeof storage.getTenantSettings;
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (String(input).endsWith('/api/v2/login')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 });
    }
    return new Response(JSON.stringify({
      success: true,
      total: 1,
      data: [{
        fileNumber: 'file-1',
        accountNumber: 'account-1',
        firstName: 'Test',
        lastName: 'Person',
        fullName: 'Test Person',
        dateOfBirth: '1990-01-01',
        ssnLast4: '1234',
        email: 'test@example.com',
        phoneNumber: '+12125550123',
        address: '1 Main St',
        city: 'Town',
        state: 'NY',
        zipCode: '10001',
        originalCreditor: 'Original Creditor',
        clientName: 'Client',
        originalBalance: 10000,
        currentBalance: 7500,
        status: 'open',
        lastContactDate: '2026-09-01',
        nextFollowUpDate: '2026-09-15',
        portfolioId: 'portfolio-1',
        assignedCollectorId: 'collector-1',
      }],
    }), { status: 200 });
  }) as typeof fetch;
  const fakeStorage = {
    getAccountsByTenant: async () => [],
    updateAccount: async () => undefined,
    getConsumerByEmailAndTenant: async () => null,
    getConsumerByPhoneAndTenant: async () => null,
    findConsumersByNameAndTenant: async () => [],
    createConsumer: async (values: any) => {
      createdConsumers.push(values);
      return { id: 'consumer-1' };
    },
    createAccount: async (values: any) => createdAccounts.push(values),
  };

  try {
    const fetched = await new DebtManagerProService().getAccounts('tenant-1', {
      portfolioId: 'portfolio-1',
    });
    const result = await importDmpAccounts(fakeStorage, 'tenant-1', fetched);
    assert.equal(result.imported, 1);
    assert.deepEqual(createdConsumers[0], {
      tenantId: 'tenant-1',
      firstName: 'Test',
      lastName: 'Person',
      email: 'test@example.com',
      phone: '+12125550123',
      address: '1 Main St',
      city: 'Town',
      state: 'NY',
      zipCode: '10001',
      dateOfBirth: '1990-01-01',
      ssnLast4: '1234',
      additionalData: { dmpFullName: 'Test Person' },
    });
    assert.deepEqual(createdAccounts[0], {
      tenantId: 'tenant-1',
      consumerId: 'consumer-1',
      accountNumber: 'account-1',
      filenumber: 'file-1',
      balanceCents: 7500,
      originalBalanceCents: 10000,
      creditor: 'Original Creditor',
      status: 'open',
      folderId: null,
      additionalData: {
        dmpSource: 'dmp',
        dmpClientName: 'Client',
        dmpLastContactDate: '2026-09-01',
        dmpNextFollowUpDate: '2026-09-15',
        dmpPortfolioId: 'portfolio-1',
        dmpAssignedCollectorId: 'collector-1',
      },
    });
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
  }
});

test('accepts legacy DOB and current-balance field names from DMP', async () => {
  const originalSettings = storage.getTenantSettings;
  const originalFetch = globalThis.fetch;
  storage.getTenantSettings = (async () => ({
    dmpEnabled: true,
    dmpApiUrl: 'https://dmp.example',
    dmpUsername: 'user',
    dmpPassword: 'password',
  })) as typeof storage.getTenantSettings;
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (String(input).endsWith('/api/v2/login')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: [{
      fileNumber: 'file-legacy',
      date_of_birth: '1985-05-06',
      current_balance: '4321',
      originalBalance: 10000,
    }] }), { status: 200 });
  }) as typeof fetch;

  try {
    const [account] = await new DebtManagerProService().getAccounts('tenant-1', {
      portfolioId: 'portfolio-legacy',
    });
    assert.equal(account.dateOfBirth, '1985-05-06');
    assert.equal(account.balance, 4321);
    assert.equal(account.originalBalance, 10000);
  } finally {
    storage.getTenantSettings = originalSettings;
    globalThis.fetch = originalFetch;
  }
});

test('DMP balance repair previews and idempotently applies authoritative cents by file number', async () => {
  const updates: any[] = [];
  const fakeStorage = {
    getAccountsByTenant: async () => [
      { id: 'dmp-1', filenumber: 'file-1', balanceCents: 750000, originalBalanceCents: 1000000, additionalData: { dmpSource: 'dmp' } },
      { id: 'dmp-2', filenumber: 'file-2', balanceCents: 5000, originalBalanceCents: 6000, additionalData: { dmpClientName: null } },
      { id: 'manual-1', filenumber: null, balanceCents: 9900, originalBalanceCents: 9900 },
      { id: 'smax-1', filenumber: 'file-3', balanceCents: 1000, originalBalanceCents: 1000, additionalData: {} },
    ],
    applyDmpBalanceRepair: async (tenantId: string, changes: any[]) => {
      updates.push({ tenantId, changes });
      return changes.length;
    },
  };
  const provider = [
    { filenumber: 'file-1', balance: 7500, originalBalance: 10000 },
    { filenumber: 'file-2', balance: 5000, originalBalance: 6000 },
    { filenumber: 'file-3', balance: 100, originalBalance: 100 },
    { filenumber: 'missing', balance: 100, originalBalance: 100 },
  ];

  const preview = await planDmpBalanceRepair(fakeStorage, 'tenant-1', provider);
  assert.deepEqual({
    matched: preview.matched,
    changed: preview.changed,
    unchanged: preview.unchanged,
    skipped: preview.skipped,
    applied: preview.applied,
  }, { matched: 2, changed: 1, unchanged: 1, skipped: 2, applied: 0 });
  assert.deepEqual(updates, []);

  const applied = await applyDmpBalanceRepair(fakeStorage, 'tenant-1', preview);
  assert.deepEqual(applied, { matched: 2, changed: 1, unchanged: 1, skipped: 2, applied: 1 });
  assert.deepEqual(updates, [{
    tenantId: 'tenant-1',
    changes: [{
      accountId: 'dmp-1',
      filenumber: 'file-1',
      expectedBalanceCents: 750000,
      expectedOriginalBalanceCents: 1000000,
      balanceCents: 7500,
      originalBalanceCents: 10000,
    }],
  }]);
});

test('reimport repairs a retained placeholder consumer instead of creating another consumer', async () => {
  const updates: any[] = [];
  let consumerCreates = 0;
  const createdAccounts: any[] = [];
  const retainedConsumer = {
    id: 'consumer-retained',
    firstName: 'Unknown',
    lastName: 'Consumer',
    email: 'person@example.com',
    address: null,
    city: null,
    state: null,
    zipCode: null,
    dateOfBirth: null,
    ssnLast4: null,
  };
  const fakeStorage = {
    getAccountsByTenant: async () => [],
    updateAccount: async () => undefined,
    updateConsumer: async (id: string, values: any) => updates.push({ id, values }),
    getConsumerByEmailAndTenant: async () => retainedConsumer,
    getConsumerByPhoneAndTenant: async () => null,
    findConsumersByNameAndTenant: async () => [],
    createConsumer: async () => {
      consumerCreates++;
      return { id: 'unexpected' };
    },
    createAccount: async (values: any) => createdAccounts.push(values),
  };

  const result = await importDmpAccounts(fakeStorage, 'tenant-1', [{
    filenumber: 'file-1',
    firstName: 'Correct',
    lastName: 'Name',
    consumerEmail: 'person@example.com',
    address: '1 Main St',
    city: 'Town',
    state: 'NY',
    zipCode: '10001',
    dateOfBirth: '1990-01-01',
    ssnLast4: '1234',
    balance: 750000,
    originalBalance: 1000000,
    creditorName: 'Creditor',
  }]);

  assert.equal(result.imported, 1);
  assert.equal(consumerCreates, 0);
  assert.deepEqual(updates, [{
    id: 'consumer-retained',
    values: {
      firstName: 'Correct',
      lastName: 'Name',
      address: '1 Main St',
      city: 'Town',
      state: 'NY',
      zipCode: '10001',
      dateOfBirth: '1990-01-01',
      ssnLast4: '1234',
    },
  }]);
  assert.equal(createdAccounts[0].consumerId, 'consumer-retained');
});
