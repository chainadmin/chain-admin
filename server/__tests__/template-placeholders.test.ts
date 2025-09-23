import { test } from "node:test";
import assert from "node:assert/strict";
import type { ArrangementOption } from "@shared/schema";
import {
  buildArrangementSummary,
  enrichArrangement,
  replaceTemplateVariables,
} from "../templatePlaceholders";

const baseArrangement: ArrangementOption = {
  id: "plan-123",
  tenantId: "tenant-001",
  name: "Flexible Plan",
  description: "A flexible option for qualifying balances.",
  minBalance: 10000,
  maxBalance: 750000,
  monthlyPaymentMin: 5000,
  monthlyPaymentMax: 25000,
  maxTermMonths: 18,
  isActive: true,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
};

test("buildArrangementSummary generates a friendly overview", () => {
  const summary = buildArrangementSummary(baseArrangement);
  assert.equal(
    summary,
    "Monthly payments between $50.00 - $250.00 for balances $100.00 - $7500.00 up to 18 months.",
  );
});

test("enrichArrangement derives formatted fields", () => {
  const enriched = enrichArrangement(baseArrangement);
  assert.ok(enriched);
  assert.equal(enriched?.monthlyRange, "$50.00 - $250.00");
  assert.equal(enriched?.balanceRange, "$100.00 - $7500.00");
  assert.equal(enriched?.maxTermLabel, "18 months");
  assert.ok(enriched?.details?.includes("Plan: Flexible Plan"));
  assert.ok(enriched?.details?.includes("Maximum term: 18 months"));
});

test("replaceTemplateVariables injects arrangement placeholders", () => {
  const arrangementContext = enrichArrangement(baseArrangement);
  assert.ok(arrangementContext, "Arrangement context should be available");

  const template = [
    "{{arrangementName}}",
    "{{arrangementSummary}}",
    "{{arrangementMonthlyRange}}",
    "{{arrangementBalanceRange}}",
    "{{arrangementMaxTermLabel}}",
    "{{arrangementDetails}}",
  ].join("|");

  const output = replaceTemplateVariables(
    template,
    { firstName: "Avery" },
    null,
    { slug: "demo-agency" },
    { arrangement: arrangementContext },
  );

  const [name, summary, monthlyRange, balanceRange, maxTermLabel, details] = output.split("|");

  assert.equal(name, "Flexible Plan");
  assert.match(summary, /Monthly payments between/);
  assert.equal(monthlyRange, "$50.00 - $250.00");
  assert.equal(balanceRange, "$100.00 - $7500.00");
  assert.equal(maxTermLabel, "18 months");
  assert.ok(details.includes("Flexible Plan"));
  assert.ok(details.includes("Maximum term: 18 months"));
});
