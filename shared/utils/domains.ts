function sanitizeDomainInput(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase() || null;
  }
}

const DEFAULT_DOMAINS = ['chainsoftware.com', 'chainsoftwaregroup.com'];

const primaryConfiguredDomains = [
  process.env.CONSUMER_PORTAL_BASE_DOMAIN,
  process.env.PRIMARY_CUSTOM_DOMAIN,
]
  .map(sanitizeDomainInput)
  .filter((domain): domain is string => Boolean(domain));

const secondaryConfiguredDomains = [
  process.env.PUBLIC_BASE_DOMAIN,
  process.env.PUBLIC_APP_BASE_DOMAIN,
  process.env.PUBLIC_BASE_URL,
  process.env.LEGACY_CUSTOM_DOMAIN,
]
  .map(sanitizeDomainInput)
  .filter((domain): domain is string => Boolean(domain));

const KNOWN_DOMAINS = Array.from(
  new Set([
    ...primaryConfiguredDomains,
    ...DEFAULT_DOMAINS,
    ...secondaryConfiguredDomains,
  ])
);

export function getKnownDomains(): string[] {
  return KNOWN_DOMAINS;
}

export function getPreferredDomain(): string {
  return KNOWN_DOMAINS[0];
}

export function buildTenantHostname(tenantSlug: string): string {
  return `${tenantSlug}.${getPreferredDomain()}`;
}

export function buildTenantUrl(tenantSlug: string, protocol: 'http' | 'https' = 'https'): string {
  return `${protocol}://${buildTenantHostname(tenantSlug)}`;
}

export function normalizeHostname(hostname?: string | null): string | null {
  if (!hostname) return null;
  return hostname.trim().toLowerCase() || null;
}

export function matchKnownDomain(hostname?: string | null): string | null {
  const normalizedHost = normalizeHostname(hostname);
  if (!normalizedHost) return null;

  const hostWithoutPort = normalizedHost.split(':')[0];

  for (const domain of KNOWN_DOMAINS) {
    if (hostWithoutPort === domain) return domain;
    if (hostWithoutPort === `www.${domain}`) return domain;
    if (hostWithoutPort.endsWith(`.${domain}`)) return domain;
  }

  return null;
}

export function isHostnameOnKnownDomain(hostname?: string | null): boolean {
  return matchKnownDomain(hostname) !== null;
}

export function isOriginOnKnownDomain(origin?: string | null): boolean {
  if (!origin) return false;

  try {
    const parsed = new URL(origin);
    return isHostnameOnKnownDomain(parsed.hostname);
  } catch {
    return false;
  }
}
