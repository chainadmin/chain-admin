import { and, eq, sql } from "drizzle-orm";
import { tenants } from "@shared/schema";
import { chiamoServiceConfigurations, chiamoSubscriptions } from "@shared/chiamo-schema";
import { db } from "./db";
import { isUsableEncryptedCredential } from "./credentialCrypto";
import { resolveCompanyTwilioVoiceConfiguration, VOICE_ONBOARDING_CLAIM_MS } from "./companyTwilioService";
import { lockChiamoOnlyTenant, upsertChiamoPhoneEntitlement } from "./phoneProductEntitlement";

export type ChiamoStageStatus = "READY" | "FAILED" | "NOT_REQUESTED" | "NOT_STARTED" | "IN_PROGRESS";
export function voiceProviderStatusForConversion(voiceEnabled:boolean, existingStatus?:string|null): "READY"|"IN_PROGRESS"|"NOT_STARTED"|"NOT_REQUESTED" {
  return !voiceEnabled ? "NOT_REQUESTED" : existingStatus === "READY" ? "READY" : existingStatus === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED";
}
export function sanitizeOnboardingError(_stage:"voice", _error:unknown) {
  return "The Chiamo Voice provider could not be configured. Verify master credentials and webhook configuration, then retry.";
}
function validOrigin(value:string) {
  try { const url=new URL(value.includes("://")?value:`https://${value}`); return url.protocol==="https:" && !url.username && !url.password && url.pathname==="/" && !url.search && !url.hash && (url.hostname==="chiamoconnect.com"||url.hostname.endsWith(".chiamoconnect.com")) ? url.origin : null; } catch { return null; }
}
export function resolveChiamoBaseUrl(env:Partial<Record<"CHIAMO_BASE_URL"|"CHIAMO_DOMAIN",string|undefined>>=process.env, origin?:string) {
  const configured=env.CHIAMO_BASE_URL||env.CHIAMO_DOMAIN, resolved=configured&&validOrigin(configured);
  if (configured&&!resolved) throw new Error("CHIAMO_BASE_URL or CHIAMO_DOMAIN is invalid");
  if (resolved) return resolved;
  const request=origin&&validOrigin(origin); if (request) return request;
  throw new Error("A verified Chiamo base URL is required");
}
const lifecycle=(status:string|null):"ACTIVE"|"SUSPENDED"|"CANCELLED"=>status==="ACTIVE"?"ACTIVE":status==="CANCELLED"?"CANCELLED":"SUSPENDED";
export function chiamoReadinessForVoiceStatus(status:ChiamoStageStatus) { return status==="READY"||status==="NOT_REQUESTED"?"READY":status==="IN_PROGRESS"?"IN_PROGRESS":"NOT_READY"; }

type OnboardingState = {
  tenant: typeof tenants.$inferSelect;
  service: typeof chiamoServiceConfigurations.$inferSelect;
  subscription: typeof chiamoSubscriptions.$inferSelect;
};

async function lockedState(tx: any, tenantId: string): Promise<OnboardingState> {
  // Keep lock ordering identical to customer/admin mutations.
  const tenant = await lockChiamoOnlyTenant(tx, tenantId);
  const [service] = await tx.select().from(chiamoServiceConfigurations)
    .where(eq(chiamoServiceConfigurations.tenantId, tenantId)).for("update").limit(1);
  const [subscription] = await tx.select().from(chiamoSubscriptions)
    .where(eq(chiamoSubscriptions.tenantId, tenantId)).for("update").limit(1);
  if (!service || !subscription) {
    throw Object.assign(new Error("Chiamo service configuration or subscription is missing."), {
      status: 409, code: "CHIAMO_SERVICE_NOT_CONFIGURED",
    });
  }
  return { tenant, service, subscription };
}

function currentStatus(state: OnboardingState): ChiamoStageStatus {
  if (!state.tenant.isActive || !state.service.accountActive) return "FAILED";
  if (!state.service.voiceEnabled) return "NOT_REQUESTED";
  if (state.subscription.billingStatus !== "ACTIVE") return "FAILED";
  const status = state.service.voiceProviderStatus;
  return status === "READY" || status === "IN_PROGRESS" ? status : "FAILED";
}

async function reconcile(tx: any, state: OnboardingState) {
  await upsertChiamoPhoneEntitlement(tx, state.tenant.id, lifecycle(state.subscription.billingStatus),
    state.service.voiceEnabled, state.service.accountActive);
}

function ownsClaim(service: OnboardingState["service"], claim: Date) {
  return service.voiceProviderStatus === "IN_PROGRESS"
    && service.voiceProviderAttemptedAt?.getTime() === claim.getTime();
}

