import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createGlobalAdminToken, verifyGlobalAdminToken } from './globalAdminAuth';

test('accepts a valid Global Admin token', () => {
  const secret = 'test-secret';
  const token = createGlobalAdminToken(secret);
  assert.deepEqual(verifyGlobalAdminToken(token, secret), {
    isAdmin: true,
    type: 'global_admin',
  });
});

test('rejects tenant, expired, and incorrectly signed tokens', () => {
  const secret = 'test-secret';
  const tenantToken = jwt.sign({ tenantId: 'tenant-a' }, secret);
  const expiredToken = jwt.sign(
    { isAdmin: true, type: 'global_admin' },
    secret,
    { expiresIn: -1 },
  );
  const wrongSecretToken = createGlobalAdminToken('wrong-secret');

  assert.equal(verifyGlobalAdminToken(tenantToken, secret), null);
  assert.equal(verifyGlobalAdminToken(expiredToken, secret), null);
  assert.equal(verifyGlobalAdminToken(wrongSecretToken, secret), null);
});