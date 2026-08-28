import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { activeSeatUsage, canActivateUser, processCursorBatches } from '../../../../shared/enterpriseCapacity';
import { buildConsumersPageUrl } from '../../hooks/use-paginated-consumers';
import { canTenantViewBilling } from '../../../../shared/tenantAccess';

test('municipal tenants hide self-service billing without changing other tenant types', () => {
  assert.equal(canTenantViewBilling('municipality'), false);
  assert.equal(canTenantViewBilling('municipality', ['billing']), true);
  assert.equal(canTenantViewBilling('collection_agency'), true);
  assert.equal(canTenantViewBilling(undefined), true);
});

test('a tenant configured for 100 users accepts 66 active users and more', () => {
  const users = Array.from({ length: 66 }, () => ({ isActive: true }));
  assert.equal(activeSeatUsage(users), 66);
  const capacity = canActivateUser(users, 100);
  assert.equal(capacity.allowed, true);
  assert.equal(capacity.activeUsers, 66);
  assert.equal(capacity.maxActiveUsers, 100);
});

test('inactive users do not consume active seats and configured limit is enforced', () => {
  const users = [...Array.from({ length: 66 }, () => ({ isActive: true })), { isActive: false }];
  assert.equal(canActivateUser(users, 66).allowed, false);
  assert.equal(activeSeatUsage(users), 66);
});

test('municipalities include 66 users and meter rather than block additional users', () => {
  const includedUsers = Array.from({ length: 66 }, () => ({ isActive: true }));
  const summary = canActivateUser(includedUsers, 2, 'municipality');
  assert.equal(summary.allowed, true);
  assert.equal(summary.maxActiveUsers, 66);
  assert.equal(summary.additionalBillableUsers, 0);
  assert.equal(summary.hasUnlimitedUsers, true);
  const overage = canActivateUser([...includedUsers, { isActive: true }, { isActive: true }], 66, 'municipality');
  assert.equal(overage.additionalBillableUsers, 2);
  assert.equal(overage.allowed, true);
});

test('500,000 campaign recipients are processed with no batch over 500 records', async () => {
  const total = 500_000;
  let largestBatch = 0;
  const processed = await processCursorBatches({
    fetchBatch: async (cursor, limit) => {
      const start = cursor ? Number(cursor) + 1 : 1;
      const count = Math.max(0, Math.min(limit, total - start + 1));
      return Array.from({ length: count }, (_, index) => ({ id: String(start + index) }));
    },
    processBatch: async items => { largestBatch = Math.max(largestBatch, items.length); },
  });
  assert.equal(processed, total);
  assert.equal(largestBatch, 500);
});

test('consumer list requests always opt into the paginated response contract', () => {
  const url = buildConsumersPageUrl({
    cursor: '00000000-0000-0000-0000-000000000100',
    search: ' Jane@example.com ',
    registration: 'registered',
    folderId: '00000000-0000-0000-0000-000000000200',
    limit: 100,
  });
  const parsed = new URL(url, 'https://chain.example');
  assert.equal(parsed.pathname, '/api/consumers');
  assert.equal(parsed.searchParams.get('format'), 'page');
  assert.equal(parsed.searchParams.get('limit'), '100');
  assert.equal(parsed.searchParams.get('cursor'), '00000000-0000-0000-0000-000000000100');
  assert.equal(parsed.searchParams.get('search'), 'Jane@example.com');
  assert.equal(parsed.searchParams.get('registration'), 'registered');
});

test('SMS sending fails closed instead of using global Twilio configuration', () => {
  const smsServiceSource = readFileSync(
    new URL('../../../../server/smsService.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(smsServiceSource, /process\.env\.TWILIO_(?:ACCOUNT_SID|AUTH_TOKEN|PHONE_NUMBER)/);
  assert.doesNotMatch(smsServiceSource, /clients\.get\(['"]default['"]\)/);
});
