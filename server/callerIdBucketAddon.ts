import { CALLER_ID_BUCKET_ADDON_CHARGE_NAME } from "@shared/chiamo-schema";

export type CallerIdBucketAddonStatus = "REQUESTED" | "APPROVED" | "DENIED" | "CANCELLED";

/** No row at all is treated the same as never having requested the add-on. */
export function canRequestCallerIdBucketAddon(currentStatus: CallerIdBucketAddonStatus | null | undefined): boolean {
  return currentStatus == null || currentStatus === "DENIED" || currentStatus === "CANCELLED";
}

/** The per-number bucket toggle, and outbound bucket caller-ID matching, only
 * work once a company has explicitly requested this paid add-on and Global
 * Admin has approved it. Neither a pending request nor a past denial/
 * cancellation is enough. */
export function callerIdBucketFeatureAllowed(currentStatus: CallerIdBucketAddonStatus | null | undefined): boolean {
  return currentStatus === "APPROVED";
}

export type CustomCharge = { name: string; cents: number };

/** Adds or updates the add-on's named recurring charge, leaving every other
 * custom charge on the subscription untouched. */
export function withCallerIdBucketAddonCharge(charges: CustomCharge[], monthlyPriceCents: number): CustomCharge[] {
  const withoutAddon = charges.filter(charge => charge.name !== CALLER_ID_BUCKET_ADDON_CHARGE_NAME);
  return [...withoutAddon, { name: CALLER_ID_BUCKET_ADDON_CHARGE_NAME, cents: monthlyPriceCents }];
}

/** Removes the add-on's charge (denial, cancellation) without touching any
 * other custom charge on the subscription. */
export function withoutCallerIdBucketAddonCharge(charges: CustomCharge[]): CustomCharge[] {
  return charges.filter(charge => charge.name !== CALLER_ID_BUCKET_ADDON_CHARGE_NAME);
}

export class CallerIdBucketAddonRequestError extends Error {
  constructor(
    public readonly status: 400 | 409,
    public readonly code: "AGREEMENT_REQUIRED" | "ALREADY_REQUESTED",
    message: string,
  ) {
    super(message);
    this.name = "CallerIdBucketAddonRequestError";
  }
}

/** Validates a company's request to enable the add-on before any database
 * write: consent is mandatory, and an existing pending/approved request
 * cannot be silently re-requested. */
export function validateCallerIdBucketAddonRequest(input: {
  agreed: unknown;
  currentStatus: CallerIdBucketAddonStatus | null | undefined;
}): void {
  if (input.agreed !== true) {
    throw new CallerIdBucketAddonRequestError(
      400,
      "AGREEMENT_REQUIRED",
      "You must agree to the monthly charge before requesting this feature.",
    );
  }
  if (!canRequestCallerIdBucketAddon(input.currentStatus)) {
    throw new CallerIdBucketAddonRequestError(
      409,
      "ALREADY_REQUESTED",
      "A request for this feature is already pending or already approved.",
    );
  }
}
