import test from "node:test";
import assert from "node:assert/strict";
import { calculateChiamoMonthlyService, chiamoPlans, chiamoTextingAddon, CHIAMO_SUPPORT_EMAIL } from "../../../../shared/chiamo";

test("Chiamo plans remain isolated at approved initial prices", () => {
  assert.deepEqual(chiamoPlans.map(p => [p.id, p.monthlyPriceCents, p.includedUsers, p.additionalUserPriceCents]), [
    ["starter", 19900, 3, 2500], ["business", 39900, 7, 2500], ["professional", 69900, 15, 2000],
  ]);
  assert.equal(chiamoTextingAddon.monthlyPriceCents, 12500);
  assert.equal(chiamoTextingAddon.includedSegments, 3500);
  assert.equal(CHIAMO_SUPPORT_EMAIL, "support@chiamoconnect.com");
});

test("Business example is $599 and has no voice-minute line item", () => {
  const bill = calculateChiamoMonthlyService("business", 10, true);
  assert.equal(bill?.additionalUsers, 3);
  assert.equal(bill?.additionalUserChargeCents, 7500);
  assert.equal(bill?.totalCents, 59900);
  assert.equal(Object.keys(bill || {}).some(key => key.toLowerCase().includes("minute")), false);
});
