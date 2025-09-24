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
