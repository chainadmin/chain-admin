import assert from "node:assert/strict";
import test from "node:test";
import { calculateChiamoMonthlyService, calculateChiamoVoipMonthlyService } from "../../../../shared/chiamo";

test("current VoIP estimates ignore legacy SMS overages without mutating retained pricing", () => {
  const legacy = { smsOverageCents: 9900, customCharges: [{ name: "Setup", cents: 1000 }] };
  const current = calculateChiamoVoipMonthlyService("starter", 3, legacy);
  assert.equal(current?.textingChargeCents, 0);
  assert.equal(current?.smsOverageCents, 0);
  assert.equal(current?.totalCents, 20900);
  assert.equal(legacy.smsOverageCents, 9900);
  assert.equal(calculateChiamoMonthlyService("starter", 3, true, legacy)?.totalCents, 43300);
});