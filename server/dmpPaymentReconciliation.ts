export interface NormalizedDmpPayment {
  date: string | null;
  amountCents: number;
  status: string;
  transactionId: string | null;
}

const inactivePaymentStatus = /declin|cancel|void|nsf|charge.?back|refund|revers|fail|return/i;
const postedPaymentStatus = /posted|paid|complete|success|settled/i;

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly) return dateOnly[1];

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeDmpAmountCents(payment: any): number {
  // DMP's own write contract (insert_payments_external/insertPaymentArrangement)
  // takes a dollar string under paymentamount/payment_amount. Its read
  // contract (getpayments) returns the same value already in integer cents
  // under `amount`, since that's how it's stored. These are not the same
  // unit and must not share one "multiply by 100" rule, or a real cents
  // value is inflated 100x.
  const dollarAmount = payment?.paymentamount ?? payment?.payment_amount;
  if (dollarAmount !== undefined && dollarAmount !== null) {
    const parsed = Number(dollarAmount);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }
  const centsAmount = Number(payment?.amount ?? 0);
  return Number.isFinite(centsAmount) ? Math.round(centsAmount) : 0;
}

export function normalizeDmpPayment(payment: any): NormalizedDmpPayment {
  return {
    // DMP's getpayments response uses the camelCase key `paymentDate` - check
    // it first since it's the confirmed real key; the other spellings are
    // kept for tolerance against other DMP installs/response variants.
    date: normalizeDate(
      payment?.paymentDate ??
        payment?.paymentdate ??
        payment?.payment_date ??
        payment?.date ??
        payment?.scheduleddate ??
        payment?.scheduled_date,
    ),
    amountCents: normalizeDmpAmountCents(payment),
    status: String(
      payment?.paymentstatus ?? payment?.payment_status ?? payment?.status ?? "",
    ).trim(),
    transactionId: String(
      payment?.transactionid ?? payment?.transaction_id ?? payment?.reference ?? "",
    ).trim() || null,
  };
}

/** True only for DMP records that represent a successfully posted payment. */
export function isPostedDmpPayment(payment: NormalizedDmpPayment): boolean {
  return payment.amountCents > 0 && payment.date !== null &&
    postedPaymentStatus.test(payment.status) && !inactivePaymentStatus.test(payment.status);
}

/**
 * Returns the DMP record satisfying a Chain installment on the given day.
 * Pending/scheduled records count too: DMP owns those charges, so Chain must not
 * submit a competing charge. Failed, reversed, and cancelled records do not.
 */
export function findMatchingDmpPayment(
  payments: any[] | null | undefined,
  paymentDate: string,
  amountCents: number,
): NormalizedDmpPayment | null {
  if (!Array.isArray(payments)) return null;

  return payments
    .map(normalizeDmpPayment)
    .find(
      payment =>
        payment.date === paymentDate &&
        payment.amountCents === amountCents &&
        !inactivePaymentStatus.test(payment.status),
    ) ?? null;
}

/**
 * Earliest DMP-side payment on or after `today` that is still pending/
 * scheduled (not declined/cancelled/reversed). Once DMP owns an arrangement
 * it is the source of truth for when the next installment actually runs, so
 * Chain's mirrored `nextPaymentDate` should track this value rather than the
 * date computed when the arrangement was first created.
 */
export function nextPendingDmpPaymentDate(
  payments: any[] | null | undefined,
  today: string,
): string | null {
  if (!Array.isArray(payments)) return null;

  const upcomingDates = payments
    .map(normalizeDmpPayment)
    .filter(payment => payment.date !== null && payment.date >= today && !inactivePaymentStatus.test(payment.status))
    .map(payment => payment.date as string);

  if (!upcomingDates.length) return null;
  return upcomingDates.sort()[0];
}

export interface DmpArrangementSummary {
  arrangementId: string;
  amountCents: number;
  nextPaymentDate: string;
  remainingPayments: number;
  startDate: string;
  frequency: "weekly" | "biweekly" | "monthly";
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function inferFrequency(sortedPendingDates: string[]): DmpArrangementSummary["frequency"] {
  if (sortedPendingDates.length < 2) return "monthly";
  const gap = daysBetween(sortedPendingDates[0], sortedPendingDates[1]);
  if (gap >= 6 && gap <= 8) return "weekly";
  if (gap >= 13 && gap <= 15) return "biweekly";
  return "monthly";
}

/**
 * Finds a payment arrangement a DMP collector created directly in DMP (via
 * its own /api/debtors/:id/payment-arrangements feature) and summarizes it
 * the way Chain needs to mirror it locally. DMP-native rows in one
 * arrangement share an `arrangementId`; rows Chain itself pushed to DMP do
 * not carry one (Chain already has its own local record for those), so this
 * only ever surfaces arrangements Chain does not already know about.
 *
 * When more than one arrangementId still has pending installments, the one
 * with the most remaining payments is treated as the active arrangement.
 */
export function deriveDmpArrangement(
  payments: any[] | null | undefined,
  today: string,
): DmpArrangementSummary | null {
  if (!Array.isArray(payments)) return null;

  const groups = new Map<string, { normalized: NormalizedDmpPayment }[]>();
  for (const raw of payments) {
    const arrangementId = raw?.arrangementId ?? raw?.arrangementid ?? raw?.arrangement_id;
    if (typeof arrangementId !== "string" || !arrangementId.trim()) continue;
    const normalized = normalizeDmpPayment(raw);
    const bucket = groups.get(arrangementId) ?? [];
    bucket.push({ normalized });
    groups.set(arrangementId, bucket);
  }

  let best: DmpArrangementSummary | null = null;
  for (const [arrangementId, rows] of Array.from(groups.entries())) {
    const allDated = rows.map((r: { normalized: NormalizedDmpPayment }) => r.normalized).filter(p => p.date !== null) as (NormalizedDmpPayment & { date: string })[];
    if (!allDated.length) continue;

    const pending = allDated
      .filter(p => p.date >= today && !inactivePaymentStatus.test(p.status))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!pending.length) continue;

    const startDate = allDated.map(p => p.date).sort()[0];
    const summary: DmpArrangementSummary = {
      arrangementId,
      amountCents: pending[0].amountCents,
      nextPaymentDate: pending[0].date,
      remainingPayments: pending.length,
      startDate,
      frequency: inferFrequency(pending.map(p => p.date)),
    };

    if (!best || summary.remainingPayments > best.remainingPayments) {
      best = summary;
    }
  }

  return best;
}
