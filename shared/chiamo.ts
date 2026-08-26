export const CHIAMO_SUPPORT_EMAIL = "support@chiamoconnect.com";

export const chiamoPlans = [
  { id: "starter", name: "Starter", monthlyPriceCents: 19900, includedUsers: 3, additionalUserPriceCents: 2500, includedNumbers: 1, features: ["Business Calling", "1 Business Phone Number", "Web-Based Business Phone", "Incoming Calling", "Outgoing Calling", "Call Logs", "Voicemail", "Call Recording where currently supported", "Call Routing", "User Management"] },
  { id: "business", name: "Business", monthlyPriceCents: 39900, includedUsers: 7, additionalUserPriceCents: 2500, includedNumbers: 2, features: ["Business Calling", "2 Business Phone Numbers", "Web-Based Business Phone", "Incoming Calling", "Outgoing Calling", "Call Logs", "Voicemail", "Call Recording", "Call Routing", "IVR / Auto Attendant where currently supported", "Reporting", "Administrative User Management"] },
  { id: "professional", name: "Professional", monthlyPriceCents: 69900, includedUsers: 15, additionalUserPriceCents: 2000, includedNumbers: 3, features: ["Business Calling", "3 Business Phone Numbers", "Web-Based Business Phone", "Incoming Calling", "Outgoing Calling", "Call Logs", "Voicemail", "Call Recording", "Advanced Routing currently supported", "IVR / Auto Attendant where currently supported", "Enhanced Reporting", "Administrative Controls", "Priority Support"] },
] as const;

export const chiamoTextingAddon = { monthlyPriceCents: 12500, includedSegments: 3500 } as const;
export const chiamoLeadStatuses = ["NEW", "CONTACTED", "QUALIFIED", "SETUP_IN_PROGRESS", "CONVERTED", "NOT_INTERESTED", "CLOSED"] as const;
export const chiamoBillingStatuses = ["PENDING_SETUP", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"] as const;
export const chiamoSmsStatuses = ["NOT_REQUESTED", "REQUESTED", "REGISTRATION_REQUIRED", "REGISTRATION_PENDING", "ACTIVE", "FAILED", "SUSPENDED"] as const;
export const chiamoTestStatuses = ["NOT_TESTED", "PASSED", "FAILED"] as const;
export const chiamoUsageLevels = ["NORMAL", "ELEVATED", "HIGH", "REVIEW REQUIRED"] as const;

export type ChiamoBillingOverrides = {
  customBasePriceCents?: number | null;
  includedUsers?: number | null;
  additionalUserPriceCents?: number | null;
  additionalNumberChargeCents?: number;
  smsOverageCents?: number;
  customCharges?: Array<{ name: string; cents: number }>;
  discounts?: Array<{ name: string; cents: number }>;
};

/** The single source of truth for both customer and Global Admin estimates. */
export function calculateChiamoMonthlyService(planId: string, users: number, texting: boolean, overrides: ChiamoBillingOverrides | number | null = {}) {
  const plan = chiamoPlans.find(item => item.id === planId) || (planId === "enterprise" ? { id:"enterprise", name:"Enterprise", monthlyPriceCents:0, includedUsers:1, additionalUserPriceCents:2500, includedNumbers:0, features:["Negotiated service configuration"] } : undefined);
  if (!plan) return null;
  const options = typeof overrides === "number" ? { customBasePriceCents: overrides } : (overrides || {});
  const basePriceCents = options.customBasePriceCents ?? plan.monthlyPriceCents;
  const includedUsers = options.includedUsers ?? plan.includedUsers;
  const additionalUsers = Math.max(0, users - includedUsers);
  const additionalUserChargeCents = additionalUsers * (options.additionalUserPriceCents ?? plan.additionalUserPriceCents);
  const textingChargeCents = texting ? chiamoTextingAddon.monthlyPriceCents : 0;
  const customChargesCents = (options.customCharges || []).reduce((sum, charge) => sum + charge.cents, 0);
  const creditsCents = (options.discounts || []).reduce((sum, credit) => sum + credit.cents, 0);
  const smsOverageCents = options.smsOverageCents || 0;
  const additionalNumberChargeCents = options.additionalNumberChargeCents || 0;
  const totalCents = Math.max(0, basePriceCents + additionalUserChargeCents + textingChargeCents + smsOverageCents + additionalNumberChargeCents + customChargesCents - creditsCents);
  return { plan, basePriceCents, includedUsers, additionalUsers, additionalUserChargeCents, textingChargeCents, smsOverageCents, additionalNumberChargeCents, customChargesCents, creditsCents, totalCents };
}
