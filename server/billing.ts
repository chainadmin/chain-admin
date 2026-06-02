import { db } from "./db";
import { storage } from "./storage";
import { voipStorage } from "./voipStorage";
import { autoResponseUsage, consumers, subscriptionPlans } from "@shared/schema";
import { and, eq, sql, gte, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  A_LA_CARTE_SERVICE_PRICE,
  A_LA_CARTE_CORE_SERVICES,
  A_LA_CARTE_SERVICE_LABELS,
  EMAIL_OVERAGE_RATE_PER_EMAIL,
  SMS_OVERAGE_RATE_PER_SEGMENT,
  DOCUMENT_SIGNING_ADDON_PRICE,
  AI_AUTO_RESPONSE_ADDON_PRICE,
  MOBILE_APP_BRANDING_MONTHLY,
  AUTO_RESPONSE_OVERAGE_PER_RESPONSE,
  AUTO_RESPONSE_INCLUDED_RESPONSES,
  type MessagingPlanId,
} from "@shared/billing-plans";

export interface InvoiceLineItem {
  description: string;
  amountCents: number;
  quantity?: number;
  unitLabel?: string;
}

export interface ComputedBill {
  /** Whether the tenant has anything billable for this period */
  hasBillableActivity: boolean;
  monthlyBase: number;
  addonFees: number;
  usageCharges: number;
  voipCosts: number;
  totalBill: number;
  consumerCount: number;
  emailUsage: { used: number; included: number; overage: number; overageCharge: number };
  smsUsage: { used: number; included: number; overage: number; overageCharge: number };
  aiAutoResponseUsage: { used: number; included: number; overage: number; overageCharge: number };
  addons: {
    documentSigning: boolean;
    documentSigningFee: number;
    aiAutoResponse: boolean;
    aiAutoResponseFee: number;
    mobileAppBranding: boolean;
    mobileAppBrandingFee: number;
  };
  voipDetails: any | null;
  lineItems: InvoiceLineItem[];
}

const round2 = (n: number) => Number(n.toFixed(2));

/** Count AI auto-response (non-test) usage for a tenant within a period. */
async function countAiResponses(tenantId: string, periodStart: Date, periodEnd: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(autoResponseUsage)
    .where(and(
      eq(autoResponseUsage.tenantId, tenantId),
      eq(autoResponseUsage.testMode, false),
      gte(autoResponseUsage.createdAt, periodStart),
      lte(autoResponseUsage.createdAt, periodEnd),
    ));
  return rows[0]?.count ?? 0;
}

async function countConsumers(tenantId: string): Promise<number> {
  const rows = await db.select({ count: sql<number>`COUNT(*)::int` }).from(consumers).where(eq(consumers.tenantId, tenantId));
  return rows[0]?.count ?? 0;
}

/** Compute VoIP costs for a tenant (returns { voipCosts, voipDetails }). */
async function computeVoipCosts(tenantId: string): Promise<{ voipCosts: number; voipDetails: any | null }> {
  const tenant = await storage.getTenant(tenantId);
  if (!tenant?.voipEnabled) return { voipCosts: 0, voipDetails: null };

  const voipUserCount = await voipStorage.countVoipUsersForTenant(tenantId);
  const { localCount, tollFreeCount } = await voipStorage.countVoipPhoneNumbersByTenant(tenantId);

  const userPrice = tenant.voipUserPrice || 8000;
  const localDidPrice = tenant.voipLocalDidPrice || 500;
  const tollFreePrice = tenant.voipTollFreePrice || 1000;

  const userCost = voipUserCount * userPrice;
  const localCost = localCount * localDidPrice;
  const tollFreeCost = tollFreeCount * tollFreePrice;
  const voipCosts = (userCost + localCost + tollFreeCost) / 100;

  return {
    voipCosts,
    voipDetails: {
      userCount: voipUserCount,
      userCost: userCost / 100,
      localDidCount: localCount,
      localDidCost: localCost / 100,
      tollFreeCount,
      tollFreeCost: tollFreeCost / 100,
      totalCost: voipCosts,
    },
  };
}

