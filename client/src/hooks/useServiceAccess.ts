import { useQuery } from "@tanstack/react-query";

interface TenantSettings {
  emailServiceEnabled?: boolean;
  smsServiceEnabled?: boolean;
  paymentProcessingEnabled?: boolean;
  portalAccessEnabled?: boolean;
}

interface ServiceAccessFlags {
  emailServiceEnabled: boolean;
  smsServiceEnabled: boolean;
  paymentProcessingEnabled: boolean;
  portalAccessEnabled: boolean;
  isLoading: boolean;
}

export function useServiceAccess(): ServiceAccessFlags {
  const { data: settings, isLoading } = useQuery<TenantSettings>({
    queryKey: ["/api/settings"],
    retry: false,
  });

  return {
    emailServiceEnabled: settings?.emailServiceEnabled ?? true,
    smsServiceEnabled: settings?.smsServiceEnabled ?? true,
    paymentProcessingEnabled: settings?.paymentProcessingEnabled ?? true,
    portalAccessEnabled: settings?.portalAccessEnabled ?? true,
    isLoading,
  };
}
