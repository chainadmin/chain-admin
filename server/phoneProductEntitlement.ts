import { eq, or, sql } from "drizzle-orm";
import { db } from "./db";
import { phoneProductEntitlements, tenants, type PhoneProductEntitlement } from "@shared/schema";
import { chiamoServiceConfigurations, chiamoSubscriptions } from "@shared/chiamo-schema";
import {
  canUseLegacyChainPhoneControls,
  isChainPhoneEntitlementBillable,
  isPhoneEntitlementBillable,
  legacyPhoneBillingOwner,
  lifecycleFromChiamoBillingStatus,
  resolveChiamoPhoneState,
  type PhoneBillingOwner as RulePhoneBillingOwner,
  type PhoneProductLifecycleStatus,
} from "./phoneProductEntitlementRules";
import {
  classifyCanonicalTenantCandidates,
  companyIdentityLockKeys,
  normalizeCompanyEmail,
  normalizeCompanyName,
} from "./phoneProductIdentity";

export { normalizeCompanyEmail, normalizeCompanyName } from "./phoneProductIdentity";

export type PhoneBillingOwner = "CHAIN" | "CHIAMO";
export type PhoneEntitlementStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED";

// Drizzle transactions intentionally omit the database client's `$client`;
// both database and transaction expose this query surface.
type DbSession = any;

/**
 * A tenant match is deliberately conservative.  An email-only or name-only
 * match is not safe to merge, and is returned to the caller for manual review.
 */
export async function findCanonicalTenant(
  tx: DbSession,
  email: string,
  businessName: string,
): Promise<{ tenant?: typeof tenants.$inferSelect; reason?: "AMBIGUOUS" | "MISMATCH" }> {
  const normalizedEmail = normalizeCompanyEmail(email);
  const normalizedName = normalizeCompanyName(businessName);
  const candidates = await tx.select().from(tenants).where(or(
    sql`lower(trim(${tenants.email})) = ${normalizedEmail}`,
    sql`lower(regexp_replace(trim(coalesce(${tenants.businessName}, ${tenants.name})), '[[:space:]]+', ' ', 'g')) = ${normalizedName}`,
  ));
  return classifyCanonicalTenantCandidates(candidates, normalizedEmail, normalizedName);
}

/** Serialize cross-product identity mutations without a schema migration. */
export async function lockCompanyIdentity(tx: DbSession, email: string, businessName: string) {
  // Lock email and name independently so concurrent requests with the same
  // email but conflicting names (or vice versa) cannot create two tenants.
  for (const key of companyIdentityLockKeys(email, businessName)) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
  }
}

export type EffectivePhoneProductEntitlement = Pick<
  PhoneProductEntitlement,
  "tenantId" | "billingOwner" | "lifecycleStatus" | "enabled" | "source" | "effectiveAt" | "disabledAt"
> & { isLegacyFallback: boolean };

export async function getEffectivePhoneProductEntitlement(
  tenantId: string,
): Promise<EffectivePhoneProductEntitlement | null> {
  const [stored] = await db.select().from(phoneProductEntitlements)
    .where(eq(phoneProductEntitlements.tenantId, tenantId)).limit(1);
  if (stored) return { ...stored, isLegacyFallback: false };

  const [legacy] = await db.select({
    tenantId: tenants.id,
    voipEnabled: tenants.voipEnabled,
    chiamoSubscriptionTenantId: chiamoSubscriptions.tenantId,
    billingStatus: chiamoSubscriptions.billingStatus,
    accountActive: chiamoServiceConfigurations.accountActive,
    voiceEnabled: chiamoServiceConfigurations.voiceEnabled,
  }).from(tenants)
    .leftJoin(chiamoSubscriptions, eq(chiamoSubscriptions.tenantId, tenants.id))
    .leftJoin(chiamoServiceConfigurations, eq(chiamoServiceConfigurations.tenantId, tenants.id))
    .where(eq(tenants.id, tenantId)).limit(1);
  if (!legacy) return null;

  const hasChiamoSubscription = legacy.chiamoSubscriptionTenantId !== null;
  const billingOwner = legacyPhoneBillingOwner(hasChiamoSubscription);
  const lifecycleStatus = hasChiamoSubscription
    ? lifecycleFromChiamoBillingStatus(legacy.billingStatus)
    : legacy.voipEnabled === true ? "ACTIVE" : "SUSPENDED";
  const enabled = hasChiamoSubscription
    ? legacy.voipEnabled && legacy.accountActive === true && legacy.voiceEnabled === true
    : legacy.voipEnabled === true;
  const effectiveEnabled = lifecycleStatus === "ACTIVE" && enabled;
  return {
    tenantId,
    billingOwner,
    lifecycleStatus,
    enabled: !!enabled,
    source: hasChiamoSubscription ? "CHIAMO" : "CHAIN",
    effectiveAt: new Date(0),
    disabledAt: effectiveEnabled ? null : new Date(0),
    isLegacyFallback: true,
  };
}

