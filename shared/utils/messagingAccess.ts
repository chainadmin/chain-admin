export type MessagingService = 'email' | 'sms';

export function getCompanyMessagingBlockMessage(
  service: MessagingService,
  tenant: { isTrialAccount?: boolean | null; emailServiceEnabled?: boolean | null; smsServiceEnabled?: boolean | null },
): string | null {
  const label = service === 'email' ? 'Email' : 'SMS';
  if (tenant.isTrialAccount) {
    return `${label} service is not available during trial period. Please upgrade to a paid plan to access this feature.`;
  }
  const enabled = service === 'email' ? tenant.emailServiceEnabled : tenant.smsServiceEnabled;
  if (enabled === false) {
    return `${label} service is disabled for your account. Please contact support.`;
  }
  return null;
}

export function isServiceRestrictedForMember(
  service: string,
  role: string | null | undefined,
  restrictedServices: unknown,
): boolean {
  if (role === 'owner' || role === 'platform_admin') return false;
  return Array.isArray(restrictedServices) && restrictedServices.includes(service);
}