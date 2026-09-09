export interface TenantPostmarkRouting {
  name?: string | null;
  slug?: string | null;
  email?: string | null;
  customSenderEmail?: string | null;
  postmarkServerToken?: string | null;
  postmarkTransactionalStream?: string | null;
  postmarkInboundAddress?: string | null;
}

export function resolveTenantPostmarkToken(
  tenant: TenantPostmarkRouting,
  decrypt: (value: string) => string,
): string | null {
  const storedToken = tenant.postmarkServerToken?.trim();
  if (!storedToken) return null;
  return storedToken.startsWith('enc:v1:') ? decrypt(storedToken) : storedToken;
}

export function resolveTenantFromAddress(tenant: TenantPostmarkRouting, fallback: string): string {
  const senderAddress = tenant.customSenderEmail?.trim()
    || (tenant.slug?.trim() ? `${tenant.slug.trim()}@chainsoftwaregroup.com` : '')
    || fallback;
  return tenant.name?.trim() ? `${tenant.name.trim()} <${senderAddress}>` : senderAddress;
}

export function resolveTenantTransactionalStream(tenant: TenantPostmarkRouting): string {
  return tenant.postmarkTransactionalStream?.trim()
    || process.env.POSTMARK_TRANSACTIONAL_STREAM?.trim()
    || 'outbound';
}
