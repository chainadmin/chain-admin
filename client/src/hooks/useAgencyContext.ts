import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAgencySlugFromRequest, isSubdomainSupported } from "@shared/utils/subdomain";
import { useLocation } from "wouter";
import { getStoredTenantSlug, persistTenantMetadata } from "@/lib/cookies";

export function useAgencyContext() {
  const [location] = useLocation();
  const subdomainSupported = useMemo(() => isSubdomainSupported(), []);

  const [agencySlug, setAgencySlug] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;

    const slugFromUrl = getAgencySlugFromRequest(
      window.location.hostname,
      window.location.pathname
    );

    if (slugFromUrl) {
      persistTenantMetadata({ slug: slugFromUrl });
      return slugFromUrl;
    }

    return getStoredTenantSlug();
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const slugFromUrl = getAgencySlugFromRequest(
      window.location.hostname,
      window.location.pathname
    );

    if (slugFromUrl) {
      persistTenantMetadata({ slug: slugFromUrl });
      setAgencySlug((current) => (current === slugFromUrl ? current : slugFromUrl));
      return;
    }

    const storedSlug = getStoredTenantSlug();
    setAgencySlug((current) => (current === storedSlug ? current : storedSlug));
  }, [location]);

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

    if (subdomainSupported) {
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
    isSubdomainSupported: subdomainSupported,
  };
}
