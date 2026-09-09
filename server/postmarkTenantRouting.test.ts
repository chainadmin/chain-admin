import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTenantFromAddress,
  resolveTenantPostmarkToken,
  resolveTenantTransactionalStream,
} from '../api/_lib/postmarkTenantRouting';

test('dedicated Postmark routing decrypts migrated tenant server tokens', () => {
  let decryptedValue = '';
  const token = resolveTenantPostmarkToken(
    { postmarkServerToken: 'enc:v1:ciphertext' },
    value => {
      decryptedValue = value;
      return 'server-api-token';
    },
  );

  assert.equal(decryptedValue, 'enc:v1:ciphertext');
  assert.equal(token, 'server-api-token');
});

test('dedicated Postmark routing preserves plaintext tokens for unmigrated tenants', () => {
  assert.equal(
    resolveTenantPostmarkToken({ postmarkServerToken: 'server-api-token' }, () => 'unused'),
    'server-api-token',
  );
});

test('tenant email uses a provider-safe sender instead of the tenant contact email', () => {
  assert.equal(resolveTenantFromAddress({
    name: 'Example Agency',
    slug: 'example-agency',
    email: 'owner@unverified.example',
  }, 'support@chainsoftwaregroup.com'), 'Example Agency <example-agency@chainsoftwaregroup.com>');

  assert.equal(resolveTenantFromAddress({
    name: 'Example Agency',
    slug: 'example-agency',
    customSenderEmail: 'billing@example.com',
  }, 'support@chainsoftwaregroup.com'), 'Example Agency <billing@example.com>');
});

test('tenant transactional stream defaults to Postmark outbound', () => {
  assert.equal(resolveTenantTransactionalStream({ postmarkTransactionalStream: 'client-outbound' }), 'client-outbound');
  assert.equal(resolveTenantTransactionalStream({}), process.env.POSTMARK_TRANSACTIONAL_STREAM?.trim() || 'outbound');
});
