import { getKnownDomains, matchKnownDomain } from './domains';

export function extractSubdomain(hostname: string): string | null {
  const normalizedHost = hostname.toLowerCase();

  // For development environments
  if (normalizedHost.includes('localhost') || normalizedHost.includes('127.0.0.1')) {
    // Check for subdomain in development (e.g., abc-company.localhost:5000)
    const parts = normalizedHost.split('.');
    if (parts.length > 1 && parts[0] !== 'www') {
      return parts[0].split(':')[0]; // Remove port if present
    }
    // In dev, we can also check for path-based routing as fallback
    return null;
  }

  // For local development preview URLs
  if (normalizedHost.includes('.repl.co') || normalizedHost.includes('.replit.dev') ||
      normalizedHost.includes('.worf.replit.dev') || normalizedHost.includes('replit')) {
    // Ignore all Replit URLs - not used for deployment
    return null;
  }

  // For Vercel preview/deployment URLs - DO NOT treat as agency subdomains
  if (normalizedHost.includes('.vercel.app') || normalizedHost.includes('.vercel.sh')) {
    // Vercel URLs should not be treated as agency subdomains
    return null;
  }

  const matchedDomain = matchKnownDomain(normalizedHost);

  if (matchedDomain) {
    const domainParts = matchedDomain.split('.');
    const hostParts = normalizedHost.split('.');

    if (hostParts.length > domainParts.length) {
      const subdomain = hostParts[hostParts.length - domainParts.length - 1];
      if (subdomain && subdomain !== 'www') {
        return subdomain;
      }
    }
  }

  return null;
}

export function getAgencySlugFromRequest(
  hostname: string | undefined,
  pathname: string
): string | null {
  if (!hostname) return null;

  // First try to get from subdomain
  const subdomain = extractSubdomain(hostname);
  if (subdomain) {
    return subdomain;
  }

  // Allow path-based routing for development environments (localhost, Replit, and Railway)
  // TEMPORARILY allow path-based routing on production domain for testing
  const normalizedHost = hostname.toLowerCase();

  const isDevEnvironment = normalizedHost.includes('localhost') ||
                          normalizedHost.includes('127.0.0.1') ||
                          normalizedHost.includes('.repl.co') ||
                          normalizedHost.includes('.replit.dev') ||
                          normalizedHost.includes('.worf.replit.dev') ||
                          normalizedHost.includes('.up.railway.app') ||
                          matchKnownDomain(normalizedHost) !== null; // TEMPORARY: Enable path-based routing on production
  
  if (!isDevEnvironment) {
    return null;
  }

  // Only use path-based routing for development
  // Check if path starts with an agency slug pattern
  const pathParts = pathname.split('/').filter(Boolean);
  
  // Pattern: /agency-slug/dashboard or /agency-slug/consumer/...
  // Must have at least 2 parts for agency routing (e.g., /abc-company/dashboard)
  if (pathParts.length >= 2) {
    const potentialSlug = pathParts[0];
    // Basic validation - agency slugs are lowercase with hyphens
    if (/^[a-z0-9-]+$/.test(potentialSlug)) {
      // Check if this looks like a known route (not an agency slug)
      const knownRoutes = [
        'api', 'admin', 'login', 'register', 'agency-login', 'agency-register',
        'consumer-login', 'consumer-register', 'privacy-policy', 'assets', 'src',
        'admin-dashboard', 'consumers', 'accounts', 'communications', 'payments',
        'billing', 'company', 'settings'
      ];
      
      if (!knownRoutes.includes(potentialSlug)) {
        return potentialSlug;
      }
    }
  }

  return null;
}

export function buildAgencyUrl(
  agencySlug: string,
  path: string,
  baseUrl?: string
): string {
  // TEMPORARILY: Always use path-based routing (even on production)
  // This allows chainsoftwaregroup.com/tenant-slug to work while DNS is being fixed
  return `/${agencySlug}${path}`;
  
  // Original subdomain logic (commented out temporarily)
  /*
  if (baseUrl && !baseUrl.includes('localhost') && !baseUrl.includes('repl') && !baseUrl.includes('.up.railway.app')) {
    const url = new URL(baseUrl);
    const parts = url.hostname.split('.');
    if (parts.length >= 2) {
      if (parts.length === 2) {
        url.hostname = `${agencySlug}.${url.hostname}`;
      } else {
        parts[0] = agencySlug;
        url.hostname = parts.join('.');
      }
    }
    url.pathname = path;
    return url.toString();
  }
  return `/${agencySlug}${path}`;
  */
}

export function isSubdomainSupported(): boolean {
  // Check if we're in an environment that supports subdomains
  const globalWindow = (globalThis as { window?: { location: { hostname: string } } }).window;

  if (!globalWindow) {
    return false;
  }

  const hostname = globalWindow.location.hostname.toLowerCase();
  const productionDomains = getKnownDomains();

  // Subdomain support is ONLY available on the actual production domains
  // Not on localhost, Replit, Railway, or any other hosting platform
  if (hostname.includes('.up.railway.app')) {
    return false; // Railway uses path-based routing for testing
  }

  return productionDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}
