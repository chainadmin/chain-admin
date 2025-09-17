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

  // For Replit preview URLs (*.repl.co or *.replit.dev)
  if (hostname.includes('.repl.co') || hostname.includes('.replit.dev')) {
    // Check if we have a subdomain-like prefix in Replit URL
    // e.g., waypoint-solutions-d78b0a8b-f33c-4616-a4c9-a60daecc4e66.replit.dev
    const parts = hostname.split('.');
    const firstPart = parts[0];
    
    // Check if first part contains the Replit workspace ID pattern
    if (firstPart && firstPart.includes('-')) {
      // Look for agency slug at the beginning (before the Replit ID)
      const segments = firstPart.split('-');
      
      // If we have more than 5 segments, it likely includes an agency slug
      // Pattern: agency-slug-replit-workspace-id
      if (segments.length > 5) {
        // Try to extract agency slug (everything before the UUID-like pattern)
        // UUID pattern typically has 5 groups of alphanumeric characters
        const potentialUuidStart = segments.length - 5;
        const potentialSlug = segments.slice(0, potentialUuidStart).join('-');
        
        // Basic validation - agency slugs should be reasonable length
        if (potentialSlug && potentialSlug.length > 2 && potentialSlug.length < 50) {
          return potentialSlug;
        }
      }
    }
    
    // Fall back to null for standard Replit URLs
    return null;
  }

  // For Vercel preview/deployment URLs - DO NOT treat as agency subdomains
  if (hostname.includes('.vercel.app') || hostname.includes('.vercel.sh')) {
    // Vercel URLs should not be treated as agency subdomains
    return null;
  }

  // For production (ONLY on custom domain)
  // Example: abc-company.chainsoftwaregroup.com
  // Only process subdomains on the actual production domain
  if (hostname.includes('chainsoftwaregroup.com')) {
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

  // For production without subdomain, don't try path-based detection
  // This prevents the root domain from being treated as an agency
  if (!hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
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
  // If we have a base URL with subdomain support (production)
  if (baseUrl && !baseUrl.includes('localhost') && !baseUrl.includes('repl')) {
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

  // Fallback to path-based routing (development/Replit)
  return `/${agencySlug}${path}`;
}

export function isSubdomainSupported(): boolean {
  // Check if we're in an environment that supports subdomains
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  
  // Subdomain support is ONLY available on the actual production domain
  // Not on localhost, Replit, Vercel, or any other hosting platform
  return hostname.includes('chainsoftwaregroup.com');
}