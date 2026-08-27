import { buildTenantVoiceIdentity } from './twilioVoiceService';

export function canUseSoftphone(user: {
  isActive?: boolean | null;
  role?: string | null;
  voipAccess?: boolean | null;
} | null | undefined): boolean {
  return user?.isActive !== false
    && (user?.role === 'owner' || user?.role === 'manager' || user?.voipAccess === true);
}

export function isVoiceCallOwnedByUser(
  tenantId: string,
  userId: string,
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  const expectedIdentity = buildTenantVoiceIdentity(tenantId, userId);
  return [from, to]
    .map(value => String(value || '').replace(/^client:/, ''))
    .includes(expectedIdentity);
}