/** Compatibility projection for callers which have not moved to the schema. */
export async function getEffectivePhoneEntitlement(tenantId: string): Promise<{
  owner: PhoneBillingOwner;
  status: PhoneEntitlementStatus;
  allowed: boolean;
}> {
  const entitlement = await getEffectivePhoneProductEntitlement(tenantId);
  if (!entitlement) return { owner: "CHAIN", status: "SUSPENDED", allowed: false };
  return {
    owner: entitlement.billingOwner,
    status: entitlement.lifecycleStatus,
    allowed: isPhoneEntitlementBillable(entitlement),
  };
}

export async function isChainPhoneBillingEligible(tenantId: string) {
  return isLegacyChainVoiceBillable(tenantId);
}

export class PhoneProductOwnershipConflictError extends Error {
  constructor() {
    super("Phone service is billed through Chiamo Connect and cannot be changed through the legacy Chain billing control.");
    this.name = "PhoneProductOwnershipConflictError";
  }
}

/**
 * Atomically updates the legacy Chain lifecycle while refusing to take billing
 * ownership away from Chiamo.
 */
export async function setChainPhoneEntitlement(
  tx: DbSession,
  tenantId: string,
  enabled: boolean,
): Promise<PhoneProductEntitlement> {
  const [tenant] = await tx.select().from(tenants)
    .where(eq(tenants.id, tenantId)).for("update");
  if (!tenant) throw new Error("Tenant not found");

  const [current] = await tx.select().from(phoneProductEntitlements)
    .where(eq(phoneProductEntitlements.tenantId, tenantId)).limit(1);
  const [chiamoSubscription] = await tx.select({ tenantId: chiamoSubscriptions.tenantId })
    .from(chiamoSubscriptions).where(eq(chiamoSubscriptions.tenantId, tenantId)).limit(1);
  const effectiveOwner: PhoneBillingOwner = current?.billingOwner
    ?? (chiamoSubscription ? "CHIAMO" : "CHAIN");
  if (!canUseLegacyChainPhoneControls(effectiveOwner)) {
    throw new PhoneProductOwnershipConflictError();
  }

  const lifecycleStatus: PhoneEntitlementStatus = enabled ? "ACTIVE" : "SUSPENDED";
  const now = new Date();
  const changed = !current
    || current.billingOwner !== "CHAIN"
    || current.lifecycleStatus !== lifecycleStatus
    || current.enabled !== enabled
    || current.source !== "CHAIN";
  let saved = current;
  if (!current) {
    [saved] = await tx.insert(phoneProductEntitlements).values({
      tenantId,
      billingOwner: "CHAIN",
      lifecycleStatus,
      enabled,
      source: "CHAIN",
      effectiveAt: now,
      disabledAt: enabled ? null : now,
      updatedAt: now,
    }).returning();
  } else if (changed) {
    [saved] = await tx.update(phoneProductEntitlements).set({
      billingOwner: "CHAIN",
      lifecycleStatus,
      enabled,
      source: "CHAIN",
      effectiveAt: now,
      disabledAt: enabled ? null : now,
      updatedAt: now,
    }).where(eq(phoneProductEntitlements.tenantId, tenantId)).returning();
  }

  await tx.update(tenants).set({ voipEnabled: enabled }).where(eq(tenants.id, tenantId));
  if (!saved) throw new Error("Phone entitlement could not be saved");
  return saved;
}

export type PhoneProductEntitlementUpsert = {
  billingOwner: RulePhoneBillingOwner;
  lifecycleStatus: PhoneProductLifecycleStatus;
  enabled: boolean;
  source: "LEGACY_BACKFILL" | "CHAIN" | "CHIAMO" | "BILLING" | "MANUAL";
  effectiveAt?: Date;
  disabledAt?: Date | null;
};

/**
 * Repeated lifecycle events with identical effective values preserve the audit
 * timestamps, so webhook and billing retries are safe.
 */
