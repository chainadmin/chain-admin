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

// dmpService is a single shared instance for the whole running process, and
// its auth token cache is a plain in-memory Map. Two tenants whose DMP
// username+apiUrl happen to coincide (shared DMP server, similar or reused
// credentials) must never end up sharing a cached token - that would let one
// tenant's sync silently pull back a different tenant's account data, with
// no error anywhere.
test("two tenants sharing the same DMP username+apiUrl get isolated auth tokens, not a shared cache entry", async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  const { DebtManagerProService } = await import("./dmpService");
  const service = new DebtManagerProService() as any;

  const sameCredentials = { enabled: true, apiUrl: "https://dmp.test", username: "shared-user", password: "p" };
  service.getDmpConfig = async (tenantId: string) => ({ ...sameCredentials, tenantId });

  const loginCallsByTenant: Record<string, number> = {};
  const originalFetch = global.fetch;
  global.fetch = (async (url: string, options: any) => {
    if (url.endsWith("/api/v2/login")) {
      // A real DMP server would identify the caller by credentials in the
      // request body, not anything Chain adds - this stub does the same,
      // and mints a token embedding which tenant's login produced it so the
      // test can tell tokens apart below.
      const body = JSON.parse(options.body);
      loginCallsByTenant[body.username] = (loginCallsByTenant[body.username] || 0) + 1;
      return {
        ok: true,
        json: async () => ({ token: `token-for-${body.username}-call-${loginCallsByTenant[body.username]}` }),
        text: async () => "",
      };
    }
    // Echo back the bearer token used, so the test can verify each tenant's
    // request carried a token minted by that tenant's own login call.
    const authHeader = options.headers.Authorization as string;
    return { ok: true, json: async () => ({ token: authHeader }), text: async () => "" };
  }) as any;

  try {
    const resultA1 = await service.getPortfolios("tenant-A");
    const resultB1 = await service.getPortfolios("tenant-B");
    const resultA2 = await service.getPortfolios("tenant-A");

    // Both tenants authenticated separately (2 login calls, not 1 shared).
    assert.equal(loginCallsByTenant["shared-user"], 2);
    // Tenant A's second call reused its own cached token rather than
    // authenticating a third time, and it's a different token than B's.
    assert.equal((resultA1 as any).token, (resultA2 as any).token);
    assert.notEqual((resultA1 as any).token, (resultB1 as any).token);
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
