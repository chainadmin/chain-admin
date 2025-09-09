import { useQuery } from "@tanstack/react-query";
import { getAgencySlugFromRequest, isSubdomainSupported } from "@shared/utils/subdomain";
import { useLocation } from "wouter";

export function useAgencyContext() {
  const [location] = useLocation();
  
  // Extract agency slug from current URL
  const agencySlug = getAgencySlugFromRequest(
    window.location.hostname,
    window.location.pathname
  );

  // Fetch agency details if we have a slug
  const { data: agency, isLoading, error } = useQuery({
    queryKey: ['/api/public/agency', agencySlug],
    queryFn: async () => {
      if (!agencySlug) return null;
      
      const response = await fetch(`/api/public/agency/${agencySlug}`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch agency');
      }
      return response.json();
    },
    enabled: !!agencySlug,
    retry: false,
  });

  // Helper to build agency-specific URLs
  const buildAgencyUrl = (path: string): string => {
    if (!agencySlug) return path;
    
    if (isSubdomainSupported()) {
      // In production with custom domain, we're already on the subdomain
      return path;
    } else {
      // In development or Replit, use path-based routing
      return `/${agencySlug}${path}`;
    }
  };

  // Helper to navigate within agency context
  const navigateInAgency = (path: string) => {
    const url = buildAgencyUrl(path);
    window.location.href = url;
  };

  return {
    agencySlug,
    agency,
    isLoading,
    error,
    buildAgencyUrl,
    navigateInAgency,
    isSubdomainSupported: isSubdomainSupported(),
  };
}