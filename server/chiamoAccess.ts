import { getEffectivePhoneEntitlement } from "./phoneProductEntitlement";

/**
 * Chiamo Voice is one bundled phone-system entitlement. When it is off, every
 * calling feature is off; SMS remains an independent add-on.
 */
export async function getChiamoPhoneSystemAccess(tenantId: string) {
  const entitlement = await getEffectivePhoneEntitlement(tenantId);
  return {
    isChiamo: entitlement.owner === "CHIAMO",
    allowed: entitlement.allowed,
    reason: entitlement.status !== "ACTIVE" ? "BILLING_INACTIVE" : entitlement.allowed ? null : "PHONE_SYSTEM_DISABLED",
  };
}
