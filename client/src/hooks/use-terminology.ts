import { useQuery } from '@tanstack/react-query';
import { getTerminology, type BusinessType, type TerminologyMap } from '@shared/terminology';

interface TenantSettings {
  businessType?: string;
  [key: string]: any;
}

/**
 * Hook to get current tenant's business type and terminology
 * Falls back to 'call_center' if tenant info is not available
 */
export function useTerminology(): TerminologyMap {
  // Fetch tenant settings which includes businessType
  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['/api/settings'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const businessType = (settings?.businessType as BusinessType) || 'call_center';
  
  return getTerminology(businessType);
}

/**
 * Hook to get a specific term based on current tenant's business type
 */
export function useTerm(key: keyof TerminologyMap): string {
  const terminology = useTerminology();
  return terminology[key];
}
