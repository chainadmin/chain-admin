export function paymentAuditDate(payment: any): Date | null {
  const value = payment.processedAt || payment.createdAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function paymentsForMonth(payments: any[], month: string): any[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  return payments.filter((payment) => {
    const date = paymentAuditDate(payment);
    if (!date) return false;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === month;
  });
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildPaymentAuditCsv(payments: any[]): string {
  const headers = ["Date", "Consumer", "Email", "Account", "Status", "Method", "Amount", "Transaction ID"];
  const rows = payments.map((payment) => {
    const date = paymentAuditDate(payment);
    return [
      date?.toISOString() || "",
      payment.consumerName,
      payment.consumerEmail,
      payment.accountCreditor,
      payment.status,
      payment.paymentMethod,
      ((payment.amountCents || 0) / 100).toFixed(2),
      payment.transactionId,
    ].map(csvCell).join(",");
  });
  return [headers.map(csvCell).join(","), ...rows].join("\n");
}