export async function ensureChiamoVoiceProvider(tenantId: string): Promise<ChiamoStageStatus> {
  const prepared = await db.transaction(async tx => {
    const state = await lockedState(tx, tenantId);
    const { service, tenant, subscription } = state;
    const now = new Date();
    const liveClaim = service.voiceProviderStatus === "IN_PROGRESS"
      && service.voiceProviderAttemptedAt
      && now.getTime() - service.voiceProviderAttemptedAt.getTime() < VOICE_ONBOARDING_CLAIM_MS;
    if (liveClaim) {
      await reconcile(tx, state);
      return { status: "IN_PROGRESS" as ChiamoStageStatus };
    }
    if (!service.voiceEnabled) {
      await tx.update(chiamoServiceConfigurations).set({
        voiceProviderStatus: "NOT_REQUESTED", voiceProviderError: null, updatedAt: now,
      }).where(eq(chiamoServiceConfigurations.tenantId, tenantId));
      await reconcile(tx, state);
      return { status: "NOT_REQUESTED" as ChiamoStageStatus };
    }
    if (!tenant.isActive || !service.accountActive || subscription.billingStatus !== "ACTIVE") {
      await tx.update(chiamoServiceConfigurations).set({
        voiceProviderStatus: service.voiceProviderStatus === "READY" ? "READY" : "FAILED",
        voiceProviderError: "Voice remains unavailable while the account or billing is inactive.",
        readinessStatus: "NOT_READY", updatedAt: now,
      }).where(eq(chiamoServiceConfigurations.tenantId, tenantId));
      await reconcile(tx, state);
      return { status: "FAILED" as ChiamoStageStatus };
    }
    const resourcesReady = tenant.twilioAccountSid && tenant.twilioApiKeySid
      && tenant.twilioTwimlAppSid && isUsableEncryptedCredential(tenant.twilioApiKeySecret);
    if (resourcesReady) {
      await tx.update(chiamoServiceConfigurations).set({
        voiceProviderStatus: "READY", voiceProviderError: null, updatedAt: now,
      }).where(eq(chiamoServiceConfigurations.tenantId, tenantId));
      await reconcile(tx, state);
      return { status: "READY" as ChiamoStageStatus };
    }
    // READY with missing/corrupt resources is repairable, not an endless 202.
    await tx.update(chiamoServiceConfigurations).set({
      voiceProviderStatus: "IN_PROGRESS", voiceProviderError: null,
      voiceProviderAttemptedAt: now, readinessStatus: "IN_PROGRESS", updatedAt: now,
    }).where(eq(chiamoServiceConfigurations.tenantId, tenantId));
    await reconcile(tx, state);
    return { claimAttemptedAt: now };
  });
  if ("status" in prepared) return prepared.status!;
  const claim = prepared.claimAttemptedAt!;
  try {
    const configured = await resolveCompanyTwilioVoiceConfiguration(tenantId, { claimAttemptedAt: claim });
    if (!configured.subaccountSid || !configured.apiKeySid || !configured.apiKeySecret || !configured.twimlAppSid) {
      throw new Error("Incomplete Voice provider resources");
    }
    return await db.transaction(async tx => {
      const state = await lockedState(tx, tenantId);
      if (!ownsClaim(state.service, claim)) return currentStatus(state);
      await tx.update(chiamoServiceConfigurations).set({
        voiceProviderStatus: "READY", voiceProviderError: null,
        setupChecklist: sql`setup_checklist || '{"voiceProviderConfigured":true}'::jsonb`,
        updatedAt: new Date(),
      }).where(eq(chiamoServiceConfigurations.tenantId, tenantId));
      state.service.voiceProviderStatus = "READY";
      await reconcile(tx, state);
      return currentStatus(state);
    });
  } catch (error) {
    console.error("Chiamo Voice onboarding failed", { tenantId, errorType: error instanceof Error ? error.name : "UnknownError" });
    return db.transaction(async tx => {
      const state = await lockedState(tx, tenantId);
      if (!ownsClaim(state.service, claim)) return currentStatus(state);
      await tx.update(chiamoServiceConfigurations).set({
        voiceProviderStatus: "FAILED", voiceProviderError: sanitizeOnboardingError("voice", error),
        readinessStatus: "NOT_READY", updatedAt: new Date(),
      }).where(eq(chiamoServiceConfigurations.tenantId, tenantId));
      await reconcile(tx, state);
      return "FAILED";
    });
  }
}

export async function retryChiamoOnboarding(tenantId: string) {
  await ensureChiamoVoiceProvider(tenantId);
  return db.transaction(async tx => {
    const state = await lockedState(tx, tenantId);
    const voiceProviderStatus = currentStatus(state);
    const readinessStatus = chiamoReadinessForVoiceStatus(voiceProviderStatus);
    const customerLoginEnabled = !state.service.explicitLoginDisabled;
    await tx.update(chiamoServiceConfigurations).set({
      readinessStatus, customerLoginEnabled,
      ...(readinessStatus === "READY" ? { setupStatus: "COMPLETE" } : {}),
      updatedAt: new Date(),
    }).where(eq(chiamoServiceConfigurations.tenantId, tenantId));
    return { voiceProviderStatus, readinessStatus, customerLoginEnabled };
  });
}