import { z } from "zod";

/** Legacy fields are accepted only at their inert values for old callers. */
export const chiamoVoipOnlyConversionFields = z.object({
  smsEnabled: z.literal(false).optional(),
  smsStatus: z.literal("NOT_REQUESTED").optional(),
  smsAllowance: z.literal(0).optional(),
  smsOverageMicros: z.literal(0).optional(),
});

/** Optional so omission never rewrites historical subscription SMS columns. */
export const chiamoVoipOnlyBillingFields = z.object({
  smsAddonEnabled: z.literal(false).optional(),
  smsAllowance: z.literal(0).optional(),
  smsOverageMicros: z.literal(0).optional(),
});

export const chiamoVoipOnlyServiceFields = z.object({
  smsEnabled: z.literal(false).optional(),
  smsStatus: z.literal("NOT_REQUESTED").optional(),
});