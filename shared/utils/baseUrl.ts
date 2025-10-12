import { buildTenantUrl, getPreferredDomain, getKnownDomains, matchKnownDomain } from './domains';

function sanitizeUrl(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/$/, '') || null;
  }
}

function sanitizeHost(value?: string | null): string | null {
  if (!value) return null;
  const primary = value.split(',')[0]?.trim();
  return primary || null;
}

function sanitizeProtocol(value?: string | null, host?: string | null): 'http' | 'https' {
  const normalized = value?.split(',')[0]?.trim().toLowerCase();

  if (normalized === 'http' || normalized === 'https') {
    return normalized;
  }

  if (host && (host.includes('localhost') || host.includes('127.0.0.1'))) {
    return 'http';
  }

  return 'https';
}

function ensureTenantHost(host: string, tenantSlug?: string | null): string {
  if (!tenantSlug) {
    return host;
  }

  const hostWithoutPort = host.split(':')[0];
  const port = host.includes(':') ? host.slice(hostWithoutPort.length) : '';
  const matchedDomain = matchKnownDomain(hostWithoutPort);

  if (!matchedDomain) {
    return host;
  }

  if (hostWithoutPort === matchedDomain || hostWithoutPort === `www.${matchedDomain}`) {
    return `${tenantSlug}.${matchedDomain}${port}`;
  }

  return host;
}

export interface ResolveBaseUrlOptions {
  origin?: string;
  forwardedHost?: string | string[];
  host?: string;
  forwardedProto?: string | string[];
  protocol?: string;
  publicBaseUrl?: string;
  tenantSlug?: string | null;
}

export function ensureBaseUrl(baseUrl: string | undefined, tenantSlug?: string | null): string {
  const sanitized = sanitizeUrl(baseUrl);
  if (sanitized) {
    return sanitized;
  }

  if (tenantSlug) {
    return buildTenantUrl(tenantSlug);
  }

  return `https://${getPreferredDomain()}`;
}

export function resolveBaseUrl(options: ResolveBaseUrlOptions): string {
  const {
    origin,
    forwardedHost,
    host,
    forwardedProto,
    protocol,
    publicBaseUrl,
    tenantSlug,
  } = options;

  const sanitizedOrigin = sanitizeUrl(origin);
  if (sanitizedOrigin) {
    return sanitizedOrigin;
  }

  const sanitizedPublic = sanitizeUrl(publicBaseUrl);
  if (sanitizedPublic) {
    return sanitizedPublic;
  }

  const candidateHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || host;

  const sanitizedHost = sanitizeHost(candidateHost);
  const resolvedProtocol = sanitizeProtocol(
    Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || protocol,
    sanitizedHost
  );

  if (sanitizedHost) {
    const hostWithTenant = ensureTenantHost(sanitizedHost, tenantSlug);
    return `${resolvedProtocol}://${hostWithTenant}`.replace(/\/$/, '');
  }

  if (tenantSlug) {
    return buildTenantUrl(tenantSlug, resolvedProtocol);
  }

  return `${resolvedProtocol}://${getPreferredDomain()}`;
}

export function buildDownloadUrl(baseUrl: string): string {
  const sanitized = sanitizeUrl(baseUrl) || baseUrl;
  return `${sanitized}/download`.replace(/\/+$|\/+download$/i, '/download');
}

export function getKnownDomainOrigins(): string[] {
  return getKnownDomains().reduce<string[]>((acc, domain) => {
    acc.push(`https://${domain}`);
    acc.push(`https://www.${domain}`);
    return acc;
  }, []);
}