/**
 * Single source of truth for à la carte charges. Used by /api/billing/stats,
 * the invoice cron, and the manual generate-invoice endpoint so they cannot drift.
 *
 * Charge model:
 *   base = (# enabled core services) × $125
 *   + ALL email/SMS usage as overage (zero included)
 *   + feature add-on fees (document signing, AI auto-response, mobile app branding)
 *   + AI auto-response overage (launch-tier quota)
 *   + VoIP costs
 */
export async function computeALaCarteBill(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<ComputedBill> {
  const enabledAddons = await storage.getEnabledAddons(tenantId);

  const enabledCoreServices = A_LA_CARTE_CORE_SERVICES.filter((s) => enabledAddons.includes(s));
  const serviceCount = enabledCoreServices.length;
  const monthlyBase = serviceCount * A_LA_CARTE_SERVICE_PRICE;

  const hasDocumentSigning = enabledAddons.includes('document_signing');
  const hasAiAutoResponse = enabledAddons.includes('ai_auto_response');
  const hasMobileApp = enabledAddons.includes('mobile_app_branding');

  const documentSigningFee = hasDocumentSigning ? DOCUMENT_SIGNING_ADDON_PRICE : 0;
  const aiAutoResponseFee = hasAiAutoResponse ? AI_AUTO_RESPONSE_ADDON_PRICE : 0;
  // À la carte tenants have no plan, so Mobile App Branding is always charged when enabled
  const mobileAppFee = hasMobileApp ? MOBILE_APP_BRANDING_MONTHLY : 0;
  const addonFees = documentSigningFee + aiAutoResponseFee + mobileAppFee;

  // Usage — à la carte includes zero, all usage is overage
  const usageTotals = await storage.getMessagingUsageTotals(tenantId, periodStart, periodEnd);
  const emailUsed = usageTotals.emailCount;
  const smsUsed = usageTotals.smsSegments;
  const emailOverageCharge = round2(emailUsed * EMAIL_OVERAGE_RATE_PER_EMAIL);
  const smsOverageCharge = round2(smsUsed * SMS_OVERAGE_RATE_PER_SEGMENT);

  // AI auto-response overage (no plan = launch tier quota)
  const aiIncluded = AUTO_RESPONSE_INCLUDED_RESPONSES['launch'] ?? 1000;
  let aiUsed = 0;
  let aiOverage = 0;
  let aiOverageCharge = 0;
  if (hasAiAutoResponse) {
    aiUsed = await countAiResponses(tenantId, periodStart, periodEnd);
    aiOverage = Math.max(0, aiUsed - aiIncluded);
    aiOverageCharge = round2(aiOverage * AUTO_RESPONSE_OVERAGE_PER_RESPONSE);
  }

  const { voipCosts, voipDetails } = await computeVoipCosts(tenantId);

  const usageCharges = round2(emailOverageCharge + smsOverageCharge + aiOverageCharge);
  const totalBill = round2(monthlyBase + addonFees + usageCharges + voipCosts);

  const consumerCount = await countConsumers(tenantId);

  // Line items
  const lineItems: InvoiceLineItem[] = [];
  for (const svc of enabledCoreServices) {
    lineItems.push({
      description: `${A_LA_CARTE_SERVICE_LABELS[svc] ?? svc} (à la carte)`,
      amountCents: Math.round(A_LA_CARTE_SERVICE_PRICE * 100),
    });
  }
  if (hasDocumentSigning) lineItems.push({ description: 'Document Signing Add-on', amountCents: Math.round(documentSigningFee * 100) });
  if (hasAiAutoResponse) lineItems.push({ description: 'AI Auto-Response Add-on', amountCents: Math.round(aiAutoResponseFee * 100) });
  if (hasMobileApp) lineItems.push({ description: 'Mobile App Branding Add-on', amountCents: Math.round(mobileAppFee * 100) });

  lineItems.push({
    description: 'Emails Sent',
    amountCents: Math.round(emailOverageCharge * 100),
    quantity: emailUsed,
    unitLabel: 'emails',
  });
  lineItems.push({
    description: 'SMS Segments Sent',
    amountCents: Math.round(smsOverageCharge * 100),
    quantity: smsUsed,
    unitLabel: 'segments',
  });

  if (hasAiAutoResponse) {
    lineItems.push({
      description: aiOverage > 0 ? 'AI Responses (within plan)' : 'AI Responses',
      amountCents: 0,
      quantity: aiUsed,
      unitLabel: `of ${aiIncluded} included`,
    });
    if (aiOverage > 0) {
      lineItems.push({
        description: 'AI Response Overage',
        amountCents: Math.round(aiOverageCharge * 100),
        quantity: aiOverage,
        unitLabel: 'responses over limit',
      });
    }
  }

  if (voipCosts > 0) {
    lineItems.push({ description: 'VoIP Phone System', amountCents: Math.round(voipCosts * 100) });
  }

  const hasBillableActivity = totalBill > 0 || serviceCount > 0 || addonFees > 0 || emailUsed > 0 || smsUsed > 0;

  return {
    hasBillableActivity,
    monthlyBase,
    addonFees,
    usageCharges,
    voipCosts,
    totalBill,
    consumerCount,
    emailUsage: { used: emailUsed, included: 0, overage: emailUsed, overageCharge: emailOverageCharge },
    smsUsage: { used: smsUsed, included: 0, overage: smsUsed, overageCharge: smsOverageCharge },
    aiAutoResponseUsage: { used: aiUsed, included: aiIncluded, overage: aiOverage, overageCharge: aiOverageCharge },
    addons: {
      documentSigning: hasDocumentSigning,
      documentSigningFee,
      aiAutoResponse: hasAiAutoResponse,
      aiAutoResponseFee,
      mobileAppBranding: hasMobileApp,
      mobileAppBrandingFee: mobileAppFee,
    },
    voipDetails,
    lineItems,
  };
}

/**
 * Compute a subscription invoice for an explicit billing period. Pulls usage from
 * event-level tracking, optionally maxed against the subscription's per-period
 * counters (useful for the current period where events may lag the counters).
 */
export async function computeSubscriptionBill(
  tenantId: string,
  plan: typeof subscriptionPlans.$inferSelect | null,
  periodStart: Date,
  periodEnd: Date,
  counters?: { emailsUsed?: number; smsUsed?: number },
): Promise<ComputedBill> {
  const monthlyBase = plan ? Number(plan.monthlyPriceCents) / 100 : 0;
  const planName = plan?.name ?? 'Base Plan';
  const isEnterprisePlan = plan?.slug === 'scale';

  const enabledAddons = await storage.getEnabledAddons(tenantId);
  const hasDocumentSigning = enabledAddons.includes('document_signing');
  const hasAiAutoResponse = enabledAddons.includes('ai_auto_response');
  const hasMobileApp = enabledAddons.includes('mobile_app_branding');

  const documentSigningFee = hasDocumentSigning ? DOCUMENT_SIGNING_ADDON_PRICE : 0;
  const aiAutoResponseFee = hasAiAutoResponse ? AI_AUTO_RESPONSE_ADDON_PRICE : 0;
  const mobileAppFee = (hasMobileApp && !isEnterprisePlan) ? MOBILE_APP_BRANDING_MONTHLY : 0;
  const addonFees = documentSigningFee + aiAutoResponseFee + mobileAppFee;

  const eventTotals = await storage.getMessagingUsageTotals(tenantId, periodStart, periodEnd);
  const emailUsed = Math.max(eventTotals.emailCount, counters?.emailsUsed ?? 0);
  const smsUsed = Math.max(eventTotals.smsSegments, counters?.smsUsed ?? 0);

  const includedEmails = plan?.includedEmails ?? 0;
  const includedSms = plan?.includedSms ?? 0;

  const emailOverage = Math.max(0, emailUsed - includedEmails);
  const smsOverage = Math.max(0, smsUsed - includedSms);
  const emailOverageCharge = round2(emailOverage * EMAIL_OVERAGE_RATE_PER_EMAIL);
  const smsOverageCharge = round2(smsOverage * SMS_OVERAGE_RATE_PER_SEGMENT);

  const planSlug = (plan?.slug as MessagingPlanId) ?? 'launch';
  const aiIncluded = AUTO_RESPONSE_INCLUDED_RESPONSES[planSlug] ?? 1000;
  let aiUsed = 0;
  let aiOverage = 0;
  let aiOverageCharge = 0;
  if (hasAiAutoResponse) {
    aiUsed = await countAiResponses(tenantId, periodStart, periodEnd);
    aiOverage = Math.max(0, aiUsed - aiIncluded);
    aiOverageCharge = round2(aiOverage * AUTO_RESPONSE_OVERAGE_PER_RESPONSE);
  }

  const usageCharges = round2(emailOverageCharge + smsOverageCharge + aiOverageCharge);
  const totalBill = round2(monthlyBase + addonFees + usageCharges);

  const consumerCount = await countConsumers(tenantId);

  const lineItems: InvoiceLineItem[] = [];
  if (monthlyBase > 0) lineItems.push({ description: `${planName} — Monthly Subscription`, amountCents: Math.round(monthlyBase * 100) });
  if (documentSigningFee > 0) lineItems.push({ description: 'Document Signing Add-on', amountCents: Math.round(documentSigningFee * 100) });
  if (aiAutoResponseFee > 0) lineItems.push({ description: 'AI Auto-Response Add-on', amountCents: Math.round(aiAutoResponseFee * 100) });
  if (mobileAppFee > 0) lineItems.push({ description: 'Mobile App Branding Add-on', amountCents: Math.round(mobileAppFee * 100) });

  lineItems.push({
    description: emailOverage > 0 ? 'Emails Sent (within plan)' : 'Emails Sent',
    amountCents: 0,
    quantity: emailUsed,
    unitLabel: `of ${includedEmails} included`,
  });
  if (emailOverage > 0) {
    lineItems.push({ description: 'Email Overage', amountCents: Math.round(emailOverageCharge * 100), quantity: emailOverage, unitLabel: 'emails over limit' });
  }

  lineItems.push({
    description: smsOverage > 0 ? 'SMS Segments Sent (within plan)' : 'SMS Segments Sent',
    amountCents: 0,
    quantity: smsUsed,
    unitLabel: `of ${includedSms} included`,
  });
  if (smsOverage > 0) {
    lineItems.push({ description: 'SMS Overage', amountCents: Math.round(smsOverageCharge * 100), quantity: smsOverage, unitLabel: 'segments over limit' });
  }

  if (hasAiAutoResponse) {
    lineItems.push({
      description: aiOverage > 0 ? 'AI Responses (within plan)' : 'AI Responses',
      amountCents: 0,
      quantity: aiUsed,
      unitLabel: `of ${aiIncluded} included`,
    });
    if (aiOverage > 0) {
      lineItems.push({ description: 'AI Response Overage', amountCents: Math.round(aiOverageCharge * 100), quantity: aiOverage, unitLabel: 'responses over limit' });
    }
  }

  return {
    hasBillableActivity: true,
    monthlyBase,
    addonFees,
    usageCharges,
    voipCosts: 0,
    totalBill,
    consumerCount,
    emailUsage: { used: emailUsed, included: includedEmails, overage: emailOverage, overageCharge: emailOverageCharge },
    smsUsage: { used: smsUsed, included: includedSms, overage: smsOverage, overageCharge: smsOverageCharge },
    aiAutoResponseUsage: { used: aiUsed, included: aiIncluded, overage: aiOverage, overageCharge: aiOverageCharge },
    addons: {
      documentSigning: hasDocumentSigning,
      documentSigningFee,
      aiAutoResponse: hasAiAutoResponse,
      aiAutoResponseFee,
      mobileAppBranding: hasMobileApp,
      mobileAppBrandingFee: mobileAppFee,
    },
    voipDetails: null,
    lineItems,
  };
}

/** Collision-resistant invoice number. */
export function generateInvoiceNumber(tenantId: string): string {
  return `INV-${tenantId.substring(0, 8)}-${Date.now().toString(36)}-${nanoid(8)}`;
}
