import { and, eq, sql } from "drizzle-orm";
import { chiamoPlans } from "@shared/chiamo";
import { chiamoServiceConfigurations, chiamoSubscriptions } from "@shared/chiamo-schema";
import { tenants, voipPhoneNumbers } from "@shared/schema";
import { db } from "./db";
import { getCompanyTwilioClient, resolveCompanyTwilioAccount } from "./companyTwilioService";
import { extractAreaCode, formatPhoneE164, isTollFreeNumber, type AvailablePhoneNumber } from "./twilioVoiceService";
import { lockChiamoOnlyTenant } from "./phoneProductEntitlement";

export type ChiamoNumberProvider = {
  searchLocal(tenantId: string, areaCode: string, limit: number): Promise<AvailablePhoneNumber[]>;
  searchTollFree(tenantId: string, limit: number): Promise<AvailablePhoneNumber[]>;
  findOwned(tenantId: string, phoneNumber: string): Promise<{ sid: string; phoneNumber: string; subaccountSid: string } | null>;
  purchaseVoice(tenantId: string, phoneNumber: string): Promise<{ sid: string; phoneNumber: string; subaccountSid: string }>;
};

export function safeChiamoNumberProviderError(error: unknown) {
  const value: any = error;
  const ambiguous = value?.code === "ETIMEDOUT" || value?.code === "ECONNRESET" || value?.status === 408 || value?.status === 504
    || /timeout|timed out|connection reset/i.test(value?.message || "");
  return Object.assign(new Error(ambiguous
    ? "The number provider response was uncertain. This request is safely paused while ownership is reconciled."
    : "The number provider could not complete the request. Try again later."), {
    status: ambiguous ? 202 : 502,
    code: ambiguous ? "NUMBER_PROVIDER_RESULT_UNKNOWN" : "NUMBER_PROVIDER_ERROR",
    ambiguous,
  });
}

export function assertMappedChiamoSubaccount(tenantId: string, mappedSid: string | null | undefined, resolvedSid: string, masterSid?: string) {
  if (!mappedSid || mappedSid !== resolvedSid) {
    throw Object.assign(new Error("The Chiamo company provider mapping is missing or inconsistent."), { status: 409, code: "CHIAMO_PROVIDER_MAPPING_REQUIRED" });
  }
  if (!/^AC[a-fA-F0-9]{32}$/.test(mappedSid)) {
    throw Object.assign(new Error("The Chiamo company provider mapping is invalid."), { status: 409, code: "CHIAMO_PROVIDER_MAPPING_INVALID" });
  }
  if (masterSid && mappedSid === masterSid) {
    throw Object.assign(new Error("The Chiamo company mapping must use a company subaccount, not the provider master account."), { status: 409, code: "CHIAMO_SUBACCOUNT_REQUIRED" });
  }
  return { tenantId, subaccountSid: mappedSid };
}

export function chiamoNumberWebhookBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.TWILIO_VOICE_WEBHOOK_BASE_URL;
  if (!configured) throw Object.assign(new Error("TWILIO_VOICE_WEBHOOK_BASE_URL is required for Chiamo number purchases."), { status: 503, code: "CHIAMO_WEBHOOK_ORIGIN_REQUIRED" });
  let url: URL;
  try { url = new URL(configured); } catch { throw Object.assign(new Error("The configured Chiamo Voice webhook origin is invalid."), { status: 503, code: "CHIAMO_WEBHOOK_ORIGIN_INVALID" }); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || (url.hostname !== "chiamoconnect.com" && !url.hostname.endsWith(".chiamoconnect.com"))) {
    throw Object.assign(new Error("The configured Chiamo Voice webhook origin must be an HTTPS Chiamo Connect production origin."), { status: 503, code: "CHIAMO_WEBHOOK_ORIGIN_INVALID" });
  }
  return url.origin;
}

