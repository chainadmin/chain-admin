import { z } from "zod";

const optionalPositiveMoney = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().finite().positive("Payment amount must be greater than zero").max(100_000_000).optional(),
);

const optionalPositiveInteger = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().int().positive("Number of payments must be greater than zero").max(1_200).optional(),
);

const optionalArrangementDate = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Arrangement start date must use YYYY-MM-DD")
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
    }, "Arrangement start date is invalid")
    .optional(),
);

export const documentTemplateSendSchema = z.object({
  consumerId: z.string().min(1, "Consumer ID is required"),
  accountId: z.preprocess(
    (value) => value === "" || value === "none" || value === null ? undefined : value,
    z.string().min(1).optional(),
  ),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(7),
  message: z.string().max(5_000).optional(),
  paymentAmount: optionalPositiveMoney,
  paymentFrequency: z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    z.enum(["weekly", "biweekly", "monthly"], {
      errorMap: () => ({ message: "Payment frequency must be weekly, biweekly, or monthly" }),
    }).optional(),
  ),
  numberOfPayments: optionalPositiveInteger,
  arrangementStartDate: optionalArrangementDate,
});

export type ArrangementOverride = {
  monthlyPaymentCents?: number;
  frequency?: "weekly" | "biweekly" | "monthly";
  numberOfPayments?: number;
  startDate?: string;
};

export function buildArrangementOverride(
  input: z.infer<typeof documentTemplateSendSchema>,
): ArrangementOverride | undefined {
  const override: ArrangementOverride = {};

  if (input.paymentAmount !== undefined) {
    override.monthlyPaymentCents = Math.round(input.paymentAmount * 100);
  }
  if (input.paymentFrequency !== undefined) {
    override.frequency = input.paymentFrequency;
  }
  if (input.numberOfPayments !== undefined) {
    override.numberOfPayments = input.numberOfPayments;
  }
  if (input.arrangementStartDate !== undefined) {
    override.startDate = input.arrangementStartDate;
  }

  return Object.keys(override).length > 0 ? override : undefined;
}

export function mergeArrangementOverride(
  existing: Record<string, unknown> | null | undefined,
  override: ArrangementOverride | undefined,
): Record<string, unknown> | null {
  if (!override) {
    return existing ?? null;
  }

  return { ...(existing ?? {}), ...override };
}