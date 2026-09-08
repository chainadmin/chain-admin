import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  assertMappedChiamoSubaccount,
  chiamoNumberWebhookBaseUrl,
  initialChiamoNumberIdentity,
  reconcileOrPurchaseChiamoNumber,
  safeChiamoNumberProviderError,
  withAdditionalNumberCharge,
  type ChiamoNumberProvider,
} from "./chiamoNumberService";
import {
  chiamoNumberPurchaseInput,
  chiamoNumberSearchInput,
  decideChiamoNumberClaim,
  registerChiamoNumberRoutes,
} from "./chiamoNumberRoutes";

const sid = `AC${"a".repeat(32)}`;

test("requires the exact existing company Twilio subaccount mapping", () => {
  assert.deepEqual(assertMappedChiamoSubaccount("tenant-a", sid, sid, `AC${"b".repeat(32)}`), { tenantId: "tenant-a", subaccountSid: sid });
  assert.throws(() => assertMappedChiamoSubaccount("tenant-a", null, sid), (error: any) => error.code === "CHIAMO_PROVIDER_MAPPING_REQUIRED");
  assert.throws(() => assertMappedChiamoSubaccount("tenant-a", sid, `AC${"b".repeat(32)}`), (error: any) => error.code === "CHIAMO_PROVIDER_MAPPING_REQUIRED");
  assert.throws(() => assertMappedChiamoSubaccount("tenant-a", "master-account", "master-account"), (error: any) => error.code === "CHIAMO_PROVIDER_MAPPING_INVALID");
  assert.throws(() => assertMappedChiamoSubaccount("tenant-a", sid, sid, sid), (error: any) => error.code === "CHIAMO_SUBACCOUNT_REQUIRED");
});

test("accepts only an explicitly configured HTTPS Chiamo production webhook origin", () => {
  assert.equal(chiamoNumberWebhookBaseUrl({ TWILIO_VOICE_WEBHOOK_BASE_URL: "https://voice.chiamoconnect.com/" } as NodeJS.ProcessEnv), "https://voice.chiamoconnect.com");
  assert.throws(() => chiamoNumberWebhookBaseUrl({ APP_BASE_URL: "https://chain.example.com" } as NodeJS.ProcessEnv));
  assert.throws(() => chiamoNumberWebhookBaseUrl({ TWILIO_VOICE_WEBHOOK_BASE_URL: "http://chiamoconnect.com" } as NodeJS.ProcessEnv));
  assert.throws(() => chiamoNumberWebhookBaseUrl({ TWILIO_VOICE_WEBHOOK_BASE_URL: "https://chiamoconnect.com.evil.test" } as NodeJS.ProcessEnv));
  assert.throws(() => chiamoNumberWebhookBaseUrl({ TWILIO_VOICE_WEBHOOK_BASE_URL: "https://voice.chiamoconnect.com/api" } as NodeJS.ProcessEnv));
});

test("provider errors never expose raw provider, SQL, or URL details", () => {
  const raw = "timeout SELECT secret FROM tenants https://internal.invalid/token";
  const ambiguous = safeChiamoNumberProviderError(new Error(raw));
  assert.equal((ambiguous as any).code, "NUMBER_PROVIDER_RESULT_UNKNOWN");
  assert.equal(ambiguous.message.includes("SELECT"), false);
  assert.equal(ambiguous.message.includes("internal.invalid"), false);
  const ordinary = safeChiamoNumberProviderError(new Error("provider credential abc"));
  assert.equal(ordinary.message.includes("credential"), false);
});

test("reconciles a provider success after persistence failure without purchasing twice", async () => {
  let owned: any = null;
  let purchases = 0;
  const provider: ChiamoNumberProvider = {
    async searchLocal() { return []; }, async searchTollFree() { return []; },
    async findOwned() { return owned; },
    async purchaseVoice(_tenantId, phoneNumber) {
      purchases++;
      return owned = { sid: `PN${"1".repeat(32)}`, phoneNumber, subaccountSid: sid };
    },
  };
  const first = await reconcileOrPurchaseChiamoNumber(provider, "tenant-a", "+12125550100");
  await assert.rejects(async () => { void first; throw new Error("simulated persistence failure"); });
  const retry = await reconcileOrPurchaseChiamoNumber(provider, "tenant-a", "+12125550100");
  assert.equal(retry, owned);
  assert.equal(purchases, 1);
});

test("does not call provider purchase when readiness is revoked during reconciliation", async () => {
  let allowed = true;
  let purchases = 0;
  const provider: ChiamoNumberProvider = {
    async searchLocal() { return []; }, async searchTollFree() { return []; },
    async findOwned() { allowed = false; return null; },
    async purchaseVoice() { purchases++; throw new Error("must not be called"); },
  };
  await assert.rejects(
    reconcileOrPurchaseChiamoNumber(provider, "tenant-a", "+12125550100", async () => {
      if (!allowed) throw Object.assign(new Error("Billing was suspended."), { code: "NUMBER_PURCHASE_NOT_READY" });
    }),
    (error: any) => error.code === "NUMBER_PURCHASE_NOT_READY",
  );
  assert.equal(purchases, 0);
});