async function mappedCompanyClient(tenantId: string) {
  const [tenant] = await db.select({ id: tenants.id, sid: tenants.twilioAccountSid }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw Object.assign(new Error("Chiamo company was not found."), { status: 404, code: "CHIAMO_COMPANY_NOT_FOUND" });
  const resolved = await resolveCompanyTwilioAccount(tenantId, { createIfMissing: false });
  const mapping = assertMappedChiamoSubaccount(tenantId, tenant.sid, resolved.subaccountSid, process.env.TWILIO_ACCOUNT_SID);
  return { client: await getCompanyTwilioClient(tenantId, false), subaccountSid: mapping.subaccountSid };
}

/** This provider deliberately uses the tenant's existing Chiamo-owned subaccount and never enables messaging. */
export const liveChiamoNumberProvider: ChiamoNumberProvider = {
  async searchLocal(tenantId, areaCode, limit) {
    try {
      const { client } = await mappedCompanyClient(tenantId);
      const rows = await client.availablePhoneNumbers("US").local.list({ areaCode: Number(areaCode), voiceEnabled: true, limit });
      return rows.map(row => ({ phoneNumber: row.phoneNumber, friendlyName: row.friendlyName, locality: row.locality || "", region: row.region || "", isoCountry: row.isoCountry || "US", capabilities: { voice: !!row.capabilities?.voice, sms: false, mms: false } }));
    } catch (error) { throw safeChiamoNumberProviderError(error); }
  },
  async searchTollFree(tenantId, limit) {
    try {
      const { client } = await mappedCompanyClient(tenantId);
      const rows = await client.availablePhoneNumbers("US").tollFree.list({ voiceEnabled: true, limit });
      return rows.map(row => ({ phoneNumber: row.phoneNumber, friendlyName: row.friendlyName, locality: row.locality || "", region: row.region || "", isoCountry: row.isoCountry || "US", capabilities: { voice: !!row.capabilities?.voice, sms: false, mms: false } }));
    } catch (error) { throw safeChiamoNumberProviderError(error); }
  },
  async findOwned(tenantId, phoneNumber) {
    try {
      const { client, subaccountSid } = await mappedCompanyClient(tenantId);
      const rows = await client.incomingPhoneNumbers.list({ phoneNumber: formatPhoneE164(phoneNumber), limit: 1 });
      return rows[0] ? { sid: rows[0].sid, phoneNumber: rows[0].phoneNumber, subaccountSid } : null;
    } catch (error) { throw safeChiamoNumberProviderError(error); }
  },
  async purchaseVoice(tenantId, phoneNumber) {
    try {
      const { client, subaccountSid } = await mappedCompanyClient(tenantId);
      const base = chiamoNumberWebhookBaseUrl();
      const row = await client.incomingPhoneNumbers.create({
        phoneNumber: formatPhoneE164(phoneNumber), friendlyName: `Chiamo Voice - ${formatPhoneE164(phoneNumber)}`,
        voiceUrl: `${base}/api/voice/inbound`, voiceMethod: "POST",
        statusCallback: `${base}/api/voice/call-status`, statusCallbackMethod: "POST",
      });
      return { sid: row.sid, phoneNumber: row.phoneNumber, subaccountSid };
    } catch (error) { throw safeChiamoNumberProviderError(error); }
  },
};

export async function reconcileOrPurchaseChiamoNumber(
  provider: ChiamoNumberProvider,
  tenantId: string,
  phoneNumber: string,
  beforePurchase?: () => Promise<void>,
) {
  const owned = await provider.findOwned(tenantId, phoneNumber);
  if (owned) return owned;
  // Re-read authorization after the bounded reconciliation call. If billing or
  // readiness changed while that call was in flight, do not mutate the provider.
  await beforePurchase?.();
  return provider.purchaseVoice(tenantId, phoneNumber);
}

export function withAdditionalNumberCharge(customCharges: Array<{ name: string; cents: number }>, count: number, included: number, price: number) {
  const description = "Additional Chiamo business phone numbers";
  const updated = customCharges.filter(charge => charge.name !== description);
  const additional = Math.max(0, count - Math.max(0, included));
  if (additional && price > 0) updated.push({ name: description, cents: additional * price });
  return updated;
}

export function initialChiamoNumberIdentity(priorActiveCount: number) {
  return priorActiveCount === 0 ? { isPrimary: true, friendlyName: "Main Line" } : { isPrimary: false, friendlyName: null };
}

export type NumberReadiness = { allowed: boolean; reason?: string; priceCents?: number; includedNumbers?: number; currentCount?: number };

export async function getChiamoNumberReadiness(tenantId: string, tx: any = db): Promise<NumberReadiness> {
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const [service] = await tx.select().from(chiamoServiceConfigurations).where(eq(chiamoServiceConfigurations.tenantId, tenantId)).limit(1);
  const [subscription] = await tx.select().from(chiamoSubscriptions).where(eq(chiamoSubscriptions.tenantId, tenantId)).limit(1);
  const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(voipPhoneNumbers)
    .where(and(eq(voipPhoneNumbers.tenantId, tenantId), eq(voipPhoneNumbers.isActive, true)));
  if (!tenant || !tenant.chiamoConnectEnabled || tenant.chainCoreEnabled) return { allowed: false, reason: "This action is available only to Chiamo Connect customers." };
  if (!tenant.isActive || !service?.accountActive) return { allowed: false, reason: "Your Chiamo account is suspended. Contact support to restore purchases.", currentCount: count };
  if (subscription?.billingStatus !== "ACTIVE") return { allowed: false, reason: "Active Chiamo billing is required before purchasing a number.", currentCount: count };
  if (!service.voiceEnabled || service.voiceProviderStatus !== "READY") return { allowed: false, reason: "Voice setup must be READY before purchasing a number.", currentCount: count };
  const plan = chiamoPlans.find(item => item.id === subscription.planId);
  const includedNumbers = plan?.includedNumbers ?? 0;
  return { allowed: true, priceCents: subscription.additionalNumberPriceCents, includedNumbers, currentCount: count };
}

export async function persistChiamoNumberPurchase(tenantId: string, claimId: string, claimToken: string, providerNumber: { sid: string; phoneNumber: string; subaccountSid: string }) {
  return db.transaction(async tx => {
    const tenant = await lockChiamoOnlyTenant(tx, tenantId);
    // Hold the mutable Chiamo account and billing rows through persistence so a
    // suspension or entitlement change cannot race a new number/billing update.
    await tx.select({ tenantId: chiamoServiceConfigurations.tenantId }).from(chiamoServiceConfigurations)
      .where(eq(chiamoServiceConfigurations.tenantId, tenantId)).for("update");
    await tx.select({ tenantId: chiamoSubscriptions.tenantId }).from(chiamoSubscriptions)
      .where(eq(chiamoSubscriptions.tenantId, tenantId)).for("update");
    const readiness = await getChiamoNumberReadiness(tenantId, tx);
    if (!readiness.allowed) throw Object.assign(new Error(readiness.reason), { status: 409, code: "NUMBER_PURCHASE_NOT_READY" });
    const claimResult = await tx.execute(sql`select * from chiamo_number_purchase_claims where id = ${claimId} and tenant_id = ${tenantId} and claim_token = ${claimToken} for update`);
    const claim: any = claimResult.rows[0];
    if (!claim) throw Object.assign(new Error("This purchase attempt was superseded. Refresh inventory."), { status: 409, code: "NUMBER_PURCHASE_CLAIM_LOST" });
    assertMappedChiamoSubaccount(tenantId, tenant.twilioAccountSid, providerNumber.subaccountSid);
    if (claim.status === "COMPLETED" && claim.result_number_id) {
      const [existing] = await tx.select().from(voipPhoneNumbers).where(eq(voipPhoneNumbers.id, claim.result_number_id)).limit(1);
      if (existing) return existing;
    }
    const normalized = formatPhoneE164(providerNumber.phoneNumber);
    const [existing] = await tx.select().from(voipPhoneNumbers).where(and(eq(voipPhoneNumbers.tenantId, tenantId), eq(voipPhoneNumbers.phoneNumber, normalized))).limit(1);
    const [{ count: priorCount }] = await tx.select({ count: sql<number>`count(*)::int` }).from(voipPhoneNumbers).where(and(eq(voipPhoneNumbers.tenantId, tenantId), eq(voipPhoneNumbers.isActive, true)));
    const identity = initialChiamoNumberIdentity(priorCount);
    const number = existing || (await tx.insert(voipPhoneNumbers).values({
      tenantId, phoneNumber: normalized, areaCode: extractAreaCode(normalized), numberType: isTollFreeNumber(normalized) ? "TOLL_FREE" : "LOCAL_PRESENCE",
      twilioPhoneSid: providerNumber.sid, twilioSubaccountSid: providerNumber.subaccountSid, status: "ACTIVE",
      friendlyName: identity.friendlyName,
      voiceEnabled: true, smsEnabled: false, capabilities: { voice: true, sms: false }, isActive: true, isPrimary: identity.isPrimary,
    }).returning())[0];
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(voipPhoneNumbers).where(and(eq(voipPhoneNumbers.tenantId, tenantId), eq(voipPhoneNumbers.isActive, true)));
    const [subscription] = await tx.select().from(chiamoSubscriptions).where(eq(chiamoSubscriptions.tenantId, tenantId)).for("update").limit(1);
    if (!subscription) throw Object.assign(new Error("Chiamo billing configuration is missing."), { status: 409 });
    const included = chiamoPlans.find(item => item.id === subscription.planId)?.includedNumbers ?? 0;
    const price = Math.max(0, subscription.additionalNumberPriceCents);
    const customCharges = withAdditionalNumberCharge(subscription.customCharges || [], count, included, price);
    await tx.update(chiamoSubscriptions).set({ customCharges, updatedAt: new Date() }).where(eq(chiamoSubscriptions.tenantId, tenantId));
    await tx.execute(sql`update chiamo_number_purchase_claims set status = 'COMPLETED', twilio_phone_sid = ${providerNumber.sid}, result_number_id = ${number.id}, error_message = null, updated_at = now() where id = ${claimId} and claim_token = ${claimToken}`);
    return number;
  });
}