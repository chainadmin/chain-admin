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

export function calculateChiamoMonthlyService(planId: string, users: number, texting: boolean, customBasePriceCents?: number | null) {
  const plan = chiamoPlans.find(item => item.id === planId);
  if (!plan) return null;
  const basePriceCents = customBasePriceCents ?? plan.monthlyPriceCents;
  const additionalUsers = Math.max(0, users - plan.includedUsers);
  const additionalUserChargeCents = additionalUsers * plan.additionalUserPriceCents;
  const textingChargeCents = texting ? chiamoTextingAddon.monthlyPriceCents : 0;
  return { plan, basePriceCents, additionalUsers, additionalUserChargeCents, textingChargeCents, totalCents: basePriceCents + additionalUserChargeCents + textingChargeCents };
}
