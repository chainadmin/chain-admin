import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import type { IStorage } from '../storage';
import { resetStorageImplementation, setStorageImplementation } from '../storage';
import { pool } from '../db';

test('registering with a valid tenant slug marks the consumer as linked', async (t) => {
  const tenant = {
    id: 'tenant-123',
    slug: 'valid-tenant',
    name: 'Valid Tenant',
    isActive: true,
  };

  const getConsumerByEmail = mock.fn(async () => null);
  const getTenantBySlug = mock.fn(async (slug: string) =>
    slug === tenant.slug ? { ...tenant } : undefined
  );
  const createConsumer = mock.fn(async (consumer: any) => ({
    id: 'consumer-456',
    ...consumer,
  }));

  const storageMock: Partial<IStorage> = {
    getConsumerByEmail,
    getTenantBySlug,
    createConsumer,
  };

  setStorageImplementation(storageMock as IStorage);

  const { registerRoutes } = await import('../routes.ts');
  const app = express();
  const server = await registerRoutes(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  if (typeof server.unref === 'function') {
    server.unref();
  }

  t.after(async () => {
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
    resetStorageImplementation();
    await pool.end();
  });

  const { port } = server.address() as AddressInfo;
  const requestBody = JSON.stringify({
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    dateOfBirth: '1990-01-01',
    address: '123 Main St',
    city: 'Metropolis',
    state: 'NY',
    zipCode: '10001',
    tenantSlug: tenant.slug,
  });

  const { statusCode, body: responseBody } = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/consumer-registration',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(requestBody),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body: data });
        });
      }
    );

    req.on('error', reject);
    req.end(requestBody);
  });

  assert.strictEqual(statusCode, 200);
  const body = JSON.parse(responseBody);

  assert.deepEqual(body.tenant, {
    name: tenant.name,
    slug: tenant.slug,
  });
  assert.strictEqual(body.needsAgencyLink ?? false, false);
  assert.strictEqual(getTenantBySlug.mock.calls.length, 1);
  assert.strictEqual(createConsumer.mock.calls.length, 1);
});
