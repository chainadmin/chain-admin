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

// DMP's write endpoints (InsertNoteline, send_email_c2c, insertattempt,
// send_text) require camelCase fileNumber/content/emailAddress/attemptType
// keys - Chain's internal DmpNoteData/DmpEmailData/DmpAttemptData/DmpSmsData
// shapes are lowercase/snake_case and predate that contract. Sending the
// internal shape directly makes DMP's required-field check fail on every
// call (400, silently swallowed), so nothing Chain sends ever shows up in
// DMP's Notes tab. These tests lock in that the outgoing body is translated
// to DMP's actual wire format.
async function captureRequestBody(
  call: (service: any) => Promise<any>,
): Promise<any> {
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  const { DebtManagerProService } = await import("./dmpService");
  const service = new DebtManagerProService() as any;
  service.getDmpConfig = async () => ({ enabled: true, apiUrl: "https://dmp.test", username: "u", password: "p" });
  service.authenticate = async () => "test-token";

  let capturedBody: any = null;
  const originalFetch = global.fetch;
  global.fetch = (async (_url: string, options: any) => {
    capturedBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ success: true, data: {} }), text: async () => "" };
  }) as any;

  try {
    await call(service);
  } finally {
    global.fetch = originalFetch;
  }
  return capturedBody;
}

test("insertNote sends DMP's fileNumber/content keys, not filenumber/logmessage", async () => {
  const body = await captureRequestBody((service) =>
    service.insertNote("tenant-1", { filenumber: "FILE-1", collectorname: "Chain", logmessage: "Hello" }),
  );
  assert.equal(body.fileNumber, "FILE-1");
  assert.equal(body.content, "Hello");
  assert.equal(body.filenumber, undefined);
  assert.equal(body.logmessage, undefined);
});

test("sendEmail sends DMP's fileNumber/emailAddress keys, not filenumber/email_address", async () => {
  const body = await captureRequestBody((service) =>
    service.sendEmail("tenant-1", {
      filenumber: "FILE-1",
      email_address: "debtor@example.com",
      subject: "Payment reminder",
      body: "Please pay",
      direction: "outbound",
    }),
  );
  assert.equal(body.fileNumber, "FILE-1");
  assert.equal(body.emailAddress, "debtor@example.com");
  assert.equal(body.subject, "Payment reminder");
  assert.equal(body.body, "Please pay");
  assert.equal(body.filenumber, undefined);
  assert.equal(body.email_address, undefined);
});

test("insertAttempt sends DMP's fileNumber/attemptType keys, not filenumber/attempttype", async () => {
  const body = await captureRequestBody((service) =>
    service.insertAttempt("tenant-1", {
      filenumber: "FILE-1",
      attempttype: "EMAIL",
      attemptdate: "2026-09-15",
      notes: "Email sent",
      result: "SENT",
    }),
  );
  assert.equal(body.fileNumber, "FILE-1");
  assert.equal(body.attemptType, "EMAIL");
  assert.equal(body.notes, "Email sent");
  assert.equal(body.outcome, "SENT");
  assert.equal(body.filenumber, undefined);
  assert.equal(body.attempttype, undefined);
});

test("sendText sends DMP's fileNumber/phoneNumber keys, not filenumber/phone_number", async () => {
  const body = await captureRequestBody((service) =>
    service.sendText("tenant-1", {
      filenumber: "FILE-1",
      phone_number: "5551234567",
      message: "Your payment is due",
      direction: "outbound",
    }),
  );
  assert.equal(body.fileNumber, "FILE-1");
  assert.equal(body.phoneNumber, "5551234567");
  assert.equal(body.message, "Your payment is due");
  assert.equal(body.filenumber, undefined);
  assert.equal(body.phone_number, undefined);
});

// The DMP softphone/CTI endpoints (initiate, result, disposition, inbound,
// markphone) have the same camelCase-vs-lowercase/snake_case contract
// mismatch as the notes/email/attempt/SMS endpoints above - these lock in
// the same translation for each of them.
test("initiateCall sends DMP's fileNumber/phoneNumber keys, not filenumber/phone_number", async () => {
  const body = await captureRequestBody((service) => service.initiateCall("tenant-1", "FILE-1", "5551234567"));
  assert.equal(body.fileNumber, "FILE-1");
  assert.equal(body.phoneNumber, "5551234567");
  assert.equal(body.filenumber, undefined);
  assert.equal(body.phone_number, undefined);
});

test("logCallResult sends DMP's fileNumber/phoneNumber/outcome keys, not filenumber/phone_number/result", async () => {
  const body = await captureRequestBody((service) =>
    service.logCallResult("tenant-1", {
      filenumber: "FILE-1",
      phone_number: "5551234567",
      direction: "outbound",
      duration: 42,
      result: "connected",
      disposition: "promise",
      notes: "Spoke with debtor",
    }),
  );
  assert.equal(body.fileNumber, "FILE-1");
  assert.equal(body.phoneNumber, "5551234567");
  assert.equal(body.outcome, "connected");
  assert.equal(body.duration, 42);
  assert.equal(body.disposition, "promise");
  assert.equal(body.notes, "Spoke with debtor");
  assert.equal(body.direction, "outbound");
  assert.equal(body.filenumber, undefined);
  assert.equal(body.phone_number, undefined);
  assert.equal(body.result, undefined);
});

test("setDisposition sends DMP's fileNumber/disposition keys, not filenumber/disposition_code", async () => {
  const body = await captureRequestBody((service) => service.setDisposition("tenant-1", "FILE-1", "promise", "Will pay Friday"));
  assert.equal(body.fileNumber, "FILE-1");
  assert.equal(body.disposition, "promise");
  assert.equal(body.notes, "Will pay Friday");
  assert.equal(body.filenumber, undefined);
  assert.equal(body.disposition_code, undefined);
});

test("lookupInboundCaller sends DMP's phoneNumber key, not phone_number", async () => {
  const body = await captureRequestBody((service) => service.lookupInboundCaller("tenant-1", "5551234567"));
  assert.equal(body.phoneNumber, "5551234567");
  assert.equal(body.phone_number, undefined);
});

test("markPhoneBad sends DMP's fileNumber/phoneNumber/isBad/notes keys, not filenumber/phone_number/status/reason", async () => {
  const body = await captureRequestBody((service) => service.markPhoneBad("tenant-1", "FILE-1", "5551234567", "Disconnected"));
  assert.equal(body.fileNumber, "FILE-1");
  assert.equal(body.phoneNumber, "5551234567");
  assert.equal(body.isBad, true);
  assert.equal(body.notes, "Disconnected");
  assert.equal(body.filenumber, undefined);
  assert.equal(body.phone_number, undefined);
  assert.equal(body.status, undefined);
  assert.equal(body.reason, undefined);
});
