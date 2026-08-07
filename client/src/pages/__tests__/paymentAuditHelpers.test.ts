import test from "node:test";
import assert from "node:assert/strict";
import { buildPaymentAuditCsv, paymentsForMonth } from "../paymentAuditHelpers";

test("paymentsForMonth uses processed date and includes every status", () => {
  const payments = [
    { id: "1", status: "completed", createdAt: "2026-01-01T00:00:00Z", processedAt: "2026-02-03T12:00:00Z" },
    { id: "2", status: "failed", createdAt: "2026-02-28T12:00:00Z" },
    { id: "3", status: "completed", createdAt: "2026-03-01T00:00:00Z" },
  ];
  assert.deepEqual(paymentsForMonth(payments, "2026-02").map((p) => p.id), ["1", "2"]);
});

test("buildPaymentAuditCsv formats cents and escapes audit fields", () => {
  const csv = buildPaymentAuditCsv([{ amountCents: 12345, consumerName: 'Doe, "Jane"', status: "completed" }]);
  assert.match(csv, /"123\.45"/);
  assert.match(csv, /"Doe, ""Jane"""/);
});
