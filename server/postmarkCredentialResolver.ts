import { decryptCredential, encryptCredential } from './credentialCrypto';

export interface PostmarkCredentialRecord {
  postmarkServerId?: string | null;
  postmarkServerToken?: string | null;
}

interface ResolvePostmarkCredentialOptions {
  tenant: PostmarkCredentialRecord;
  recoverServerToken: (serverId: number) => Promise<string | null>;
  persistRecoveredToken?: (encryptedToken: string) => Promise<void>;
}

/**
 * Resolve a tenant's Postmark server token and repair credentials encrypted
 * with an obsolete application key. The Postmark account API is the source of
 * truth for a server token, so a key rotation must not permanently strand a
 * tenant on an unusable encrypted value.
 */
export async function resolvePostmarkServerToken({
  tenant,
  recoverServerToken,
  persistRecoveredToken,
}: ResolvePostmarkCredentialOptions): Promise<string | null> {
  const storedToken = tenant.postmarkServerToken?.trim();
  if (!storedToken) return null;

  try {
    return storedToken.startsWith('enc:v1:') ? decryptCredential(storedToken) : storedToken;
  } catch (error) {
    const serverId = Number(tenant.postmarkServerId);
    if (!Number.isSafeInteger(serverId) || serverId <= 0) {
      throw new Error('Tenant Postmark credential cannot be decrypted and no valid server ID is available for recovery', {
        cause: error,
      });
    }

    const recoveredToken = (await recoverServerToken(serverId))?.trim();
    if (!recoveredToken) {
      throw new Error(`Tenant Postmark credential cannot be decrypted and server ${serverId} did not return a replacement token`, {
        cause: error,
      });
    }

    if (persistRecoveredToken) {
      await persistRecoveredToken(encryptCredential(recoveredToken));
    }
    return recoveredToken;
  }
}
