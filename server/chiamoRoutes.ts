import type { Express, RequestHandler } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { emailService } from "./emailService";
import { authenticateUser } from "./authMiddleware";
import { agencyCredentials, tenants, voipCallLogs, voipPhoneNumbers } from "@shared/schema";
import { chiamoLeads, chiamoSubscriptions, chiamoUsageSettings } from "@shared/chiamo-schema";
import { calculateChiamoMonthlyService, CHIAMO_SUPPORT_EMAIL, chiamoLeadStatuses, chiamoPlans } from "@shared/chiamo";

const leadInput = z.object({
  firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), businessName: z.string().trim().min(1).max(200),
  businessEmail: z.string().email().max(254), businessPhone: z.string().trim().min(7).max(40), employeeCount: z.string().max(50).optional(),
  phoneUsersNeeded: z.coerce.number().int().positive().max(100000), currentPhoneProvider: z.string().max(200).optional(), newNumbersNeeded: z.coerce.number().int().min(0).max(10000).optional(),
  existingNumbersToPort: z.string().max(2000).optional(), featuresNeeded: z.string().max(3000).optional(), planInterest: z.enum(["starter", "business", "professional", "enterprise", "unsure"]),
  textingInterest: z.boolean().default(false), contactPreference: z.string().max(100).optional(), bestContactTime: z.string().max(200).optional(), additionalInformation: z.string().max(5000).optional(),
  consent: z.literal(true), website: z.string().max(0).optional(),
});

