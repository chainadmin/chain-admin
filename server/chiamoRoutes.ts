import type { Express, RequestHandler } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "./db";
import { emailService } from "./emailService";
import { storage } from "./storage";
import { authenticateUser } from "./authMiddleware";
import { agencyCredentials, tenants, voipCallLogs, voipPhoneNumbers, voipRoutingBuckets, voipTenantSettings, voipVoicemails } from "@shared/schema";
import { chiamoLeads, chiamoServiceConfigurations, chiamoSubscriptions, chiamoUsageSettings } from "@shared/chiamo-schema";
import { calculateChiamoMonthlyService, CHIAMO_SUPPORT_EMAIL, chiamoBillingStatuses, chiamoLeadStatuses, chiamoPlans, chiamoSmsStatuses, chiamoTestStatuses } from "@shared/chiamo";

const leadInput = z.object({
  firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), businessName: z.string().trim().min(1).max(200),
  businessEmail: z.string().email().max(254), businessPhone: z.string().trim().min(7).max(40), employeeCount: z.string().max(50).optional(),
  phoneUsersNeeded: z.coerce.number().int().positive().max(100000), currentPhoneProvider: z.string().max(200).optional(), newNumbersNeeded: z.coerce.number().int().min(0).max(10000).optional(),
  existingNumbersToPort: z.string().max(2000).optional(), featuresNeeded: z.string().max(3000).optional(), planInterest: z.enum(["starter", "business", "professional", "enterprise", "unsure"]),
  textingInterest: z.boolean().default(false), contactPreference: z.string().max(100).optional(), bestContactTime: z.string().max(200).optional(), additionalInformation: z.string().max(5000).optional(),
  consent: z.literal(true), website: z.string().max(0).optional(),
});

async function sendLeadNotification(lead: typeof chiamoLeads.$inferSelect) {
  try { return await emailService.sendEmail({ to: CHIAMO_SUPPORT_EMAIL, subject: `New Chiamo Connect Lead — ${lead.businessName}`, html: `<h1>New Chiamo Connect lead</h1><p><strong>${lead.businessName}</strong></p><p>${lead.firstName} ${lead.lastName} · ${lead.businessEmail} · ${lead.businessPhone}</p><p>${lead.phoneUsersNeeded} phone users · ${lead.planInterest} plan · Texting: ${lead.textingInterest ? "Interested" : "No"}</p>`, tag: "chiamo-lead" }); }
  catch (error) { return { success:false, messageId:"", error:error instanceof Error?error.message:"Postmark delivery failed" }; }
}

