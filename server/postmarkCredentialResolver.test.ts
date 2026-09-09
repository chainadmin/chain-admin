import assert from 'node:assert/strict';
import test from 'node:test';

import { encryptCredential, decryptCredential } from './credentialCrypto';
import { resolvePostmarkServerToken } from './postmarkCredentialResolver';

test('resolves a valid encrypted Postmark token without account recovery', async () => {
  const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  process.env.CREDENTIAL_ENCRYPTION_KEY = 'current-key';
  try {
    const storedToken = encryptCredential('tenant-server-token');
    let recoveryCalls = 0;
    const result = await resolvePostmarkServerToken({
      tenant: { postmarkServerId: '42', postmarkServerToken: storedToken },
      recoverServerToken: async () => {
        recoveryCalls++;
        return null;
      },
    });
    assert.equal(result, 'tenant-server-token');
    assert.equal(recoveryCalls, 0);
  } finally {
    if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
  }
});

test('recovers and re-encrypts a Postmark token after an application key rotation', async () => {
  const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  try {
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'old-key';
    const obsoleteToken = encryptCredential('obsolete-token');
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'new-key';

    let persistedToken = '';
    const result = await resolvePostmarkServerToken({
      tenant: { postmarkServerId: '123', postmarkServerToken: obsoleteToken },
      recoverServerToken: async serverId => {
        assert.equal(serverId, 123);
        return 'current-postmark-token';
      },
      persistRecoveredToken: async token => {
        persistedToken = token;
      },
    });

    assert.equal(result, 'current-postmark-token');
    assert.match(persistedToken, /^enc:v1:/);
    assert.equal(decryptCredential(persistedToken), 'current-postmark-token');
  } finally {
    if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
  }
});

test('reports an actionable error when a broken token has no server ID', async () => {
  const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  try {
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'old-key';
    const obsoleteToken = encryptCredential('obsolete-token');
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'new-key';

    await assert.rejects(
      resolvePostmarkServerToken({
        tenant: { postmarkServerToken: obsoleteToken },
        recoverServerToken: async () => 'unused',
      }),
      /no valid server ID is available for recovery/,
    );
  } finally {
    if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
  }
});
