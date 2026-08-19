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
    return { state: "SUCCESS" };
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
  assert.equal(request.endpoint, "/api/v2/insert_payplan_external");
  assert.deepEqual(request.body.paymentdata, [
    { paymentamount: "25.00", paymentdate: "2026-08-19" },
    { paymentamount: "25.00", paymentdate: "2026-09-02" },
    { paymentamount: "25.00", paymentdate: "2026-09-16" },
  ]);
});