test("claim decisions prevent same-key and same-number double submits", () => {
  const now = Date.now();
  const live = { idempotency_key: "key-a", phone_number: "+12125550100", status: "CLAIMED", updated_at: new Date(now) };
  assert.equal(decideChiamoNumberClaim(live, "key-a", live.phone_number, now), "PENDING");
  assert.equal(decideChiamoNumberClaim(live, "key-b", live.phone_number, now), "PENDING");
  assert.equal(decideChiamoNumberClaim({ ...live, status: "COMPLETED" }, "key-b", live.phone_number, now), "REPLAY");
  assert.equal(decideChiamoNumberClaim({ ...live, status: "UNKNOWN" }, "key-b", live.phone_number, now), "PENDING");
  assert.equal(decideChiamoNumberClaim(live, "key-a", "+13105550100", now), "CONFLICT");
  assert.equal(decideChiamoNumberClaim({ ...live, updated_at: new Date(now - 11 * 60 * 1000) }, "key-b", live.phone_number, now), "RECLAIM");
});

test("additional-number pricing replaces its current charge and preserves unrelated charges", () => {
  const result = withAdditionalNumberCharge([
    { name: "Support", cents: 500 },
    { name: "Additional Chiamo business phone numbers", cents: 99999 },
    { name: "Additional Chiamo business phone numbers", cents: 99999 },
  ], 4, 2, 115);
  assert.deepEqual(result, [{ name: "Support", cents: 500 }, { name: "Additional Chiamo business phone numbers", cents: 230 }]);
  assert.deepEqual(withAdditionalNumberCharge(result, 2, 2, 115), [{ name: "Support", cents: 500 }]);
});

test("the first purchased Chiamo number becomes the test-calling main line", () => {
  assert.deepEqual(initialChiamoNumberIdentity(0), { isPrimary: true, friendlyName: "Main Line" });
  assert.deepEqual(initialChiamoNumberIdentity(1), { isPrimary: false, friendlyName: null });
});

test("search and purchase reject untrusted or unconfirmed input", () => {
  assert.equal(chiamoNumberSearchInput.safeParse({ type: "local", areaCode: "12x" }).success, false);
  assert.equal(chiamoNumberSearchInput.safeParse({ type: "sms", areaCode: "212" }).success, false);
  const valid = { phoneNumber: "+12125550100", numberType: "local", idempotencyKey: "123e4567-e89b-42d3-a456-426614174000", confirmed: true };
  assert.equal(chiamoNumberPurchaseInput.safeParse(valid).success, true);
  assert.equal(chiamoNumberPurchaseInput.safeParse({ ...valid, confirmed: false }).success, false);
  assert.equal(chiamoNumberPurchaseInput.safeParse({ ...valid, phoneNumber: "+442071234567" }).success, false);
});

test("HTTP inventory is owner-only and tenant identity comes only from authentication", async () => {
  const app = express();
  app.use(express.json());
  const observed: string[] = [];
  const fakeProvider: ChiamoNumberProvider = {
    async searchLocal() { throw new Error("not called"); }, async searchTollFree() { throw new Error("not called"); },
    async findOwned() { throw new Error("not called"); }, async purchaseVoice() { throw new Error("not called"); },
  };
  registerChiamoNumberRoutes(app, fakeProvider, {
    authenticate(req: any, res, next) {
      const tenantId = String(req.header("x-test-tenant") || "");
      if (!tenantId) return res.status(401).json({ message: "Unauthorized" });
      req.user = { tenantId, role: req.header("x-test-role") || "member", product: "chiamo" };
      next();
    },
    async loadInventory(tenantId) {
      observed.push(tenantId);
      return { numbers: [{ phoneNumber: tenantId === "tenant-a" ? "+12125550100" : "+13105550100" }], readiness: { allowed: true } };
    },
  });
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/api/chiamo/numbers`)).status, 401);
    assert.equal((await fetch(`${base}/api/chiamo/numbers`, { headers: { "x-test-tenant": "tenant-a", "x-test-role": "member" } })).status, 403);
    const owner = await fetch(`${base}/api/chiamo/numbers?tenantId=tenant-b`, { headers: { "x-test-tenant": "tenant-a", "x-test-role": "owner" } });
    assert.equal(owner.status, 200);
    assert.equal((await owner.json()).numbers[0].phoneNumber, "+12125550100");
    assert.deepEqual(observed, ["tenant-a"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});