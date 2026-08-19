import assert from "node:assert/strict";
import test from "node:test";
import { findMatchingDmpPayment, normalizeDmpPayment } from "./dmpPaymentReconciliation";

test("normalizes alternate DMP payment fields", () => {
  assert.deepEqual(
    normalizeDmpPayment({
      payment_date: "2026-08-19T14:00:00Z",
      payment_amount: "42.50",
      payment_status: "COMPLETED",
      transaction_id: "dmp-123",
    }),
    { date: "2026-08-19", amountCents: 4250, status: "COMPLETED", transactionId: "dmp-123" },
  );
});

test("matches completed and scheduled DMP installments for the same date and amount", () => {
  assert.ok(findMatchingDmpPayment(
    [{ paymentdate: "2026-08-19", paymentamount: 50, paymentstatus: "COMPLETED" }],
    "2026-08-19",
    5000,
  ));
  assert.ok(findMatchingDmpPayment(
    [{ scheduled_date: "2026-08-19", amount: "50.00", status: "SCHEDULED" }],
    "2026-08-19",
    5000,
  ));
});

test("does not match another amount, date, or an inactive payment", () => {
  const records = [
    { paymentdate: "2026-08-18", paymentamount: 50, paymentstatus: "COMPLETED" },
    { paymentdate: "2026-08-19", paymentamount: 40, paymentstatus: "COMPLETED" },
    { paymentdate: "2026-08-19", paymentamount: 50, paymentstatus: "DECLINED" },
  ];
  assert.equal(findMatchingDmpPayment(records, "2026-08-19", 5000), null);
});
