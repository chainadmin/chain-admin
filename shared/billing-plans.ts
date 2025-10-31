import type { BusinessType } from './terminology';

export type MessagingPlanId = "launch" | "growth" | "pro" | "scale";

export interface MessagingPlan {
  id: MessagingPlanId;
  name: string;
  price: number;
  includedEmails: number;
  includedSmsSegments: number;
}

export const EMAIL_OVERAGE_RATE_PER_THOUSAND = 2.5;
export const EMAIL_OVERAGE_RATE_PER_EMAIL = EMAIL_OVERAGE_RATE_PER_THOUSAND / 1000;
export const SMS_OVERAGE_RATE_PER_SEGMENT = 0.03;

// Base plans (Call Center) - Full communication volume
const callCenterPlans: Record<MessagingPlanId, MessagingPlan> = {
  launch: {
    id: "launch",
    name: "Launch",
    price: 300,
    includedEmails: 5_000,
    includedSmsSegments: 500,
  },
  growth: {
    id: "growth",
    name: "Growth",
    price: 500,
    includedEmails: 25_000,
    includedSmsSegments: 2_500,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 1_000,
    includedEmails: 100_000,
    includedSmsSegments: 10_000,
  },
  scale: {
    id: "scale",
    name: "Scale",
    price: 2_000,
    includedEmails: 250_000,
    includedSmsSegments: 25_000,
  },
};

// Property Management - 50% of call center (less outbound, more responsive)
const propertyManagementPlans: Record<MessagingPlanId, MessagingPlan> = {
  launch: {
    id: "launch",
    name: "Basic",
    price: 150,
    includedEmails: 2_500,
    includedSmsSegments: 250,
  },
  growth: {
    id: "growth",
    name: "Standard",
    price: 250,
    includedEmails: 12_500,
    includedSmsSegments: 1_250,
  },
  pro: {
    id: "pro",
    name: "Premium",
    price: 500,
    includedEmails: 50_000,
    includedSmsSegments: 5_000,
  },
  scale: {
    id: "scale",
    name: "Enterprise",
    price: 1_000,
    includedEmails: 125_000,
    includedSmsSegments: 12_500,
  },
};

// Subscription Provider - 70% of call center
const subscriptionProviderPlans: Record<MessagingPlanId, MessagingPlan> = {
  launch: {
    id: "launch",
    name: "Starter",
    price: 210,
    includedEmails: 3_500,
    includedSmsSegments: 350,
  },
  growth: {
    id: "growth",
    name: "Growth",
    price: 350,
    includedEmails: 17_500,
    includedSmsSegments: 1_750,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 700,
    includedEmails: 70_000,
    includedSmsSegments: 7_000,
  },
  scale: {
    id: "scale",
    name: "Scale",
    price: 1_400,
    includedEmails: 175_000,
    includedSmsSegments: 17_500,
  },
};

// Freelancer/Consultant - 25% of call center (minimal communication)
const freelancerPlans: Record<MessagingPlanId, MessagingPlan> = {
  launch: {
    id: "launch",
    name: "Solo",
    price: 75,
    includedEmails: 1_250,
    includedSmsSegments: 125,
  },
  growth: {
    id: "growth",
    name: "Studio",
    price: 125,
    includedEmails: 6_250,
    includedSmsSegments: 625,
  },
  pro: {
    id: "pro",
    name: "Agency",
    price: 250,
    includedEmails: 25_000,
    includedSmsSegments: 2_500,
  },
  scale: {
    id: "scale",
    name: "Network",
    price: 500,
    includedEmails: 62_500,
    includedSmsSegments: 6_250,
  },
};

// Billing/Service Company - 80% of call center
const billingServicePlans: Record<MessagingPlanId, MessagingPlan> = {
  launch: {
    id: "launch",
    name: "Starter",
    price: 240,
    includedEmails: 4_000,
    includedSmsSegments: 400,
  },
  growth: {
    id: "growth",
    name: "Professional",
    price: 400,
    includedEmails: 20_000,
    includedSmsSegments: 2_000,
  },
  pro: {
    id: "pro",
    name: "Business",
    price: 800,
    includedEmails: 80_000,
    includedSmsSegments: 8_000,
  },
  scale: {
    id: "scale",
    name: "Enterprise",
    price: 1_600,
    includedEmails: 200_000,
    includedSmsSegments: 20_000,
  },
};

// Business-type-specific plan collections
export const businessTypePlans: Record<BusinessType, Record<MessagingPlanId, MessagingPlan>> = {
  call_center: callCenterPlans,
  property_management: propertyManagementPlans,
  subscription_provider: subscriptionProviderPlans,
  freelancer_consultant: freelancerPlans,
  billing_service: billingServicePlans,
};

// Helper function to get plans for a specific business type
export function getPlansForBusinessType(businessType: BusinessType): Record<MessagingPlanId, MessagingPlan> {
  return businessTypePlans[businessType] || callCenterPlans;
}

export function getPlanListForBusinessType(businessType: BusinessType): MessagingPlan[] {
  return Object.values(getPlansForBusinessType(businessType));
}

// Deprecated: Use getPlansForBusinessType instead
// Kept for backward compatibility with existing code
export const messagingPlans = callCenterPlans;
export const messagingPlanList: MessagingPlan[] = Object.values(callCenterPlans);