export async function upsertPhoneProductEntitlement(
  tenantId: string,
  input: PhoneProductEntitlementUpsert,
): Promise<PhoneProductEntitlement> {
  return db.transaction(async tx => {
    const [tenant] = await tx.select({ id: tenants.id }).from(tenants)
      .where(eq(tenants.id, tenantId)).for("update");
    if (!tenant) throw new Error("Tenant not found");

    const [current] = await tx.select().from(phoneProductEntitlements)
      .where(eq(phoneProductEntitlements.tenantId, tenantId)).limit(1);
    const now = new Date();
    const effectiveAt = input.effectiveAt ?? current?.effectiveAt ?? now;
    const disabledAt = input.disabledAt === undefined
      ? (input.enabled && input.lifecycleStatus === "ACTIVE" ? null : current?.disabledAt ?? now)
      : input.disabledAt;

    if (current
      && current.billingOwner === input.billingOwner
      && current.lifecycleStatus === input.lifecycleStatus
      && current.enabled === input.enabled
      && current.source === input.source
      && current.effectiveAt.getTime() === effectiveAt.getTime()
      && (current.disabledAt?.getTime() ?? null) === (disabledAt?.getTime() ?? null)) {
      return current;
    }

    const [saved] = await tx.insert(phoneProductEntitlements).values({
      tenantId, ...input, effectiveAt, disabledAt, updatedAt: now,
    }).onConflictDoUpdate({
      target: phoneProductEntitlements.tenantId,
      set: {
        billingOwner: input.billingOwner,
        lifecycleStatus: input.lifecycleStatus,
        enabled: input.enabled,
        source: input.source,
        effectiveAt,
        disabledAt,
        updatedAt: now,
      },
    }).returning();
    return saved;
  });
}

export async function isLegacyChainVoiceBillable(tenantId: string): Promise<boolean> {
  const entitlement = await getEffectivePhoneProductEntitlement(tenantId);
  return entitlement !== null && isChainPhoneEntitlementBillable(entitlement);
}

export type PhoneProductManualReviewRecord = {
  tenantId: string;
  tenantEmail: string | null;
  issue: "DUAL_ENABLED" | "MISSING_ENTITLEMENT" | "AMBIGUOUS_EMAIL" | "BILLING_OWNER_MISMATCH";
  detail: string;
};

/**
 * Read-only inventory. Duplicate emails remain separate records and are never
 * used to associate or merge tenants.
 */
export async function inventoryPhoneProductManualReview(): Promise<PhoneProductManualReviewRecord[]> {
  const rows = await db.select({
    tenantId: tenants.id,
    tenantEmail: tenants.email,
    voipEnabled: tenants.voipEnabled,
    chiamoEnabled: tenants.chiamoConnectEnabled,
    chiamoSubscriptionTenantId: chiamoSubscriptions.tenantId,
    entitlementTenantId: phoneProductEntitlements.tenantId,
    entitlementBillingOwner: phoneProductEntitlements.billingOwner,
  }).from(tenants)
    .leftJoin(chiamoSubscriptions, eq(chiamoSubscriptions.tenantId, tenants.id))
    .leftJoin(phoneProductEntitlements, eq(phoneProductEntitlements.tenantId, tenants.id));

  const records: PhoneProductManualReviewRecord[] = [];
  const emails = new Map<string, Array<{ tenantId: string; tenantEmail: string | null }>>();
  for (const row of rows) {
    const hasChiamo = row.chiamoEnabled || row.chiamoSubscriptionTenantId !== null;
    if (row.voipEnabled && hasChiamo) {
      records.push({ tenantId: row.tenantId, tenantEmail: row.tenantEmail, issue: "DUAL_ENABLED", detail: "Legacy Voice and Chiamo are both enabled." });
    }
    if ((row.voipEnabled || hasChiamo) && row.entitlementTenantId === null) {
      records.push({ tenantId: row.tenantId, tenantEmail: row.tenantEmail, issue: "MISSING_ENTITLEMENT", detail: "Phone product is configured without an entitlement row." });
    }
    if (row.chiamoSubscriptionTenantId !== null && row.entitlementBillingOwner === "CHAIN") {
      records.push({ tenantId: row.tenantId, tenantEmail: row.tenantEmail, issue: "BILLING_OWNER_MISMATCH", detail: "A Chiamo subscription exists but the legacy Chain billing path owns the phone entitlement." });
    }
    const email = row.tenantEmail?.trim().toLowerCase();
    if (email) {
      const matches = emails.get(email) ?? [];
      matches.push({ tenantId: row.tenantId, tenantEmail: row.tenantEmail });
      emails.set(email, matches);
    }
  }
  for (const matches of Array.from(emails.values())) {
    if (matches.length > 1) {
      for (const tenant of matches) {
        records.push({ tenantId: tenant.tenantId, tenantEmail: tenant.tenantEmail, issue: "AMBIGUOUS_EMAIL", detail: "This normalized email belongs to multiple tenants; no tenants were merged." });
      }
    }
  }
  return records;
}

