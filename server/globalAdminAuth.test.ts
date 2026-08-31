import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
  createGlobalAdminToken,
  validateGlobalAdminPassword,
  verifyGlobalAdminToken,
} from './globalAdminAuth';

test('accepts a valid Global Admin token', () => {
  const secret = 'test-secret';
  const token = createGlobalAdminToken(secret, 3);
  assert.deepEqual(verifyGlobalAdminToken(token, secret), {
    isAdmin: true,
    type: 'global_admin',
    credentialVersion: 3,
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
  const wrongSecretToken = createGlobalAdminToken('wrong-secret', 1);

  assert.equal(verifyGlobalAdminToken(tenantToken, secret), null);
  assert.equal(verifyGlobalAdminToken(expiredToken, secret), null);
  assert.equal(verifyGlobalAdminToken(wrongSecretToken, secret), null);
});

test('rejects legacy Global Admin tokens without a credential version', () => {
  const secret = 'test-secret';
  const legacyToken = jwt.sign({ isAdmin: true, type: 'global_admin' }, secret);
  assert.equal(verifyGlobalAdminToken(legacyToken, secret), null);
});

test('enforces strong replacement passwords', () => {
  assert.match(validateGlobalAdminPassword('too-short') || '', /14 characters/);
  assert.match(validateGlobalAdminPassword('alllowercase123!') || '', /uppercase/);
  assert.equal(validateGlobalAdminPassword('StrongPassword123!'), null);
});
