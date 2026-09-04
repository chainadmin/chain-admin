import assert from "node:assert/strict";
import test from "node:test";
import { CHIAMO_SEPARATE_BILLING_NOTE, addPhoneOwnershipNotation } from "./billing";
import { buildChiamoInvoiceSnapshot, oneCalendarMonthEarlier, oneCalendarMonthLater } from "./chiamoInvoices";
import { generateInvoicePdf } from "./invoicePdf";
import { classifyInvoiceCustomer, isDeliveryClaimEligible, normalizeInvoiceRecipient, resolveInvoiceRecipient, sanitizeDeliveryError, shouldDeliverInvoice } from "./invoiceBranding";

test("classifies Chiamo-only without changing dual-product ownership", () => {
  assert.equal(classifyInvoiceCustomer({ chainCoreEnabled: false, chiamoConnectEnabled: true }), "CHIAMO_ONLY");
  assert.equal(classifyInvoiceCustomer({ chainCoreEnabled: true, chiamoConnectEnabled: true }), "CHAIN");
});

test("CHIAMO phone ownership removes Chain phone charges and adds one informational item", () => {
  const result = addPhoneOwnershipNotation([
    { description: "VoIP Phone System", amountCents: 1000 },
    { description: "Core service", amountCents: 2000 },
  ], "CHIAMO");
  assert.deepEqual(result, [
    { description: "Core service", amountCents: 2000 },
    { description: CHIAMO_SEPARATE_BILLING_NOTE, amountCents: 0 },
  ]);
  assert.equal(addPhoneOwnershipNotation(result, "CHIAMO").length, 2);
  const pdf = generateInvoicePdf({
    issuer: "CHAIN", invoiceNumber: "C-2", tenantName: "Acme", status: "pending",
    periodStart: new Date("2025-01-01"), periodEnd: new Date("2025-02-01"), dueDate: new Date("2025-02-01"),
    totalAmountCents: 2000, lineItems: result,
  }).toString("binary");
  assert.match(pdf, /Chiamo Connect phone service billed separately; not in Chain invoice/);
});

test("Chiamo calculation snapshots only configured monthly charges", () => {
  const snapshot = buildChiamoInvoiceSnapshot({
    tenantId: "tenant", planId: "starter", customBasePriceCents: null, includedUsers: 3,
    additionalUserPriceCents: 2500, additionalNumberPriceCents: 9999, smsAddonEnabled: true,
    smsAllowance: 3500, smsOverageMicros: 9999, customCharges: [{ name: "Managed setup", cents: 5000 }],
    discounts: [{ name: "Partner", cents: 1000 }], billingStatus: "ACTIVE", startDate: "2025-01-01",
    nextBillingDate: "2025-02-01", notes: null, updatedAt: new Date(),
  }, 5);
  assert.equal(snapshot.calculation.totalCents, 41400);
  assert.equal(snapshot.lineItems.some(item => /number|overage.*sms/i.test(item.description)), false);
  assert.deepEqual(snapshot.lineItems.map(item => item.amountCents), [19900, 5000, 12500, 5000, -1000]);
});

test("Chiamo invoice snapshots normalize malformed money and always balance", () => {
  const snapshot = buildChiamoInvoiceSnapshot({
    tenantId: "tenant", planId: "enterprise", customBasePriceCents: 1000, includedUsers: 3,
    additionalUserPriceCents: 2500, additionalNumberPriceCents: 0, smsAddonEnabled: false,
    smsAllowance: 3500, smsOverageMicros: 0, customCharges: [{ name: "Invalid charge", cents: -500 }],
    discounts: [{ name: "Invalid credit", cents: -1000 }, { name: "Large credit", cents: 2500 }],
    billingStatus: "ACTIVE", startDate: "2025-01-01", nextBillingDate: "2025-02-01",
    notes: null, updatedAt: new Date(),
  }, 1);
  assert.equal(snapshot.calculation.totalCents, 0);
  assert.equal(snapshot.lineItems.reduce((sum, item) => sum + item.amountCents, 0), snapshot.calculation.totalCents);
  assert.deepEqual(snapshot.lineItems.map(item => item.amountCents), [1000, -1000]);
});

test("Chiamo PDF contains issuer-specific markers", () => {
  const pdf = generateInvoicePdf({
    issuer: "CHIAMO", invoiceNumber: "C-1", tenantName: "Acme", status: "pending",
    periodStart: new Date("2025-01-01"), periodEnd: new Date("2025-02-01"),
    dueDate: new Date("2025-02-01"), totalAmountCents: 19900, lineItems: [],
  }).toString("binary");
  assert.match(pdf, /CHIAMO CONNECT/);
  assert.doesNotMatch(pdf, /Chain Software Group/);
});

test("recipient precedence, validation, and delivery decisions are deterministic", () => {
  assert.equal(resolveInvoiceRecipient("CHAIN", "owner@example.com", " BILLING@Example.com "), "billing@example.com");
  assert.equal(resolveInvoiceRecipient("CHIAMO", "Owner@Example.com", "billing@example.com"), "owner@example.com");
  assert.equal(normalizeInvoiceRecipient("not-an-address"), null);
  assert.equal(shouldDeliverInvoice("sent"), false);
  assert.equal(shouldDeliverInvoice("failed"), true);
  assert.doesNotMatch(sanitizeDeliveryError(new Error("token=abc user@example.com\nfailed")), /abc|user@example/);
});

test("delivery claims exclude sent and fresh workers but allow stale recovery", () => {
  const now = new Date("2025-02-01T12:00:00Z");
  assert.equal(isDeliveryClaimEligible("sent", null, now), false);
  assert.equal(isDeliveryClaimEligible("pending", null, now), true);
  assert.equal(isDeliveryClaimEligible("failed", now, now), true);
  assert.equal(isDeliveryClaimEligible("sending", new Date("2025-02-01T11:30:01Z"), now), false);
  assert.equal(isDeliveryClaimEligible("sending", new Date("2025-02-01T11:00:00Z"), now), true);
});

test("calendar month boundaries clamp safely", () => {
  assert.equal(oneCalendarMonthEarlier("2024-03-31"), "2024-02-29");
  assert.equal(oneCalendarMonthLater("2025-01-31"), "2025-02-28");
});