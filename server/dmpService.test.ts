import assert from "node:assert/strict";
import test from "node:test";

// DMP's v2 API wraps every response as { success, data }. makeRequest is the
// one place that talks to DMP for the "simple" GET-style calls (getAccount,
// getPayments, getPhones, getNotes, getAttempts, ...), so unwrapping it there
// is what makes every one of those callers receive the actual payload
// instead of the envelope object.
test("makeRequest unwraps DMP's {success, data} envelope", async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  const { DebtManagerProService } = await import("./dmpService");
  const service = new DebtManagerProService() as any;
  service.getDmpConfig = async () => ({ enabled: true, apiUrl: "https://dmp.test", username: "u", password: "p" });
  service.authenticate = async () => "test-token";

  const originalFetch = global.fetch;
  global.fetch = (async () => ({
    ok: true,
    json: async () => ({
      success: true,
      data: [{ id: "p1", transactionid: "dmp-1", amount: 5000, paymentDate: "2026-08-19", status: "SCHEDULED" }],
    }),
    text: async () => "",
  })) as any;

  try {
    const payments = await service.getPayments("tenant-1", "FILE-1");
    assert.ok(Array.isArray(payments), "expected the unwrapped array, not the {success, data} envelope");
    assert.equal(payments.length, 1);
    assert.equal(payments[0].amount, 5000);
    assert.equal(payments[0].paymentDate, "2026-08-19");
  } finally {
    global.fetch = originalFetch;
  }
});

test("makeRequest returns a response that isn't wrapped in a data envelope as-is", async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  const { DebtManagerProService } = await import("./dmpService");
  const service = new DebtManagerProService() as any;
  service.getDmpConfig = async () => ({ enabled: true, apiUrl: "https://dmp.test", username: "u", password: "p" });
  service.authenticate = async () => "test-token";

  const originalFetch = global.fetch;
  global.fetch = (async () => ({
    ok: true,
    json: async () => ([{ id: "p1", amount: 5000 }]),
    text: async () => "",
  })) as any;

  try {
    const payments = await service.getPayments("tenant-1", "FILE-1");
    assert.ok(Array.isArray(payments));
    assert.equal(payments.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
