export function extractSubdomain(hostname: string): string | null {
  // For development environments
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    // Check for subdomain in development (e.g., abc-company.localhost:5000)
    const parts = hostname.split('.');
    if (parts.length > 1 && parts[0] !== 'www') {
      return parts[0].split(':')[0]; // Remove port if present
    }
    // In dev, we can also check for path-based routing as fallback
    return null;
  }

  // For local development preview URLs
  if (hostname.includes('.repl.co') || hostname.includes('.replit.dev') || 
      hostname.includes('.worf.replit.dev') || hostname.includes('replit')) {
    // Ignore all Replit URLs - not used for deployment
    return null;
  }

  // For Vercel preview/deployment URLs - DO NOT treat as agency subdomains
  if (hostname.includes('.vercel.app') || hostname.includes('.vercel.sh')) {
    // Vercel URLs should not be treated as agency subdomains
    return null;
  }

  // For production (ONLY on custom domain)
  // Example: abc-company.yourdomain.com
  // Replace 'yourdomain.com' with your actual domain
  const productionDomain = 'chainsoftwaregroup.com'; // TODO: Update this to your domain (e.g., 'chain.com')
  
  if (hostname.includes(productionDomain)) {
    const parts = hostname.split('.');
    
    // Must have at least 3 parts for subdomain.domain.tld
    if (parts.length >= 3) {
      const subdomain = parts[0];
      
      // Ignore www
      if (subdomain === 'www') {
        return null;
      }
      
      return subdomain;
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
  // For production without subdomain, don't try path-based detection
  const isDevEnvironment = hostname.includes('localhost') || 
                          hostname.includes('127.0.0.1') ||
                          hostname.includes('.repl.co') || 
                          hostname.includes('.replit.dev') || 
                          hostname.includes('.worf.replit.dev') ||
                          hostname.includes('.up.railway.app'); // Enable path-based routing on Railway for testing
  
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
  // If we have a base URL with subdomain support (production only - not Railway)
  if (baseUrl && !baseUrl.includes('localhost') && !baseUrl.includes('repl') && !baseUrl.includes('.up.railway.app')) {
    const url = new URL(baseUrl);
    // Replace or add subdomain
    const parts = url.hostname.split('.');
    if (parts.length >= 2) {
      // Replace existing subdomain or add new one
      if (parts.length === 2) {
        // domain.com -> agency.domain.com
        url.hostname = `${agencySlug}.${url.hostname}`;
      } else {
        // xxx.domain.com -> agency.domain.com
        parts[0] = agencySlug;
        url.hostname = parts.join('.');
      }
    }
    url.pathname = path;
    return url.toString();
  }

  // Fallback to path-based routing (development/Replit/Railway)
  return `/${agencySlug}${path}`;
}

export function isSubdomainSupported(): boolean {
  // Check if we're in an environment that supports subdomains
  const globalWindow = (globalThis as { window?: { location: { hostname: string } } }).window;

  if (!globalWindow) {
    return false;
  }

  const hostname = globalWindow.location.hostname;
  const productionDomain = 'chainsoftwaregroup.com'; // TODO: Update this to your domain
  
  // Subdomain support is ONLY available on the actual production domain
  // Not on localhost, Replit, Railway, or any other hosting platform
  if (hostname.includes('.up.railway.app')) {
    return false; // Railway uses path-based routing for testing
  }
  
  return hostname.includes(productionDomain);
}