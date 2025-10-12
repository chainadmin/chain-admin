import { buildTenantUrl } from './domains';
import { ensureBaseUrl } from './baseUrl';

function normalizeCandidate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function getConfiguredPortalUrl(settings: any): string {
  if (!settings || typeof settings !== 'object') {
    return '';
  }

  const candidates = [
    (settings as any)?.customUrl,
    (settings as any)?.portalUrl,
    (settings as any)?.url,
    (settings as any)?.link,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function determineProtocol(baseUrl: string | undefined): 'http://' | 'https://' {
  if (!baseUrl) {
    return 'https://';
  }

  if (baseUrl.startsWith('http://')) {
    return 'http://';
  }

  return 'https://';
}

function sanitizeHost(baseUrl: string | undefined): string {
  if (!baseUrl) {
    return '';
  }

  return baseUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export function resolveConsumerPortalUrl(options: {
  tenantSlug?: string | null;
  consumerPortalSettings?: any;
  baseUrl?: string;
}): string {
  const { tenantSlug, consumerPortalSettings, baseUrl } = options;

  const configuredUrl = getConfiguredPortalUrl(consumerPortalSettings);
  if (configuredUrl) {
    return configuredUrl;
  }

  if (!tenantSlug) {
    return '';
  }

  const ensuredBaseUrl = ensureBaseUrl(baseUrl, tenantSlug ?? undefined);
  const protocol = determineProtocol(ensuredBaseUrl);
  const sanitizedHost = sanitizeHost(ensuredBaseUrl);
  const isLocalhost = sanitizedHost.includes('localhost') || sanitizedHost.includes('127.0.0.1');

  if (isLocalhost && sanitizedHost) {
    return `${protocol}${sanitizedHost}/agency/${tenantSlug}`;
  }

  if (sanitizedHost) {
    const hostParts = sanitizedHost.split('.');
    if (hostParts.length >= 2) {
      hostParts[0] = tenantSlug;
      return `${protocol}${hostParts.join('.')}`;
    }

    return `${protocol}${sanitizedHost}/agency/${tenantSlug}`;
  }

  return buildTenantUrl(tenantSlug);
}
