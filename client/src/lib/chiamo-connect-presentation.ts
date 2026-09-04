export type VoiceEntitlementStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED";
export type VoiceBillingOwner = "CHAIN" | "CHIAMO";

export type VoicePresentation = {
  label: string;
  detail: string;
  tone: "active" | "attention" | "muted";
  action: "open-phone" | "enable" | "contact-admin" | "contact-chiamo" | "none";
};

export function getVoicePresentation(input: {
  billingOwner?: VoiceBillingOwner;
  entitlementStatus?: VoiceEntitlementStatus;
  voipEnabled?: boolean;
  isOwner?: boolean;
  isLoading?: boolean;
  hasError?: boolean;
}): VoicePresentation {
  if (input.isLoading) {
    return { label: "CHECKING", detail: "Checking your company calling access.", tone: "muted", action: "none" };
  }
  if (input.hasError || !input.billingOwner) {
    return { label: "UNAVAILABLE", detail: "We could not verify company calling access. Try again shortly.", tone: "attention", action: "none" };
  }
  const status = input.entitlementStatus;
  if (input.billingOwner === "CHIAMO") {
    if (status === "ACTIVE" && input.voipEnabled) {
      return { label: "ACTIVE", detail: "Managed through your Chiamo Connect subscription.", tone: "active", action: "open-phone" };
    }
    if (status === "SUSPENDED") {
      return { label: "SUSPENDED", detail: "Your Chiamo Connect service is temporarily unavailable. Contact Chiamo Connect support.", tone: "attention", action: "contact-chiamo" };
    }
    return { label: "UNAVAILABLE", detail: "Chiamo Connect service is not active for this company. Contact Chiamo Connect support.", tone: "muted", action: "contact-chiamo" };
  }
  if (status === "ACTIVE" && input.voipEnabled) {
    return { label: "ACTIVE", detail: "Calling is ready for your authorized team members.", tone: "active", action: "open-phone" };
  }
  if (input.isOwner) {
    return { label: status === "SUSPENDED" ? "SUSPENDED" : "UNAVAILABLE", detail: "Activate calling for this company to configure numbers and access.", tone: "attention", action: "enable" };
  }
  return { label: status === "SUSPENDED" ? "SUSPENDED" : "UNAVAILABLE", detail: "An account owner must activate calling before your team can use it.", tone: "muted", action: "contact-admin" };
}

export function canShowChainVoiceCommerce(billingOwner?: VoiceBillingOwner): boolean {
  return billingOwner === "CHAIN";
}