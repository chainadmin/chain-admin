import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildConsumerArrangementVisibility,
  ensureTenantAccountOwnership,
  type AccountWithArrangement,
} from "../helpers";
import type { ArrangementOption, ConsumerArrangement } from "@shared/schema";

function makeArrangement(overrides: Partial<ConsumerArrangement> = {}): ConsumerArrangement {
  return {
    id: "arr-1",
    tenantId: "tenant-1",
    consumerId: "consumer-1",
    accountId: "account-1",
    arrangementOptionId: "opt-1",
    customMonthlyPaymentCents: 25000,
    customTermMonths: 12,
    customDownPaymentCents: null,
    status: "active",
    notes: "Preferred terms",
    assignedAt: new Date("2024-01-01T00:00:00.000Z"),
    activatedAt: new Date("2024-01-02T00:00:00.000Z"),
    completedAt: null,
    cancelledAt: null,
    statusChangedAt: new Date("2024-01-02T00:00:00.000Z"),
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function makeOption(overrides: Partial<ArrangementOption> = {}): ArrangementOption {
  return {
    id: "opt-1",
    tenantId: "tenant-1",
    name: "Standard Plan",
    description: "Structured payments",
    minBalance: 0,
    maxBalance: 100_000,
    monthlyPaymentMin: 10_000,
    monthlyPaymentMax: 30_000,
    maxTermMonths: 24,
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("ensureTenantAccountOwnership allows matching tenants", () => {
  assert.doesNotThrow(() => ensureTenantAccountOwnership("tenant-1", "tenant-1"));
});

test("ensureTenantAccountOwnership rejects mismatched tenants", () => {
  assert.throws(
    () => ensureTenantAccountOwnership("tenant-1", "tenant-2"),
    /Account does not belong to tenant/
  );
});

test("buildConsumerArrangementVisibility surfaces the active assignment and filters remaining options", () => {
  const activeArrangement = makeArrangement();
  const optionOne = makeOption();
  const optionTwo = makeOption({ id: "opt-2", name: "Extended Plan" });

  const accounts: AccountWithArrangement[] = [
    {
      id: "account-1",
      tenantId: "tenant-1",
      balanceCents: 75_000,
      creditor: "Atlas Bank",
      accountNumber: "ACC-001",
      arrangement: { ...activeArrangement, option: optionOne },
    },
    {
      id: "account-2",
      tenantId: "tenant-1",
      balanceCents: 12_000,
      creditor: "Metro Finance",
      accountNumber: "ACC-002",
      arrangement: null,
    },
  ];

  const result = buildConsumerArrangementVisibility(accounts, [optionOne, optionTwo]);

  assert.ok(result.assigned, "expected an assigned arrangement to be returned");
  assert.equal(result.assigned?.account.id, "account-1");
  assert.equal(result.assigned?.option?.id, "opt-1");
  assert.equal(result.available.length, 1);
  assert.equal(result.available[0].id, "opt-2");
});

test("buildConsumerArrangementVisibility hides cancelled assignments and keeps all options available", () => {
  const cancelledArrangement = makeArrangement({
    id: "arr-2",
    status: "cancelled",
    cancelledAt: new Date("2024-02-01T00:00:00.000Z"),
  });
  const optionOne = makeOption();
  const optionTwo = makeOption({ id: "opt-2", name: "Deferred Plan" });

  const accounts: AccountWithArrangement[] = [
    {
      id: "account-3",
      tenantId: "tenant-1",
      balanceCents: 42_000,
      creditor: "Summit Lending",
      accountNumber: "ACC-003",
      arrangement: { ...cancelledArrangement, option: optionOne },
    },
  ];

  const result = buildConsumerArrangementVisibility(accounts, [optionOne, optionTwo]);

  assert.equal(result.assigned, null);
  assert.equal(result.available.length, 2);
  assert.deepEqual(
    result.available.map(option => option.id).sort(),
    ["opt-1", "opt-2"].sort()
  );
});
