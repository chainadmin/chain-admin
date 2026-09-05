import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { agencyCredentials, phoneProductEntitlements, tenants } from "@shared/schema";
import { chiamoServiceConfigurations, chiamoSubscriptions } from "@shared/chiamo-schema";
import { CHIAMO_SUPPORT_EMAIL } from "@shared/chiamo";
import { db } from "./db";
import { encryptCredential } from "./credentialCrypto";
import { postmarkServerService } from "./postmarkServerService";
import type { PostmarkServer, PostmarkServerConfig, PostmarkServerResult } from "./postmarkServerService";
import { resolveCompanyTwilioVoiceConfiguration } from "./companyTwilioService";
import { emailService } from "./emailService";
import { storage } from "./storage";
import { upsertChiamoPhoneEntitlement } from "./phoneProductEntitlement";

export type ChiamoStageStatus = "READY" | "FAILED" | "NOT_REQUESTED" | "NOT_STARTED" | "SENT" | "IN_PROGRESS";
const STAGE_CLAIM_STALE_MS = 10 * 60 * 1000;

export function invitationPrerequisites(input: {
  postmarkStatus: string;
  hasPostmarkCredentials: boolean;
  voiceRequested: boolean;
  voiceProviderStatus: string;
}): { ready: boolean; reason?: string } {
  if (input.postmarkStatus !== "READY" || !input.hasPostmarkCredentials) return { ready:false, reason:"POSTMARK_NOT_READY" };
  if (input.voiceRequested && input.voiceProviderStatus !== "READY") return { ready:false, reason:"VOICE_NOT_READY" };
  return { ready:true };
}

export async function resolveDedicatedPostmarkServer(
  name: string,
  provider: {
    findServerByName(name: string): Promise<PostmarkServerResult>;
    createServer(config: PostmarkServerConfig): Promise<PostmarkServerResult>;
  },
): Promise<PostmarkServer> {
  const found = await provider.findServerByName(name);
  if (!found.success) throw new Error("Postmark lookup failed");
  if (found.server) return found.server;
  const created = await provider.createServer({ name, color:"Green", trackOpens:true, trackLinks:"HtmlAndText" });
  if (!created.success || !created.server) throw new Error("Postmark creation failed");
  return created.server;
}

export function sanitizeOnboardingError(stage: "postmark" | "voice" | "invitation", _error: unknown): string {
  if (stage === "postmark") return "The dedicated Chiamo email provider could not be configured. Verify the Postmark account configuration and retry.";
  if (stage === "voice") return "The Chiamo Voice provider could not be configured. Verify master credentials and webhook configuration, then retry.";
  return "The secure Chiamo invitation could not be delivered. Verify the Chiamo URL and email provider configuration, then retry.";
}

