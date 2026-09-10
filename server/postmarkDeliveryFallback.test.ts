import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isPostmarkAuthenticationError,
  resolvePostmarkTokenForDelivery,
} from './postmarkDeliveryFallback';

test('uses plaintext and decryptable tenant Postmark credentials', () => {
  assert.equal(resolvePostmarkTokenForDelivery(' tenant-token ', () => 'unused'), 'tenant-token');
  assert.equal(resolvePostmarkTokenForDelivery('enc:v1:value', () => 'decrypted-token'), 'decrypted-token');
});

test('falls back to the platform server when a migrated credential cannot be decrypted', () => {
  assert.equal(resolvePostmarkTokenForDelivery('enc:v1:obsolete', () => {
    throw new Error('Unsupported state or unable to authenticate data');
  }), null);
});

test('only classifies rejected Postmark authentication as safe to retry', () => {
  assert.equal(isPostmarkAuthenticationError({ statusCode: 401, message: 'Unauthorized' }), true);
  assert.equal(isPostmarkAuthenticationError({ code: 10, message: 'Bad token' }), true);
  assert.equal(isPostmarkAuthenticationError({ statusCode: 500, message: 'Timed out' }), false);
});
