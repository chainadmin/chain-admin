import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";

const { db, pool } = await import("./db");
const { tenants, consumers, accounts } = await import("@shared/schema");
const { storage } = await import("./storage");

async function seedTenantConsumer() {
  const tenantId = randomUUID();
  await db.insert(tenants).values({
    id: tenantId,
    name: "Test Org",
    slug: `test-org-${tenantId}`,
    createdDate: new Date().toISOString().split("T")[0],
  });
  const consumerId = randomUUID();
  await db.insert(consumers).values({
    id: consumerId,
    tenantId,
    firstName: "Ada",
    lastName: "Lovelace",
  });
  return { tenantId, consumerId };
}

// applyDmpBalanceRepair used to wrap every account's update in one shared
// transaction, with a per-row check requiring the account's stored balance
// to still match what the plan expected. One account changing between plan
// and apply (a collector posting a payment, the sync cron, anything) threw
// and rolled back every account already fixed in the same run - on a
// tenant with hundreds of live accounts, that made a full repair run
// essentially impossible to ever complete.
test("applyDmpBalanceRepair applies accounts independently - one stale row doesn't roll back the rest", async () => {
  const { tenantId, consumerId } = await seedTenantConsumer();

  const [staysCorrect] = await db.insert(accounts).values({
    tenantId,
    consumerId,
    creditor: "Acme",
    filenumber: "file-1",
    balanceCents: 100000,
    originalBalanceCents: 200000,
    additionalData: { dmpSource: "dmp" },
  }).returning();

  const [changesUnderneathUs] = await db.insert(accounts).values({
    tenantId,
    consumerId,
    creditor: "Acme",
    filenumber: "file-2",
    balanceCents: 50000,
    originalBalanceCents: 60000,
    additionalData: { dmpSource: "dmp" },
  }).returning();

  // Simulate something else (a payment posting) changing file-2's balance
  // after the repair plan was computed but before this apply runs.
  const { eq } = await import("drizzle-orm");
  await db.update(accounts).set({ balanceCents: 40000 }).where(eq(accounts.id, changesUnderneathUs.id));

  const result = await storage.applyDmpBalanceRepair(tenantId, [
    {
      accountId: staysCorrect.id,
      filenumber: "file-1",
      expectedBalanceCents: 100000,
      expectedOriginalBalanceCents: 200000,
      balanceCents: 75000,
      originalBalanceCents: 75000,
    },
    {
      // Plan was computed against the pre-payment balanceCents (50000),
      // which no longer matches now that it's 40000.
      accountId: changesUnderneathUs.id,
      filenumber: "file-2",
      expectedBalanceCents: 50000,
      expectedOriginalBalanceCents: 60000,
      balanceCents: 25000,
      originalBalanceCents: 25000,
    },
  ]);

  assert.deepEqual(result, { applied: 1, staleSkipped: 1 });

  const [refetchedCorrect] = await db.select().from(accounts).where(eq(accounts.id, staysCorrect.id));
  assert.equal(refetchedCorrect.balanceCents, 75000, "the unaffected account's fix must still apply");

  const [refetchedStale] = await db.select().from(accounts).where(eq(accounts.id, changesUnderneathUs.id));
  assert.equal(refetchedStale.balanceCents, 40000, "the account that changed mid-run keeps its newer value, not the stale plan's");
});

test.after(async () => {
  await pool.end();
});
