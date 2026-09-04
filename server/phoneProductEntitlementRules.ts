export const phoneBillingOwners = ["CHAIN", "CHIAMO"] as const;
export type PhoneBillingOwner = typeof phoneBillingOwners[number];

export const phoneProductLifecycleStatuses = ["ACTIVE", "SUSPENDED", "CANCELLED"] as const;
export type PhoneProductLifecycleStatus = typeof phoneProductLifecycleStatuses[number];

/**
 * Billing statuses before ACTIVE are deliberately suspended rather than
 * activated: a missing or unfamiliar source status must never enable billing.
 */
export function lifecycleFromChiamoBillingStatus(
  billingStatus: string | null | undefined,
): PhoneProductLifecycleStatus {
  switch (billingStatus?.trim().toUpperCase()) {
    case "ACTIVE":
      return "ACTIVE";
    case "CANCELLED":
      return "CANCELLED";
    case "SUSPENDED":
    case "PAST_DUE":
    case "PENDING":
    case "PENDING_SETUP":
    default:
      return "SUSPENDED";
  }
}

export function legacyPhoneBillingOwner(hasChiamoSubscription: boolean): PhoneBillingOwner {
  return hasChiamoSubscription ? "CHIAMO" : "CHAIN";
}

export function isPhoneEntitlementBillable(entitlement: {
  billingOwner: PhoneBillingOwner;
  lifecycleStatus: PhoneProductLifecycleStatus;
  enabled: boolean;
}): boolean {
  return entitlement.lifecycleStatus === "ACTIVE" && entitlement.enabled;
}

export function isChainPhoneEntitlementBillable(entitlement: {
  billingOwner: PhoneBillingOwner;
  lifecycleStatus: PhoneProductLifecycleStatus;
  enabled: boolean;
}): boolean {
  return entitlement.billingOwner === "CHAIN" && isPhoneEntitlementBillable(entitlement);
}

export function canUseLegacyChainPhoneControls(billingOwner: PhoneBillingOwner): boolean {
  return billingOwner === "CHAIN";
}

export function resolveChiamoPhoneState(input: {
  lifecycleStatus: PhoneProductLifecycleStatus;
  currentEntitlementEnabled?: boolean | null;
  currentServiceVoiceEnabled?: boolean | null;
  currentServiceAccountActive?: boolean | null;
  requestedVoiceEnabled?: boolean;
  requestedAccountActive?: boolean;
}) {
  const voiceConfigured = input.requestedVoiceEnabled
    ?? input.currentServiceVoiceEnabled
    ?? input.currentEntitlementEnabled
    ?? false;
  const desiredAccountActive = input.requestedAccountActive ?? (
    input.currentEntitlementEnabled !== null && input.currentEntitlementEnabled !== undefined
      ? (voiceConfigured ? input.currentEntitlementEnabled : input.currentServiceAccountActive ?? true)
      : input.currentServiceAccountActive ?? true
  );
  const entitlementEnabled = voiceConfigured && desiredAccountActive;
  return {
    voiceConfigured,
    desiredAccountActive,
    entitlementEnabled,
    operationalAccountActive: input.lifecycleStatus === "ACTIVE" && desiredAccountActive,
    allowed: input.lifecycleStatus === "ACTIVE" && entitlementEnabled,
  };
}