/**
 * Mirrors the effective Chiamo lifecycle to legacy flags until the legacy
 * consumers can be removed.  Call this inside the mutation transaction.
 */
export async function upsertChiamoPhoneEntitlement(
  tx: DbSession,
  tenantId: string,
  status: PhoneEntitlementStatus,
  requestedVoiceEnabled?: boolean,
  requestedAccountActive?: boolean,
) {
  const [tenant] = await tx.select({ id: tenants.id }).from(tenants)
    .where(eq(tenants.id, tenantId)).for("update");
  if (!tenant) throw new Error("Tenant not found");
  const [currentEntitlement] = await tx.select().from(phoneProductEntitlements)
    .where(eq(phoneProductEntitlements.tenantId, tenantId)).limit(1);
  const [currentService] = await tx.select().from(chiamoServiceConfigurations)
    .where(eq(chiamoServiceConfigurations.tenantId, tenantId)).limit(1);
  // Keep the desired entitlement enabled through billing suspension so an
  // ACTIVE retry/reactivation restores service without manual re-provisioning.
  const {
    voiceConfigured,
    entitlementEnabled: enabled,
    operationalAccountActive,
    allowed,
  } = resolveChiamoPhoneState({
    lifecycleStatus: status,
    currentEntitlementEnabled: currentEntitlement?.enabled,
    currentServiceVoiceEnabled: currentService?.voiceEnabled,
    currentServiceAccountActive: currentService?.accountActive,
    requestedVoiceEnabled,
    requestedAccountActive,
  });
  const now = new Date();
  const entitlementChanged = !currentEntitlement
    || currentEntitlement.billingOwner !== "CHIAMO"
    || currentEntitlement.lifecycleStatus !== status
    || currentEntitlement.enabled !== enabled
    || currentEntitlement.source !== "CHIAMO";

  if (!currentEntitlement) {
    await tx.insert(phoneProductEntitlements).values({
      tenantId,
      billingOwner: "CHIAMO",
      lifecycleStatus: status,
      enabled,
      source: "CHIAMO",
      effectiveAt: now,
      disabledAt: allowed ? null : now,
      updatedAt: now,
    });
  } else if (entitlementChanged) {
    await tx.update(phoneProductEntitlements).set({
      billingOwner: "CHIAMO",
      lifecycleStatus: status,
      enabled,
      source: "CHIAMO",
      effectiveAt: now,
      disabledAt: allowed ? null : now,
      updatedAt: now,
    }).where(eq(phoneProductEntitlements.tenantId, tenantId));
  }

  await tx.update(tenants).set({
    chiamoConnectEnabled: true,
    voipEnabled: voiceConfigured,
  }).where(eq(tenants.id, tenantId));
  await tx.insert(chiamoServiceConfigurations).values({
    tenantId, accountActive: operationalAccountActive, voiceEnabled: voiceConfigured,
    inboundEnabled: voiceConfigured, outboundEnabled: voiceConfigured, recordingEnabled: voiceConfigured,
    voicemailEnabled: voiceConfigured, routingEnabled: voiceConfigured, ivrEnabled: voiceConfigured,
  }).onConflictDoUpdate({ target: chiamoServiceConfigurations.tenantId, set: {
    accountActive: operationalAccountActive, voiceEnabled: voiceConfigured, inboundEnabled: voiceConfigured,
    outboundEnabled: voiceConfigured, recordingEnabled: voiceConfigured, voicemailEnabled: voiceConfigured,
    routingEnabled: voiceConfigured, ivrEnabled: voiceConfigured, updatedAt: now,
  } });
}

/** Read-only inventory for an admin reconciliation workflow; it never mutates. */
export async function getPhoneBillingReconciliationInventory() {
  return inventoryPhoneProductManualReview();
}