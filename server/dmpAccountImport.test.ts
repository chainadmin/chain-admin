import assert from "node:assert/strict";
import test from "node:test";
import { importDmpAccounts } from "./dmpAccountImport";

function fakeStorage(existingAccount: any) {
  const updates: any[] = [];
  return {
    storage: {
      getAccountsByTenant: async () => [existingAccount],
      updateAccount: async (id: string, patch: any) => {
        updates.push({ id, patch });
        return { ...existingAccount, ...patch };
      },
      getConsumerByEmailAndTenant: async () => undefined,
      getConsumerByPhoneAndTenant: async () => undefined,
      findConsumersByNameAndTenant: async () => [],
      createConsumer: async () => ({ id: "consumer-new" }),
      createAccount: async () => ({ id: "account-new" }),
    },
    updates,
  };
}

test("a sync row missing balance keeps the account's existing balance instead of zeroing it", async () => {
  const existing = {
    id: "account-1",
    filenumber: "940",
    balanceCents: 111180,
    originalBalanceCents: 197062,
    status: "active",
    creditor: "Acme",
    additionalData: {},
  };
  const { storage, updates } = fakeStorage(existing);

  await importDmpAccounts(storage as any, "tenant-1", [
    {
      filenumber: "940",
      // No `balance` field on this row - simulating a malformed/incomplete
      // sync response for one account in the batch.
      status: "active",
    },
  ]);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.balanceCents, 111180);
});

test("a sync row with a real balance still updates the account normally", async () => {
  const existing = {
    id: "account-1",
    filenumber: "940",
    balanceCents: 111180,
    originalBalanceCents: 197062,
    status: "active",
    creditor: "Acme",
    additionalData: {},
  };
  const { storage, updates } = fakeStorage(existing);

  await importDmpAccounts(storage as any, "tenant-1", [
    { filenumber: "940", balance: 95380, status: "active" },
  ]);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.balanceCents, 95380);
});

test("a sync row reporting a genuine zero balance is still applied, not treated as missing", async () => {
  const existing = {
    id: "account-1",
    filenumber: "940",
    balanceCents: 111180,
    originalBalanceCents: 197062,
    status: "active",
    creditor: "Acme",
    additionalData: {},
  };
  const { storage, updates } = fakeStorage(existing);

  await importDmpAccounts(storage as any, "tenant-1", [
    { filenumber: "940", balance: 0, status: "paid" },
  ]);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.balanceCents, 0);
});

test("with no originalBalance on the sync row, originalBalanceCents falls back to the current balance - never the account's previously stored original balance", async () => {
  const existing = {
    id: "account-1",
    filenumber: "940",
    balanceCents: 111180,
    originalBalanceCents: 197062,
    status: "active",
    creditor: "Acme",
    additionalData: {},
  };
  const { storage, updates } = fakeStorage(existing);

  // Chain's bulk sync no longer sends originalBalance at all, so this is the
  // shape every real sync row now has.
  await importDmpAccounts(storage as any, "tenant-1", [
    { filenumber: "940", balance: 95380, status: "active" },
  ]);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.originalBalanceCents, 95380);
  assert.notEqual(updates[0].patch.originalBalanceCents, existing.originalBalanceCents);
});

test("an originalBalance the sync row does provide is still used as-is", async () => {
  const existing = {
    id: "account-1",
    filenumber: "940",
    balanceCents: 111180,
    originalBalanceCents: 197062,
    status: "active",
    creditor: "Acme",
    additionalData: {},
  };
  const { storage, updates } = fakeStorage(existing);

  await importDmpAccounts(storage as any, "tenant-1", [
    { filenumber: "940", balance: 95380, originalBalance: 197062, status: "active" },
  ]);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.originalBalanceCents, 197062);
});
