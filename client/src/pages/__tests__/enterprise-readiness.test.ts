import assert from 'node:assert/strict';
import test from 'node:test';
import { activeSeatUsage, canActivateUser, processCursorBatches } from '../../../../shared/enterpriseCapacity';
import { buildConsumersPageUrl } from '../../hooks/use-paginated-consumers';

test('a tenant configured for 100 users accepts 66 active users and more', () => {
  const users = Array.from({ length: 66 }, () => ({ isActive: true }));
  assert.equal(activeSeatUsage(users), 66);
  assert.deepEqual(canActivateUser(users, 100), { allowed: true, activeUsers: 66, maxActiveUsers: 100 });
});

test('inactive users do not consume active seats and configured limit is enforced', () => {
  const users = [...Array.from({ length: 66 }, () => ({ isActive: true })), { isActive: false }];
  assert.equal(canActivateUser(users, 66).allowed, false);
  assert.equal(activeSeatUsage(users), 66);
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
