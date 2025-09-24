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

export const messagingPlans: Record<MessagingPlanId, MessagingPlan> = {
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

export const messagingPlanList: MessagingPlan[] = Object.values(messagingPlans);
