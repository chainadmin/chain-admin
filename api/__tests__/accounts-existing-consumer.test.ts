import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-secret';

interface TestRequest {
  method: string;
  headers: Record<string, string>;
  body: any;
}

interface TestResponse {
  status(code: number): TestResponse;
  json(payload: any): TestResponse;
  end(): TestResponse;
}

test('updates existing consumer details before linking account', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_SECRET;

  const existingConsumer = {
    id: 'consumer-1',
    tenantId: 'tenant-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '555-0000',
    dateOfBirth: '1990-01-01',
    address: '1 Old St',
    city: 'Oldtown',
    state: 'NY',
    zipCode: '10001',
    additionalData: {},
    folderId: null,
    isRegistered: false,
    createdAt: new Date(),
  };

  const updateCalls: Array<{ data: Record<string, unknown> }> = [];
  const insertCalls: Array<Record<string, unknown>> = [];

  const fakeDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [existingConsumer],
        }),
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => {
        updateCalls.push({ data });
        return {
          where: () => ({
            returning: async () => [{ ...existingConsumer, ...data }],
          }),
        };
      },
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        insertCalls.push(vals);
        return {
          returning: async () => [{ id: 'account-1', ...vals }],
        };
      },
    }),
  };

  const { createAccountsHandler } = await import('../accounts.ts');
  const handler = createAccountsHandler(() => fakeDb as any);

  const token = jwt.sign({ tenantId: 'tenant-1' }, TEST_SECRET);

  const req: TestRequest = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '555-1111',
      accountNumber: 'ACC-1',
      creditor: 'Creditor Inc',
      balanceCents: 10000,
      folderId: null,
      dateOfBirth: '1991-02-02',
      address: '123 New St',
      city: 'Newville',
      state: 'CA',
      zipCode: '90210',
      additionalData: { note: 'test' },
      dueDate: null,
    },
  };

  let statusCode: number | undefined;
  let jsonResponse: any;

  const res: TestResponse = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: any) {
      jsonResponse = payload;
      return this;
    },
    end() {
      return this;
    },
  };

  await handler(req as any, res as any);

  assert.equal(statusCode, 201);
  assert.ok(jsonResponse);
  assert.equal(jsonResponse.consumerId, existingConsumer.id);

  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0].data, {
    dateOfBirth: '1991-02-02',
    address: '123 New St',
    city: 'Newville',
    state: 'CA',
    zipCode: '90210',
    phone: '555-1111',
  });

  assert.equal(insertCalls.length, 1);
  assert.equal(insertCalls[0].consumerId, existingConsumer.id);

  if (originalSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalSecret;
  }
});

test('preserves existing consumer fields when no overrides are provided', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_SECRET;

  const existingConsumer = {
    id: 'consumer-2',
    tenantId: 'tenant-1',
    firstName: 'Sam',
    lastName: 'Smith',
    email: 'sam@example.com',
    phone: '555-2222',
    dateOfBirth: '1985-05-05',
    address: '456 Old Rd',
    city: 'Townsville',
    state: 'TX',
    zipCode: '73301',
    additionalData: {},
    folderId: null,
    isRegistered: false,
    createdAt: new Date(),
  };

  let updateCalled = false;
  const insertCalls: Array<Record<string, unknown>> = [];

  const fakeDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [existingConsumer],
        }),
      }),
    }),
    update: () => {
      updateCalled = true;
      return {
        set: () => ({
          where: () => ({
            returning: async () => [existingConsumer],
          }),
        }),
      };
    },
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        insertCalls.push(vals);
        return {
          returning: async () => [{ id: 'account-2', ...vals }],
        };
      },
    }),
  };

  const { createAccountsHandler } = await import('../accounts.ts');
  const handler = createAccountsHandler(() => fakeDb as any);

  const token = jwt.sign({ tenantId: 'tenant-1' }, TEST_SECRET);

  const req: TestRequest = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: {
      firstName: 'Sam',
      lastName: 'Smith',
      email: 'sam@example.com',
      accountNumber: 'ACC-2',
      creditor: 'Creditor Inc',
      balanceCents: 5000,
      folderId: null,
      additionalData: { note: 'no overrides' },
      dueDate: null,
    },
  };

  let statusCode: number | undefined;

  const res: TestResponse = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
    end() {
      return this;
    },
  };

  await handler(req as any, res as any);

  assert.equal(statusCode, 201);
  assert.equal(updateCalled, false);
  assert.equal(insertCalls.length, 1);
  assert.equal(insertCalls[0].consumerId, existingConsumer.id);

  if (originalSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalSecret;
  }
});
