import assert from "node:assert/strict";
import test from "node:test";
import { lockChiamoOnlyTenant } from "./phoneProductEntitlement";
import { guardVoiceProvisioner } from "./companyTwilioService";

test("Chiamo mutation boundary locks and rejects tenants without Chiamo enabled", async () => {
  for (const row of [
    undefined,
    { id: "tenant", chiamoConnectEnabled: false, chainCoreEnabled: true },
    { id: "tenant", chiamoConnectEnabled: false, chainCoreEnabled: false },
  ]) {
    let locked = false;
    const query = {
      from() { return query; },
      where() { return query; },
      for(mode: string) { locked = mode === "update"; return query; },
      async limit() { return row ? [row] : []; },
    };
    await assert.rejects(lockChiamoOnlyTenant({ select: () => query }, "tenant"),
      (error: any) => error.status === 409 && error.code === "CHIAMO_CUSTOMER_REQUIRED");
    assert.equal(locked, true);
  }
});

test("a Chiamo-only suspended tenant can be administered without reactivating it", async () => {
  const row = { id: "tenant", chiamoConnectEnabled: true, chainCoreEnabled: false, isActive: false };
  const query = { from() { return query; }, where() { return query; }, for() { return query; }, async limit() { return [row]; } };
  const result = await lockChiamoOnlyTenant({ select: () => query }, row.id);
  assert.equal(result.isActive, false);
  assert.equal(row.isActive, false);
});

test("a dual chain-core + Chiamo tenant can still activate and administer Chiamo voice", async () => {
  const row = { id: "tenant", chiamoConnectEnabled: true, chainCoreEnabled: true, isActive: true };
  const query = { from() { return query; }, where() { return query; }, for() { return query; }, async limit() { return [row]; } };
  const result = await lockChiamoOnlyTenant({ select: () => query }, row.id);
  assert.equal(result.chainCoreEnabled, true);
  assert.equal(result.chiamoConnectEnabled, true);
});

test("a replaced Voice claim cannot initiate further provider mutations", async () => {
  let ownsClaim = true;
  const calls: string[] = [];
  const provider = guardVoiceProvisioner({
    async createKey() { calls.push("create"); return "key"; },
    async deleteKey() { calls.push("delete"); },
  }, async () => {
    if (!ownsClaim) throw Object.assign(new Error("Superseded"), { code: "VOICE_CLAIM_LOST" });
  });
  assert.equal(await provider.createKey(), "key");
  ownsClaim = false;
  await assert.rejects(provider.deleteKey(), (error: any) => error.code === "VOICE_CLAIM_LOST");
  assert.deepEqual(calls, ["create"]);
});