export function registerChiamoRoutes(app: Express, isPlatformAdmin: RequestHandler) {
  app.get("/api/chiamo/plans", (_req, res) => res.json(chiamoPlans));
  app.post("/api/chiamo/leads", async (req, res) => {
    const parsed = leadInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Please check the highlighted business information.", issues: parsed.error.flatten().fieldErrors });
    const { consent: _consent, website: _website, ...lead } = parsed.data;
    const [saved] = await db.insert(chiamoLeads).values(lead).returning();
    // Saving is the transaction boundary. Notification failure is deliberately non-fatal.
    emailService.sendEmail({ to: CHIAMO_SUPPORT_EMAIL, subject: `New Chiamo Connect Lead — ${saved.businessName}`, html: `<h1>New Chiamo Connect lead</h1><p><strong>${saved.businessName}</strong></p><p>${saved.firstName} ${saved.lastName} · ${saved.businessEmail} · ${saved.businessPhone}</p><p>${saved.phoneUsersNeeded} phone users · ${saved.planInterest} plan · Texting: ${saved.textingInterest ? "Interested" : "No"}</p>` })
      .catch(error => console.error("Chiamo lead notification failed after lead was saved", error));
    return res.status(201).json({ id: saved.id, message: "Thank you. Our team will contact you to review your business phone needs." });
  });

  app.get("/api/chiamo/account", authenticateUser, async (req: any, res) => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.user.tenantId)).limit(1);
    if (!tenant?.chiamoConnectEnabled) return res.status(403).json({ message: "Chiamo Connect is not enabled." });
    const [subscription] = await db.select().from(chiamoSubscriptions).where(eq(chiamoSubscriptions.tenantId, tenant.id)).limit(1);
    const [{ count: userCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(agencyCredentials).where(and(eq(agencyCredentials.tenantId, tenant.id), eq(agencyCredentials.isActive, true)));
    const [{ count: numberCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(voipPhoneNumbers).where(and(eq(voipPhoneNumbers.tenantId, tenant.id), eq(voipPhoneNumbers.isActive, true)));
    const calculation = subscription ? calculateChiamoMonthlyService(subscription.planId, userCount, subscription.smsAddonEnabled, subscription.customBasePriceCents) : null;
    res.json({ tenant: { name: tenant.name, chiamoSmsEnabled: subscription?.smsAddonEnabled === true }, subscription, userCount, numberCount, calculation, supportEmail: CHIAMO_SUPPORT_EMAIL });
  });

  app.post("/api/chiamo/texting-request", authenticateUser, async (req: any, res) => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.user.tenantId)).limit(1);
    if (!tenant?.chiamoConnectEnabled) return res.status(403).json({ message: "Chiamo Connect is not enabled." });
    await emailService.sendEmail({ to: CHIAMO_SUPPORT_EMAIL, subject: `Chiamo Business Texting Request — ${tenant.name}`, html: `<p>${tenant.name} requested the managed Business Texting add-on. Compliance and messaging setup must be reviewed before activation.</p>` });
    res.status(202).json({ message: "Request received. Texting will not be activated until setup and compliance review are complete." });
  });

  app.get("/api/admin/chiamo/leads", isPlatformAdmin, async (_req, res) => res.json(await db.select().from(chiamoLeads).orderBy(desc(chiamoLeads.createdAt))));
  app.patch("/api/admin/chiamo/leads/:id", isPlatformAdmin, async (req, res) => {
    const update = z.object({ status: z.enum(chiamoLeadStatuses).optional(), assignedTo: z.string().max(200).nullable().optional(), internalNotes: z.string().max(10000).nullable().optional(), contactHistory: z.array(z.object({ at: z.string(), note: z.string().max(2000) })).optional() }).parse(req.body);
    const [lead] = await db.update(chiamoLeads).set(update).where(eq(chiamoLeads.id, req.params.id)).returning();
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.json(lead);
  });
  app.put("/api/admin/chiamo/tenants/:tenantId/billing", isPlatformAdmin, async (req, res) => {
    const value = z.object({ planId: z.enum(["starter", "business", "professional", "enterprise"]), customBasePriceCents: z.number().int().min(0).nullable().optional(), includedUsers: z.number().int().positive().nullable().optional(), additionalUserPriceCents: z.number().int().min(0).nullable().optional(), additionalNumberPriceCents: z.number().int().min(0).optional(), smsAddonEnabled: z.boolean(), smsAllowance: z.number().int().min(0).optional(), smsOverageMicros: z.number().int().min(0).optional(), customCharges: z.array(z.object({ name: z.string(), cents: z.number().int() })).optional(), discounts: z.array(z.object({ name: z.string(), cents: z.number().int() })).optional(), billingStatus: z.string(), nextBillingDate: z.string().nullable().optional(), notes: z.string().nullable().optional() }).parse(req.body);
    const [subscription] = await db.insert(chiamoSubscriptions).values({ tenantId: req.params.tenantId, ...value }).onConflictDoUpdate({ target: chiamoSubscriptions.tenantId, set: { ...value, updatedAt: new Date() } }).returning();
    res.json(subscription);
  });
  app.get("/api/admin/chiamo/usage", isPlatformAdmin, async (_req, res) => {
    const [settings] = await db.select().from(chiamoUsageSettings).where(eq(chiamoUsageSettings.id, 1));
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const rows = await db.select({ tenantId: tenants.id, organization: tenants.name, plan: chiamoSubscriptions.planId, revenue: chiamoSubscriptions.customBasePriceCents,
      users: sql<number>`count(distinct ${agencyCredentials.id})::int`, phoneNumbers: sql<number>`count(distinct ${voipPhoneNumbers.id})::int`,
      inboundSeconds: sql<number>`coalesce(sum(case when ${voipCallLogs.direction} = 'inbound' then ${voipCallLogs.duration} else 0 end),0)::int`, outboundSeconds: sql<number>`coalesce(sum(case when ${voipCallLogs.direction} = 'outbound' then ${voipCallLogs.duration} else 0 end),0)::int`,
      recordingSeconds: sql<number>`coalesce(sum(case when ${voipCallLogs.recordingSid} is not null then ${voipCallLogs.duration} else 0 end),0)::int` })
      .from(tenants).leftJoin(chiamoSubscriptions, eq(chiamoSubscriptions.tenantId, tenants.id)).leftJoin(agencyCredentials, eq(agencyCredentials.tenantId, tenants.id)).leftJoin(voipPhoneNumbers, eq(voipPhoneNumbers.tenantId, tenants.id)).leftJoin(voipCallLogs, and(eq(voipCallLogs.tenantId, tenants.id), gte(voipCallLogs.createdAt, monthStart))).where(eq(tenants.chiamoConnectEnabled, true)).groupBy(tenants.id, chiamoSubscriptions.planId, chiamoSubscriptions.customBasePriceCents);
    res.json({ settings, organizations: rows.map(row => { const minutes = Math.ceil((row.inboundSeconds + row.outboundSeconds) / 60); const level = minutes >= settings.reviewMinutes ? "REVIEW REQUIRED" : minutes >= settings.highMinutes ? "HIGH" : minutes >= settings.elevatedMinutes ? "ELEVATED" : "NORMAL"; const providerCostCents = Math.ceil(minutes * settings.voiceCostPerMinuteMicros / 10000); const numberCostCents = row.phoneNumbers * settings.numberCostCents; const recordingCostCents = Math.ceil(row.recordingSeconds / 60 * settings.recordingCostPerMinuteMicros / 10000); return { ...row, totalMinutes: minutes, usageLevel: level, estimatedVoiceProviderCostCents: providerCostCents, estimatedPhoneNumberCostCents: numberCostCents, estimatedRecordingCostCents: recordingCostCents, estimatedGrossMarginCents: (row.revenue || 0) - providerCostCents - numberCostCents - recordingCostCents }; }) });
  });
}
