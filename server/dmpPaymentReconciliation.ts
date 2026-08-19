export interface NormalizedDmpPayment {
  date: string | null;
  amountCents: number;
  status: string;
  transactionId: string | null;
}

const inactivePaymentStatus = /declin|cancel|void|nsf|charge.?back|refund|revers|fail|return/i;

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly) return dateOnly[1];

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function normalizeDmpPayment(payment: any): NormalizedDmpPayment {
  const amount = Number(
    payment?.paymentamount ?? payment?.payment_amount ?? payment?.amount ?? 0,
  );

  return {
    date: normalizeDate(
      payment?.paymentdate ??
        payment?.payment_date ??
        payment?.date ??
        payment?.scheduleddate ??
        payment?.scheduled_date,
    ),
    // DMP payment amounts are dollars in both its read and write APIs.
    amountCents: Number.isFinite(amount) ? Math.round(amount * 100) : 0,
    status: String(
      payment?.paymentstatus ?? payment?.payment_status ?? payment?.status ?? "",
    ).trim(),
    transactionId: String(
      payment?.transactionid ?? payment?.transaction_id ?? payment?.reference ?? "",
    ).trim() || null,
  };
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
