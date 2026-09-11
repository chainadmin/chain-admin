import assert from "node:assert/strict";
import test from "node:test";

import {
  formatUsPaymentDate,
  getUsPaymentDateKey,
  getUsRelativeDateLabel,
} from "../../lib/payment-dates";

test("payment date keys use US Eastern time rather than the UTC calendar day", () => {
  assert.equal(getUsPaymentDateKey("2026-09-12T02:30:00.000Z"), "2026-09-11");
  assert.equal(
    getUsRelativeDateLabel("2026-09-11", new Date("2026-09-12T02:30:00.000Z")),
    "Today",
  );
});

test("date-only payment schedules retain their intended calendar date", () => {
  assert.equal(formatUsPaymentDate("2026-09-11"), "Sep 11, 2026");
  assert.equal(
    getUsRelativeDateLabel("2026-09-10", new Date("2026-09-12T02:30:00.000Z")),
    "Yesterday",
  );
});