function normalizedHttpsOrigin(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.hostname === "chainsoftwaregroup.com" || url.hostname.endsWith(".chainsoftwaregroup.com")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveChiamoBaseUrl(
  env: Partial<Record<"CHIAMO_BASE_URL" | "CHIAMO_DOMAIN", string | undefined>> = process.env,
  verifiedRequestOrigin?: string,
): string {
  const configured = env.CHIAMO_BASE_URL || env.CHIAMO_DOMAIN;
  const configuredOrigin = configured ? normalizedHttpsOrigin(configured) : null;
  if (configured && !configuredOrigin) throw new Error("CHIAMO_BASE_URL or CHIAMO_DOMAIN is invalid");
  if (configuredOrigin) return configuredOrigin;
  const requestOrigin = verifiedRequestOrigin ? normalizedHttpsOrigin(verifiedRequestOrigin) : null;
  if (requestOrigin) return requestOrigin;
  throw new Error("A verified Chiamo base URL is required");
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

async function markStage(tenantId: string, values: Record<string, unknown>) {
  await db.update(chiamoServiceConfigurations).set({ ...values, updatedAt: new Date() })
    .where(eq(chiamoServiceConfigurations.tenantId, tenantId));
}

export async function ensureChiamoPostmarkServer(tenantId: string): Promise<ChiamoStageStatus> {
  const attemptedAt = new Date();
  const [existing] = await db.select({
    status:chiamoServiceConfigurations.postmarkStatus,
    serverId:tenants.postmarkServerId,
    serverToken:tenants.postmarkServerToken,
  }).from(chiamoServiceConfigurations)
    .innerJoin(tenants, eq(tenants.id, chiamoServiceConfigurations.tenantId))
    .where(eq(chiamoServiceConfigurations.tenantId, tenantId)).limit(1);
  if (existing?.status === "READY" && existing.serverId && existing.serverToken) return "READY";
  if (existing?.status === "READY") {
    await markStage(tenantId, {
      postmarkStatus:"FAILED",
      postmarkError:"The saved Chiamo email provider configuration is incomplete. Retry provider setup.",
    });
  }
  const staleBefore = new Date(Date.now() - STAGE_CLAIM_STALE_MS);
  const claimed = await db.execute(sql`
    update chiamo_service_configurations
    set postmark_status = 'IN_PROGRESS', postmark_error = null,
        postmark_attempted_at = ${attemptedAt}, readiness_status = 'NOT_READY',
        updated_at = ${attemptedAt}
    where tenant_id = ${tenantId} and postmark_status <> 'READY'
      and (postmark_status <> 'IN_PROGRESS' or postmark_attempted_at is null or postmark_attempted_at < ${staleBefore})
    returning tenant_id
  `);
  if (!claimed.rows?.length) return "IN_PROGRESS";
  try {
    const [tenant] = await db.select({
      id: tenants.id, postmarkServerId: tenants.postmarkServerId, postmarkServerToken: tenants.postmarkServerToken, postmarkServerName: tenants.postmarkServerName,
      postmarkInboundAddress:tenants.postmarkInboundAddress,
    }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) throw new Error("Organization not found");
    const name = tenant.postmarkServerName || `Chiamo Connect - ${tenantId}`;
    let serverId = tenant.postmarkServerId;
    let serverToken = tenant.postmarkServerToken;
    let serverName = name;
    let inboundAddress: string | null = tenant.postmarkInboundAddress;
    if (!serverId || !serverToken) {
      const provisioned = await resolveDedicatedPostmarkServer(name, postmarkServerService);
      const token = provisioned?.ApiTokens?.[0];
      if (!provisioned?.ID || !token) throw new Error("Postmark server did not return usable credentials");
      serverId = String(provisioned.ID);
      serverToken = token;
      serverName = provisioned.Name || name;
      inboundAddress = provisioned.InboundAddress || null;
    }
    const encryptedToken = serverToken.startsWith("enc:v1:") ? serverToken : encryptCredential(serverToken);
    const result = await db.transaction(async tx => {
      const [saved] = await tx.update(tenants).set({
        postmarkServerId: serverId, postmarkServerToken: encryptedToken, postmarkServerName: serverName,
        postmarkInboundAddress: inboundAddress,
      }).where(eq(tenants.id, tenantId)).returning({
        postmarkServerId: tenants.postmarkServerId, postmarkServerToken: tenants.postmarkServerToken,
      });
      await tx.update(chiamoServiceConfigurations).set({ postmarkStatus:"READY", postmarkError:null, updatedAt:new Date() }).where(eq(chiamoServiceConfigurations.tenantId,tenantId));
      return saved;
    });
    if (!result?.postmarkServerId || !result.postmarkServerToken) throw new Error("Postmark persistence verification failed");
    return "READY";
  } catch (error) {
    console.error("Chiamo Postmark onboarding failed", { tenantId, errorType:error instanceof Error ? error.name : "UnknownError" });
    await markStage(tenantId, {
      postmarkStatus:"FAILED",
      postmarkError:sanitizeOnboardingError("postmark", error),
      readinessStatus:"NOT_READY",
    });
    return "FAILED";
  }
}

export async function ensureChiamoVoiceProvider(tenantId: string): Promise<ChiamoStageStatus> {
  const [row] = await db.select({
    voiceEnabled: chiamoServiceConfigurations.voiceEnabled,
    voiceProviderStatus:chiamoServiceConfigurations.voiceProviderStatus,
    billingStatus: chiamoSubscriptions.billingStatus,
    twilioAccountSid:tenants.twilioAccountSid,
    twilioApiKeySid:tenants.twilioApiKeySid,
    twilioApiKeySecret:tenants.twilioApiKeySecret,
    twilioTwimlAppSid:tenants.twilioTwimlAppSid,
  }).from(chiamoServiceConfigurations)
    .leftJoin(chiamoSubscriptions, eq(chiamoSubscriptions.tenantId, chiamoServiceConfigurations.tenantId))
    .innerJoin(tenants, eq(tenants.id, chiamoServiceConfigurations.tenantId))
    .where(eq(chiamoServiceConfigurations.tenantId, tenantId)).limit(1);
  if (!row?.voiceEnabled) {
    await db.update(tenants).set({ voipEnabled: false }).where(eq(tenants.id, tenantId));
    await db.update(phoneProductEntitlements).set({ enabled: false, updatedAt: new Date() }).where(eq(phoneProductEntitlements.tenantId, tenantId));
    await markStage(tenantId, { voiceProviderStatus: "NOT_REQUESTED", voiceProviderError: null });
    return "NOT_REQUESTED";
  }
  if (row.billingStatus !== "ACTIVE") {
    await db.update(tenants).set({ voipEnabled: false }).where(eq(tenants.id, tenantId));
    await db.update(phoneProductEntitlements).set({ enabled: false, updatedAt: new Date(), disabledAt: new Date() }).where(eq(phoneProductEntitlements.tenantId, tenantId));
    await markStage(tenantId, {
      voiceProviderStatus: "FAILED", voiceProviderAttemptedAt: new Date(),
      voiceProviderError: "Billing must be ACTIVE before Chiamo Voice provider setup can run.",
    });
    return "FAILED";
  }
  const hasPersistedVoiceResources = Boolean(
    row.twilioAccountSid && row.twilioApiKeySid && row.twilioApiKeySecret && row.twilioTwimlAppSid,
  );
  if (row.voiceProviderStatus === "READY" && hasPersistedVoiceResources) return "READY";
  if (row.voiceProviderStatus === "READY") {
    await markStage(tenantId, {
      voiceProviderStatus:"FAILED",
      voiceProviderError:"The saved Chiamo Voice provider configuration is incomplete. Retry provider setup.",
      setupChecklist:sql`setup_checklist || '{"voiceProviderConfigured":false}'::jsonb`,
    });
  }
  const attemptedAt = new Date();
  const staleBefore = new Date(Date.now() - STAGE_CLAIM_STALE_MS);
  const claimed = await db.execute(sql`
    update chiamo_service_configurations
    set voice_provider_status = 'IN_PROGRESS', voice_provider_error = null,
        voice_provider_attempted_at = ${attemptedAt}, readiness_status = 'NOT_READY',
        updated_at = ${attemptedAt}
    where tenant_id = ${tenantId} and voice_provider_status <> 'READY'
      and (voice_provider_status <> 'IN_PROGRESS' or voice_provider_attempted_at is null or voice_provider_attempted_at < ${staleBefore})
    returning tenant_id
  `);
  if (!claimed.rows?.length) return "IN_PROGRESS";
  try {
    const configured = await resolveCompanyTwilioVoiceConfiguration(tenantId);
    if (!configured.subaccountSid || !configured.apiKeySid || !configured.apiKeySecret || !configured.twimlAppSid) {
      throw new Error("Incomplete Voice provider resources");
    }
    await markStage(tenantId, {
      voiceProviderStatus: "READY", voiceProviderError: null,
      setupChecklist: sql`setup_checklist || '{"voiceProviderConfigured":true}'::jsonb`,
    });
    await db.transaction(tx => upsertChiamoPhoneEntitlement(tx, tenantId, "ACTIVE", true, true));
    return "READY";
  } catch (error) {
    console.error("Chiamo Voice onboarding failed", { tenantId, errorType:error instanceof Error ? error.name : "UnknownError" });
    await markStage(tenantId, {
      voiceProviderStatus: "FAILED", voiceProviderError: sanitizeOnboardingError("voice", error),
      readinessStatus:"NOT_READY",
      setupChecklist: sql`setup_checklist || '{"voiceProviderConfigured":false}'::jsonb`,
    });
    await db.update(tenants).set({ voipEnabled: false }).where(eq(tenants.id, tenantId));
    await db.update(phoneProductEntitlements).set({ enabled: false, updatedAt: new Date(), disabledAt: new Date() }).where(eq(phoneProductEntitlements.tenantId, tenantId));
    return "FAILED";
  }
}

export async function sendChiamoInvitation(tenantId: string, verifiedRequestOrigin?: string): Promise<ChiamoStageStatus> {
  const attemptedAt = new Date();
  const staleBefore = new Date(Date.now() - STAGE_CLAIM_STALE_MS);
  const claimed = await db.execute(sql`
    update chiamo_service_configurations
    set invitation_status = 'IN_PROGRESS', invitation_error = null,
        invitation_attempted_at = ${attemptedAt}, updated_at = ${attemptedAt}
    where tenant_id = ${tenantId}
      and (invitation_status <> 'IN_PROGRESS' or invitation_attempted_at is null or invitation_attempted_at < ${staleBefore})
    returning tenant_id
  `);
  if (!claimed.rows?.length) return "IN_PROGRESS";
  try {
    const [base] = await db.select({
      tenant: tenants, service: chiamoServiceConfigurations,
    }).from(tenants)
      .innerJoin(chiamoServiceConfigurations, eq(chiamoServiceConfigurations.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId)).limit(1);
    if (!base || !base.tenant.chiamoConnectEnabled || base.tenant.chainCoreEnabled) throw new Error("Organization is not Chiamo-only");
    const ownerEmail = base.tenant.email?.trim().toLowerCase();
    const owners = await db.select().from(agencyCredentials).where(and(
      eq(agencyCredentials.tenantId, tenantId), eq(agencyCredentials.role, "owner"), eq(agencyCredentials.isActive, true),
      sql`lower(trim(${agencyCredentials.email})) = ${ownerEmail || ""}`,
    )).limit(2);
    if (!ownerEmail || owners.length !== 1) throw new Error("Canonical owner verification failed");
    const row = { ...base, credential:owners[0] };
    const prerequisites = invitationPrerequisites({
      postmarkStatus:row.service.postmarkStatus,
      hasPostmarkCredentials:Boolean(row.tenant.postmarkServerId && row.tenant.postmarkServerToken),
      voiceRequested:row.service.voiceEnabled,
      voiceProviderStatus:row.service.voiceProviderStatus,
    });
    if (!prerequisites.ready) throw new Error(prerequisites.reason);
    const baseUrl = resolveChiamoBaseUrl(process.env, verifiedRequestOrigin);
    const token = crypto.randomBytes(32).toString("hex");
    await db.execute(sql`update password_reset_tokens set used_at = now() where credential_id = ${row.credential.id} and used_at is null`);
    await storage.createPasswordResetToken(row.credential.id, token, new Date(Date.now() + 24 * 60 * 60 * 1000));
    const invitationUrl = `${baseUrl}/agency/reset-password?token=${encodeURIComponent(token)}`;
    const delivery = await emailService.sendEmail({
      tenantId, preserveExplicitSender: true, from: `Chiamo Connect <${CHIAMO_SUPPORT_EMAIL}>`,
      replyTo: CHIAMO_SUPPORT_EMAIL, to: row.credential.email,
      subject: "Set your Chiamo Connect password",
      html: `<p>Hello${row.credential.firstName ? ` ${escapeHtml(row.credential.firstName)}` : ""},</p><p>Your Chiamo Connect account is ready.</p><p><a href="${escapeHtml(invitationUrl)}">Set your password securely</a>. This one-time link expires in 24 hours.</p><p>Chiamo Connect will never email you a plaintext password.</p>`,
      tag: "chiamo-invitation",
    });
    if (!delivery.success) throw new Error("Invitation delivery failed");
    await markStage(tenantId, {
      invitationStatus: "SENT", invitationError: null, invitationSentAt: new Date(),
      customerLoginEnabled: true, readinessStatus: "AWAITING_FIRST_LOGIN",
      setupChecklist: sql`setup_checklist || '{"customerInvitationSent":true}'::jsonb`,
    });
    return "SENT";
  } catch (error) {
    console.error("Chiamo invitation onboarding failed", { tenantId, errorType:error instanceof Error ? error.name : "UnknownError" });
    await markStage(tenantId, {
      invitationStatus: "FAILED",
      invitationError: sanitizeOnboardingError("invitation", error),
    });
    return "FAILED";
  }
}

export async function retryChiamoOnboarding(tenantId: string, verifiedRequestOrigin?: string) {
  const postmarkStatus = await ensureChiamoPostmarkServer(tenantId);
  const voiceProviderStatus = await ensureChiamoVoiceProvider(tenantId);
  const [service] = await db.select({
    invitationStatus: chiamoServiceConfigurations.invitationStatus,
    loginConfirmedAt: chiamoServiceConfigurations.loginConfirmedAt,
  }).from(chiamoServiceConfigurations)
    .where(eq(chiamoServiceConfigurations.tenantId, tenantId)).limit(1);
  const invitationStatus = service?.loginConfirmedAt || service?.invitationStatus === "SENT"
    ? "SENT"
    : postmarkStatus === "READY" && (voiceProviderStatus === "READY" || voiceProviderStatus === "NOT_REQUESTED")
      ? await sendChiamoInvitation(tenantId, verifiedRequestOrigin)
      : "NOT_SENT";
  return { postmarkStatus, voiceProviderStatus, invitationStatus };
}