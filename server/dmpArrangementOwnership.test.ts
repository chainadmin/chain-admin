import assert from "node:assert/strict";
import test from "node:test";

test("sends the complete recurring schedule to DMP", async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  const { DebtManagerProService } = await import("./dmpService");
  const service = new DebtManagerProService() as any;
  let request: any;
  service.getDmpConfig = async () => ({ enabled: true, apiUrl: "https://dmp.test", username: "u", password: "p" });
  service.makeRequest = async (_config: any, method: string, endpoint: string, body: any) => {
    request = { method, endpoint, body };
    return { success: true, outcomes: [] };
  };

  const sent = await service.insertPaymentArrangement("tenant-1", {
    filenumber: "FILE-1",
    payorname: "Test Consumer",
    arrangementtype: "Biweekly",
    paymentamount: 25,
    nextpaymentdate: "2026-08-19",
    remainingpayments: 3,
    frequency: "biweekly",
    cardtoken: "vault-token",
  });

  assert.equal(sent, true);
  assert.equal(request.method, "POST");
  // insert_payplan_external does not exist on DMP - the only endpoint that
  // accepts a Chain-submitted recurring schedule is insert_payments_external.
  assert.equal(request.endpoint, "/api/v2/insert_payments_external");
  assert.equal(request.body.paymentmethod, "card");
  assert.equal(request.body.cardtoken, "vault-token");
  assert.equal(request.body.paymentamount, undefined);
  assert.equal(request.body.paymentdate, undefined);
  assert.deepEqual(request.body.paymentdata, [
    { paymentamount: "25.00", paymentdate: "2026-08-19" },
    { paymentamount: "25.00", paymentdate: "2026-09-02" },
    { paymentamount: "25.00", paymentdate: "2026-09-16" },
  ]);
});

test("refuses to sync an arrangement without a vaulted card token", async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  const { DebtManagerProService } = await import("./dmpService");
  const service = new DebtManagerProService() as any;
  let called = false;
  service.getDmpConfig = async () => ({ enabled: true, apiUrl: "https://dmp.test", username: "u", password: "p" });
  service.makeRequest = async () => { called = true; return { success: true }; };

  const sent = await service.insertPaymentArrangement("tenant-1", {
    filenumber: "FILE-1",
    payorname: "Test Consumer",
    arrangementtype: "Biweekly",
    paymentamount: 25,
    nextpaymentdate: "2026-08-19",
    remainingpayments: 1,
    frequency: "biweekly",
    cardlast4: "1234",
  });

  assert.equal(sent, false);
  assert.equal(called, false);
});
