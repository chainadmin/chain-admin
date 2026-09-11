import assert from "node:assert/strict";
import test from "node:test";
import { findMatchingDmpPayment, isPostedDmpPayment, normalizeDmpPayment, nextPendingDmpPaymentDate, deriveDmpArrangement } from "./dmpPaymentReconciliation";

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

// This is DMP's actual, confirmed getpayments response shape: camelCase
// paymentDate, and amount already in integer cents (its payments table
// stores amount as cents - it is not a dollar string like the write-side
// paymentamount field DMP's insert_payments_external accepts).
test("normalizes DMP's real getpayments response shape", () => {
  assert.deepEqual(
    normalizeDmpPayment({
      id: "p1",
      transactionid: "dmp-456",
      amount: 5000,
      paymentDate: "2026-08-19",
      paymentMethod: "card",
      status: "SCHEDULED",
    }),
    { date: "2026-08-19", amountCents: 5000, status: "SCHEDULED", transactionId: "dmp-456" },
  );
});

test("matches completed and scheduled DMP installments for the same date and amount", () => {
  assert.ok(findMatchingDmpPayment(
    [{ paymentdate: "2026-08-19", paymentamount: 50, paymentstatus: "COMPLETED" }],
    "2026-08-19",
    5000,
  ));
  // Real getpayments shape: camelCase paymentDate, cents under amount.
  assert.ok(findMatchingDmpPayment(
    [{ paymentDate: "2026-08-19", amount: 5000, status: "SCHEDULED" }],
    "2026-08-19",
    5000,
  ));
});

test("finds the earliest still-pending DMP payment on or after today", () => {
  const payments = [
    { paymentDate: "2026-08-05", amount: 5000, status: "POSTED" },
    { paymentDate: "2026-09-02", amount: 5000, status: "SCHEDULED" },
    { paymentDate: "2026-08-19", amount: 5000, status: "SCHEDULED" },
    { paymentDate: "2026-08-12", amount: 5000, status: "DECLINED" },
  ];
  assert.equal(nextPendingDmpPaymentDate(payments, "2026-08-10"), "2026-08-19");
  assert.equal(nextPendingDmpPaymentDate(payments, "2026-09-03"), null);
  assert.equal(nextPendingDmpPaymentDate(undefined, "2026-08-10"), null);
});

test("derives a DMP-native arrangement from grouped, dated installments", () => {
  const payments = [
    // Already-paid installment for the same arrangement - counts toward
    // startDate but not toward remainingPayments.
    { arrangementId: "arr-1", paymentDate: "2026-07-19", amount: 5000, status: "POSTED" },
    { arrangementId: "arr-1", paymentDate: "2026-08-19", amount: 5000, status: "SCHEDULED" },
    { arrangementId: "arr-1", paymentDate: "2026-09-19", amount: 5000, status: "SCHEDULED" },
    // A loose payment with no arrangementId - Chain pushed this one itself
    // and already has its own local record, so it must not be grouped in.
    { paymentDate: "2026-08-01", amount: 2500, status: "POSTED" },
  ];

  const arrangement = deriveDmpArrangement(payments, "2026-08-10");
  assert.ok(arrangement);
  assert.equal(arrangement!.arrangementId, "arr-1");
  assert.equal(arrangement!.amountCents, 5000);
  assert.equal(arrangement!.nextPaymentDate, "2026-08-19");
  assert.equal(arrangement!.remainingPayments, 2);
  assert.equal(arrangement!.startDate, "2026-07-19");
  assert.equal(arrangement!.frequency, "monthly");
});

test("ignores a fully completed DMP arrangement and picks the larger of two active ones", () => {
  const payments = [
    { arrangementId: "arr-done", paymentDate: "2026-07-01", amount: 1000, status: "POSTED" },
    { arrangementId: "arr-small", paymentDate: "2026-08-19", amount: 5000, status: "SCHEDULED" },
    { arrangementId: "arr-big", paymentDate: "2026-08-12", amount: 2500, status: "SCHEDULED" },
    { arrangementId: "arr-big", paymentDate: "2026-08-19", amount: 2500, status: "SCHEDULED" },
    { arrangementId: "arr-big", paymentDate: "2026-08-26", amount: 2500, status: "SCHEDULED" },
  ];

  const arrangement = deriveDmpArrangement(payments, "2026-08-10");
  assert.equal(arrangement!.arrangementId, "arr-big");
  assert.equal(arrangement!.remainingPayments, 3);
  assert.equal(arrangement!.frequency, "weekly");
});

test("does not match another amount, date, or an inactive payment", () => {
  const records = [
    { paymentdate: "2026-08-18", paymentamount: 50, paymentstatus: "COMPLETED" },
    { paymentdate: "2026-08-19", paymentamount: 40, paymentstatus: "COMPLETED" },
    { paymentdate: "2026-08-19", paymentamount: 50, paymentstatus: "DECLINED" },
  ];
  assert.equal(findMatchingDmpPayment(records, "2026-08-19", 5000), null);
});

test("identifies only successfully posted DMP payments for customer history", () => {
  for (const status of ["POSTED", "PAID", "COMPLETED", "SUCCESS", "SETTLED"]) {
    assert.equal(isPostedDmpPayment(normalizeDmpPayment({
      paymentdate: "2026-08-19",
      paymentamount: 50,
      paymentstatus: status,
    })), true);
  }

  for (const status of ["PENDING", "SCHEDULED", "DECLINED", "REFUNDED", "REVERSED"]) {
    assert.equal(isPostedDmpPayment(normalizeDmpPayment({
      paymentdate: "2026-08-19",
      paymentamount: 50,
      paymentstatus: status,
    })), false);
  }
});
