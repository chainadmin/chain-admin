import { eq } from "drizzle-orm";
import { db } from "./db";
import { tenants } from "@shared/schema";
import { chiamoServiceConfigurations, chiamoSubscriptions } from "@shared/chiamo-schema";

/**
 * Chiamo Voice is one bundled phone-system entitlement. When it is off, every
 * calling feature is off; SMS remains an independent add-on.
 */
export async function getChiamoPhoneSystemAccess(tenantId: string) {
  const [row] = await db.select({
    isChiamo: tenants.chiamoConnectEnabled,
    sharedVoiceEnabled: tenants.voipEnabled,
    accountActive: chiamoServiceConfigurations.accountActive,
    phoneSystemEnabled: chiamoServiceConfigurations.voiceEnabled,
    billingStatus: chiamoSubscriptions.billingStatus,
  }).from(tenants)
    .leftJoin(chiamoServiceConfigurations, eq(chiamoServiceConfigurations.tenantId, tenants.id))
    .leftJoin(chiamoSubscriptions, eq(chiamoSubscriptions.tenantId, tenants.id))
    .where(eq(tenants.id, tenantId)).limit(1);

  if (!row?.isChiamo) return { isChiamo: false, allowed: row?.sharedVoiceEnabled !== false, reason: null };
  if (row.billingStatus !== "ACTIVE") return { isChiamo: true, allowed: false, reason: "BILLING_INACTIVE" };
  if (!row.accountActive || !row.phoneSystemEnabled || !row.sharedVoiceEnabled) {
    return { isChiamo: true, allowed: false, reason: "PHONE_SYSTEM_DISABLED" };
  }
  return { isChiamo: true, allowed: true, reason: null };
}