export function registerChiamoRoutes(app: Express, isPlatformAdmin: RequestHandler) {
  app.get("/api/chiamo/plans", (_req, res) => res.json(chiamoPlans));
  app.post("/api/chiamo/leads", async (req, res) => {
    const parsed = leadInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Please check the highlighted business information.", issues: parsed.error.flatten().fieldErrors });
    const { consent: _consent, website: _website, ...lead } = parsed.data;
    const [saved] = await db.insert(chiamoLeads).values(lead).returning();
    // Saving is the transaction boundary. Notification failure is deliberately non-fatal.
    sendLeadNotification(saved).then(async result => {
      await db.update(chiamoLeads).set(result.success ? { notificationStatus: "SENT", notificationSentAt: new Date(), notificationError: null } : { notificationStatus: "FAILED", notificationError: result.error || "Postmark delivery failed" }).where(eq(chiamoLeads.id, saved.id));
    }).catch(error => console.error("Chiamo lead notification status update failed", error));
    return res.status(201).json({ id: saved.id, message: "Thank you. Our team will contact you to review your business phone needs." });
  });

  app.get("/api/chiamo/account", authenticateUser, async (req: any, res) => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.user.tenantId)).limit(1);
    if (!tenant?.chiamoConnectEnabled) return res.status(403).json({ message: "Chiamo Connect is not enabled." });
    const [service] = await db.select().from(chiamoServiceConfigurations).where(eq(chiamoServiceConfigurations.tenantId, tenant.id)).limit(1);
    if (service && (!service.accountActive || !service.customerLoginEnabled)) return res.status(403).json({ message: "Chiamo customer access is disabled." });
    const [subscription] = await db.select().from(chiamoSubscriptions).where(eq(chiamoSubscriptions.tenantId, tenant.id)).limit(1);
    const [{ count: userCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(agencyCredentials).where(and(eq(agencyCredentials.tenantId, tenant.id), eq(agencyCredentials.isActive, true)));
    const [{ count: numberCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(voipPhoneNumbers).where(and(eq(voipPhoneNumbers.tenantId, tenant.id), eq(voipPhoneNumbers.isActive, true)));
    const calculation = subscription ? calculateChiamoMonthlyService(subscription.planId, userCount, subscription.smsAddonEnabled, subscription) : null;
    res.json({ tenant: { name: tenant.name, chiamoSmsEnabled: service?.smsEnabled === true }, service, subscription, userCount, numberCount, calculation, supportEmail: CHIAMO_SUPPORT_EMAIL });
  });

  app.get("/api/chiamo/messages", authenticateUser, async (req: any, res) => {
    const [service] = await db.select().from(chiamoServiceConfigurations).where(eq(chiamoServiceConfigurations.tenantId, req.user.tenantId)).limit(1);
    if (!service?.accountActive || !service.customerLoginEnabled || !service.smsEnabled || service.smsStatus !== "ACTIVE") return res.status(403).json({ message: "Business Texting is not active." });
    res.json(await storage.getSmsRepliesByTenant(req.user.tenantId));
  });
  app.post("/api/chiamo/messages/:id/respond", authenticateUser, async (req: any, res) => {
    const body = z.object({ message:z.string().trim().min(1).max(1600) }).parse(req.body);
    const [service] = await db.select().from(chiamoServiceConfigurations).where(eq(chiamoServiceConfigurations.tenantId, req.user.tenantId)).limit(1);
    if (!service?.accountActive || !service.customerLoginEnabled || !service.smsEnabled || service.smsStatus !== "ACTIVE") return res.status(403).json({ message: "Business Texting is not active." });
    const original = await storage.getSmsReplyById(req.params.id, req.user.tenantId);
    if (!original) return res.status(404).json({ message:"Conversation not found" });
    const { smsService } = await import("./smsService");
    await smsService.sendSms(original.fromPhone, body.message, req.user.tenantId, undefined, original.consumerId || undefined);
    res.status(201).json({ message:"Message sent" });
  });

  app.post("/api/chiamo/texting-request", authenticateUser, async (req: any, res) => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.user.tenantId)).limit(1);
    if (!tenant?.chiamoConnectEnabled) return res.status(403).json({ message: "Chiamo Connect is not enabled." });
    await emailService.sendEmail({ to: CHIAMO_SUPPORT_EMAIL, subject: `Chiamo Business Texting Request — ${tenant.name}`, html: `<p>${tenant.name} requested the managed Business Texting add-on. Compliance and messaging setup must be reviewed before activation.</p>` });
    res.status(202).json({ message: "Request received. Texting will not be activated until setup and compliance review are complete." });
  });

  app.get("/api/admin/chiamo/leads", isPlatformAdmin, async (_req, res) => res.json(await db.select().from(chiamoLeads).orderBy(desc(chiamoLeads.createdAt))));
  app.patch("/api/admin/chiamo/leads/:id", isPlatformAdmin, async (req, res) => {
    const update = z.object({ status: z.enum(chiamoLeadStatuses).optional(), assignedTo: z.string().max(200).nullable().optional(), internalNotes: z.string().max(10000).nullable().optional(), contactHistory: z.array(z.object({ at: z.string(), note: z.string().max(2000) })).optional(), lastContactDate: z.coerce.date().nullable().optional(), nextFollowUpDate: z.string().nullable().optional() }).parse(req.body);
    const [lead] = await db.update(chiamoLeads).set(update).where(eq(chiamoLeads.id, req.params.id)).returning();
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.json(lead);
  });
  app.post("/api/admin/chiamo/leads/:id/convert", isPlatformAdmin, async (req, res) => {
    const input = z.object({
      company: z.object({ businessName:z.string().trim().min(1).max(200), firstName:z.string().trim().min(1).max(100), lastName:z.string().trim().min(1).max(100), email:z.string().email(), phone:z.string().trim().min(7).max(40) }),
      planId: z.enum(["starter","business","professional","enterprise"]), customBasePriceCents:z.number().int().min(0).nullable().optional(), includedUsers:z.number().int().positive(), initialActiveUsers:z.number().int().positive(), additionalUserPriceCents:z.number().int().min(0),
      requiredNumberCount:z.number().int().min(0), numbersToPort:z.string().max(2000).optional(), voiceEnabled:z.boolean(), smsEnabled:z.boolean(), smsStatus:z.enum(chiamoSmsStatuses), smsAllowance:z.number().int().min(0).default(3500), smsOverageMicros:z.number().int().min(0).default(0),
      billingStatus:z.enum(chiamoBillingStatuses), startDate:z.string().nullable().optional(), nextBillingDate:z.string().nullable().optional(), billingNotes:z.string().max(10000).nullable().optional(),
    }).parse(req.body);
    const [lead] = await db.select().from(chiamoLeads).where(eq(chiamoLeads.id, req.params.id)).limit(1);
    if (!lead) return res.status(404).json({ message:"Lead not found" });
    if (lead.convertedTenantId) return res.status(409).json({ message:"Lead has already been converted", tenantId:lead.convertedTenantId });
    if (input.smsEnabled && input.smsStatus !== "ACTIVE") return res.status(409).json({ message:"SMS cannot be enabled before registration and compliance are ACTIVE." });
    if (input.voiceEnabled && input.billingStatus !== "ACTIVE") return res.status(409).json({ message:"Billing must be ACTIVE before Voice can be enabled." });
    const slugBase = input.company.businessName.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40) || "chiamo";
    const existing = await storage.getTenantByEmail(input.company.email);
    const result = await db.transaction(async tx => {
      let tenant = existing;
      if (!tenant) [tenant] = await tx.insert(tenants).values({ name:input.company.businessName, slug:`${slugBase}-${crypto.randomBytes(3).toString("hex")}`, businessName:input.company.businessName, email:input.company.email.toLowerCase(), phoneNumber:input.company.phone, ownerFirstName:input.company.firstName, ownerLastName:input.company.lastName, businessType:"call_center", chainCoreEnabled:false, chiamoConnectEnabled:true, voipEnabled:input.voiceEnabled, smsServiceEnabled:input.smsEnabled, maxActiveUsers:input.includedUsers, isTrialAccount:false, isPaidAccount:input.billingStatus==="ACTIVE" }).returning();
      else [tenant] = await tx.update(tenants).set({ chiamoConnectEnabled:true, voipEnabled:input.voiceEnabled, maxActiveUsers:input.includedUsers }).where(eq(tenants.id,tenant.id)).returning();
      const existingUser = await tx.select().from(agencyCredentials).where(eq(agencyCredentials.email,input.company.email.toLowerCase())).limit(1);
      let credential = existingUser[0];
      if (!credential) {
        const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString("base64url"), 10);
        [credential] = await tx.insert(agencyCredentials).values({ tenantId:tenant.id, username:input.company.email.toLowerCase(), email:input.company.email.toLowerCase(), firstName:input.company.firstName, lastName:input.company.lastName, role:"owner", passwordHash, voipAccess:input.voiceEnabled }).returning();
      }
      await tx.insert(chiamoSubscriptions).values({ tenantId:tenant.id, planId:input.planId, customBasePriceCents:input.customBasePriceCents, includedUsers:input.includedUsers, additionalUserPriceCents:input.additionalUserPriceCents, smsAddonEnabled:input.smsEnabled, smsAllowance:input.smsAllowance, smsOverageMicros:input.smsOverageMicros, billingStatus:input.billingStatus, startDate:input.startDate, nextBillingDate:input.nextBillingDate, notes:input.billingNotes }).onConflictDoUpdate({ target:chiamoSubscriptions.tenantId, set:{ planId:input.planId, customBasePriceCents:input.customBasePriceCents, includedUsers:input.includedUsers, additionalUserPriceCents:input.additionalUserPriceCents, smsAddonEnabled:input.smsEnabled, smsAllowance:input.smsAllowance, smsOverageMicros:input.smsOverageMicros, billingStatus:input.billingStatus, startDate:input.startDate, nextBillingDate:input.nextBillingDate, notes:input.billingNotes, updatedAt:new Date() } });
      await tx.insert(chiamoServiceConfigurations).values({ tenantId:tenant.id, accountActive:true, customerLoginEnabled:false, voiceEnabled:input.voiceEnabled, inboundEnabled:input.voiceEnabled, outboundEnabled:input.voiceEnabled, voicemailEnabled:input.voiceEnabled, recordingEnabled:input.voiceEnabled, routingEnabled:input.voiceEnabled, ivrEnabled:input.voiceEnabled, smsEnabled:input.smsEnabled, smsStatus:input.smsStatus, setupStatus:"IN_PROGRESS", setupChecklist:{ businessVerified:true, planSelected:true, billingConfigured:true, primaryUserCreated:true, additionalUsersCreated:input.initialActiveUsers<=1, phoneNumberAssigned:input.requiredNumberCount===0, portCompleted:!input.numbersToPort, voiceProviderConfigured:false, outboundCallingTested:false, inboundCallingTested:false, voicemailTested:false, recordingTested:false, smsRequested:input.smsStatus!=="NOT_REQUESTED", smsRegistrationComplete:input.smsStatus==="ACTIVE", smsSendingTested:false, smsReceivingTested:false, customerInvitationSent:false, customerLoginConfirmed:false, setupComplete:false } }).onConflictDoNothing();
      await tx.update(chiamoLeads).set({ status:"CONVERTED", convertedTenantId:tenant.id }).where(eq(chiamoLeads.id,lead.id));
      return { tenant, credential };
    });
    const token = crypto.randomBytes(32).toString("hex");
    await storage.createPasswordResetToken(result.credential.id, token, new Date(Date.now()+24*60*60*1000));
    const invitationUrl = `${process.env.BASE_URL || "https://chainsoftwaregroup.com"}/agency/reset-password?token=${token}`;
    const notification = await emailService.sendEmail({ to:input.company.email, subject:"Your Chiamo Connect account is ready", html:`<p>Hello ${input.company.firstName},</p><p>Your Chiamo Connect account is ready.</p><p><a href="${invitationUrl}">Set your password securely</a>. This invitation expires in 24 hours.</p>`, tag:"chiamo-invitation" });
    if (notification.success) await db.update(chiamoServiceConfigurations).set({ invitationSentAt:new Date(), setupChecklist:sql`setup_checklist || '{"customerInvitationSent":true}'::jsonb` }).where(eq(chiamoServiceConfigurations.tenantId,result.tenant.id));
    res.status(201).json({ tenantId:result.tenant.id, invitationSent:notification.success });
  });
  app.put("/api/admin/chiamo/tenants/:tenantId/billing", isPlatformAdmin, async (req, res) => {
    const value = z.object({ planId: z.enum(["starter", "business", "professional", "enterprise"]), customBasePriceCents: z.number().int().min(0).nullable().optional(), includedUsers: z.number().int().positive().nullable().optional(), additionalUserPriceCents: z.number().int().min(0).nullable().optional(), additionalNumberPriceCents: z.number().int().min(0).optional(), smsAddonEnabled: z.boolean(), smsAllowance: z.number().int().min(0).optional(), smsOverageMicros: z.number().int().min(0).optional(), customCharges: z.array(z.object({ name: z.string(), cents: z.number().int() })).optional(), discounts: z.array(z.object({ name: z.string(), cents: z.number().int() })).optional(), billingStatus: z.enum(chiamoBillingStatuses), startDate: z.string().nullable().optional(), nextBillingDate: z.string().nullable().optional(), notes: z.string().nullable().optional() }).parse(req.body);
    const [subscription] = await db.insert(chiamoSubscriptions).values({ tenantId: req.params.tenantId, ...value }).onConflictDoUpdate({ target: chiamoSubscriptions.tenantId, set: { ...value, updatedAt: new Date() } }).returning();
    // Nonpayment disables the complete phone system immediately. SMS remains a
    // separate add-on, but cannot bypass account/billing suspension.
    if (["PAST_DUE", "SUSPENDED", "CANCELLED"].includes(value.billingStatus)) {
      await db.insert(chiamoServiceConfigurations).values({ tenantId:req.params.tenantId, voiceEnabled:false, inboundEnabled:false, outboundEnabled:false, recordingEnabled:false, voicemailEnabled:false, routingEnabled:false, ivrEnabled:false })
        .onConflictDoUpdate({ target:chiamoServiceConfigurations.tenantId, set:{ voiceEnabled:false, inboundEnabled:false, outboundEnabled:false, recordingEnabled:false, voicemailEnabled:false, routingEnabled:false, ivrEnabled:false, updatedAt:new Date() } });
      await db.update(tenants).set({ voipEnabled:false }).where(and(eq(tenants.id,req.params.tenantId),eq(tenants.chiamoConnectEnabled,true)));
    }
    res.json(subscription);
  });
  app.post("/api/admin/chiamo/leads/:id/resend-notification", isPlatformAdmin, async (req, res) => {
    const [lead] = await db.select().from(chiamoLeads).where(eq(chiamoLeads.id, req.params.id)).limit(1);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    const result = await sendLeadNotification(lead);
    const [updated] = await db.update(chiamoLeads).set(result.success ? { notificationStatus: "SENT", notificationSentAt: new Date(), notificationError: null } : { notificationStatus: "FAILED", notificationError: result.error || "Postmark delivery failed" }).where(eq(chiamoLeads.id, lead.id)).returning();
    res.status(result.success ? 200 : 502).json(updated);
  });
  app.get("/api/admin/chiamo/customers", isPlatformAdmin, async (_req, res) => {
    const rows = await db.select({ tenant: tenants, subscription: chiamoSubscriptions, service: chiamoServiceConfigurations }).from(tenants).leftJoin(chiamoSubscriptions, eq(chiamoSubscriptions.tenantId, tenants.id)).leftJoin(chiamoServiceConfigurations, eq(chiamoServiceConfigurations.tenantId, tenants.id)).where(eq(tenants.chiamoConnectEnabled, true)).orderBy(desc(tenants.createdAt));
    const enriched = await Promise.all(rows.map(async row => {
      const [[{ users }], [{ numbers }], [{ buckets }], [voiceSettings], [{ voicemailTotal, voicemailUnread }]] = await Promise.all([
        db.select({ users: sql<number>`count(*)::int` }).from(agencyCredentials).where(and(eq(agencyCredentials.tenantId,row.tenant.id),eq(agencyCredentials.isActive,true))),
        db.select({ numbers: sql<number>`count(*)::int` }).from(voipPhoneNumbers).where(and(eq(voipPhoneNumbers.tenantId,row.tenant.id),eq(voipPhoneNumbers.isActive,true))),
        db.select({ buckets: sql<number>`count(*)::int` }).from(voipRoutingBuckets).where(eq(voipRoutingBuckets.tenantId,row.tenant.id)),
        db.select().from(voipTenantSettings).where(eq(voipTenantSettings.tenantId,row.tenant.id)).limit(1),
        db.select({
          voicemailTotal: sql<number>`count(*)::int`,
          voicemailUnread: sql<number>`count(*) filter (where ${voipVoicemails.isRead} = false)::int`,
        }).from(voipVoicemails).where(eq(voipVoicemails.tenantId,row.tenant.id)),
      ]);
      const calc = row.subscription ? calculateChiamoMonthlyService(row.subscription.planId, users, row.subscription.smsAddonEnabled, row.subscription) : null;
      return {
        ...row,
        users,
        numbers,
        estimatedMonthlyCents: calc?.totalCents || 0,
        voiceRouting: {
          buckets,
          greetingEnabled: voiceSettings?.inboundGreetingEnabled || false,
          greetingType: voiceSettings?.inboundGreetingType || null,
          holdMusicKey: voiceSettings?.holdMusicKey || 'art-gallery-museum',
          parkMusicKey: voiceSettings?.parkMusicKey || 'art-gallery-museum',
          voicemailTotal,
          voicemailUnread,
        },
      };
    }));
    res.json(enriched);
  });
  app.get("/api/admin/chiamo/dashboard", isPlatformAdmin, async (_req, res) => {
    const leads = await db.select().from(chiamoLeads).orderBy(desc(chiamoLeads.createdAt));
    const customers = await db.select({ tenant: tenants, service: chiamoServiceConfigurations, subscription: chiamoSubscriptions }).from(tenants).leftJoin(chiamoServiceConfigurations,eq(chiamoServiceConfigurations.tenantId,tenants.id)).leftJoin(chiamoSubscriptions,eq(chiamoSubscriptions.tenantId,tenants.id)).where(eq(tenants.chiamoConnectEnabled,true));
    res.json({ counts: { newLeads: leads.filter(x=>x.status==='NEW').length, awaitingContact: leads.filter(x=>['NEW','CONTACTED'].includes(x.status)).length, qualified: leads.filter(x=>x.status==='QUALIFIED').length, setupInProgress: customers.filter(x=>x.service?.setupStatus!=='COMPLETE').length, activeCustomers: customers.filter(x=>x.service?.accountActive).length, awaitingNumber: customers.filter(x=>!x.service?.setupChecklist?.phoneNumberAssigned).length, awaitingSms: customers.filter(x=>x.subscription?.smsAddonEnabled&&!x.service?.smsEnabled).length, billingIssues: customers.filter(x=>['PAST_DUE','SUSPENDED'].includes(x.subscription?.billingStatus||'')).length }, recentActivity: leads.slice(0,10) });
  });
  app.put("/api/admin/chiamo/customers/:tenantId/services", isPlatformAdmin, async (req, res) => {
    const value = z.object({ accountActive:z.boolean().optional(), customerLoginEnabled:z.boolean().optional(), voiceEnabled:z.boolean().optional(), smsEnabled:z.boolean().optional(), smsStatus:z.enum(chiamoSmsStatuses).optional(), setupStatus:z.enum(['NOT_STARTED','IN_PROGRESS','COMPLETE']).optional(), setupChecklist:z.record(z.boolean()).optional(), testStatuses:z.record(z.enum(chiamoTestStatuses)).optional(), providerNotes:z.string().max(10000).nullable().optional(), internalNotes:z.string().max(10000).nullable().optional() }).parse(req.body);
    if (value.voiceEnabled === true) {
      const [subscription] = await db.select({ billingStatus:chiamoSubscriptions.billingStatus }).from(chiamoSubscriptions).where(eq(chiamoSubscriptions.tenantId,req.params.tenantId)).limit(1);
      if (subscription?.billingStatus !== "ACTIVE") return res.status(409).json({ message:"Billing must be ACTIVE before the Chiamo phone system can be enabled.", code:"BILLING_INACTIVE" });
    }
    const bundledVoice = value.voiceEnabled === undefined ? {} : { voiceEnabled:value.voiceEnabled, inboundEnabled:value.voiceEnabled, outboundEnabled:value.voiceEnabled, recordingEnabled:value.voiceEnabled, voicemailEnabled:value.voiceEnabled, routingEnabled:value.voiceEnabled, ivrEnabled:value.voiceEnabled };
    const normalized = { ...value, ...bundledVoice };
    const [config] = await db.insert(chiamoServiceConfigurations).values({ tenantId:req.params.tenantId,...normalized }).onConflictDoUpdate({target:chiamoServiceConfigurations.tenantId,set:{...normalized,updatedAt:new Date()}}).returning();
    // Chiamo Voice is sold and suspended as one complete phone system.
    if (value.voiceEnabled !== undefined) await db.update(tenants).set({voipEnabled:value.voiceEnabled}).where(and(eq(tenants.id,req.params.tenantId),eq(tenants.chiamoConnectEnabled,true)));
    res.json(config);
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
