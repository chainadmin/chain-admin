import assert from "node:assert/strict";
import test from "node:test";

import {
  balanceTiers,
  findMostSpecificArrangementOption,
  getBalanceRangeFromTier,
  getBalanceTierLabel,
  isBalanceTier,
  selectableBalanceTiers,
} from "../../../../shared/schema";

test("selectable balance tiers include lower-balance breakpoints without gaps", () => {
  assert.deepEqual(selectableBalanceTiers, [
    "under_500",
    "500_to_1000",
    "1000_to_3000",
    "3000_to_5000",
    "5000_to_10000",
    "over_10000",
  ]);

  const ranges = selectableBalanceTiers.map(getBalanceRangeFromTier);
  assert.equal(ranges[0].minBalance, 0);
  for (let index = 1; index < ranges.length; index += 1) {
    assert.equal(ranges[index].minBalance, ranges[index - 1].maxBalance + 1);
  }
});

test("exact cent boundaries and labels are correct", () => {
  assert.deepEqual(getBalanceRangeFromTier("under_500"), { minBalance: 0, maxBalance: 49_999 });
  assert.deepEqual(getBalanceRangeFromTier("500_to_1000"), { minBalance: 50_000, maxBalance: 99_999 });
  assert.deepEqual(getBalanceRangeFromTier("1000_to_3000"), { minBalance: 100_000, maxBalance: 299_999 });
  assert.equal(getBalanceTierLabel("under_500"), "Under $500");
  assert.equal(getBalanceTierLabel("500_to_1000"), "$500 - $1,000");
  assert.equal(getBalanceTierLabel("1000_to_3000"), "$1,000 - $3,000");
  assert.deepEqual(getBalanceRangeFromTier("over_10000"), {
    minBalance: 1_000_000,
    maxBalance: Number.MAX_SAFE_INTEGER,
  });
  assert.equal(getBalanceTierLabel("over_10000"), "$10,000+");
});

test("legacy tier remains valid but cannot be selected for a new rule", () => {
  assert.equal(isBalanceTier("under_3000"), true);
  assert.ok(balanceTiers.includes("under_3000"));
  assert.equal(selectableBalanceTiers.includes("under_3000" as never), false);
  assert.deepEqual(getBalanceRangeFromTier("under_3000"), { minBalance: 0, maxBalance: 299_999 });
});

test("granular rules take precedence over overlapping legacy rules", () => {
  const legacy = { id: "legacy", balanceTier: "under_3000", minBalance: 0, maxBalance: 299_999, isActive: true };
  const granular = { id: "granular", balanceTier: "under_500", minBalance: 0, maxBalance: 49_999, isActive: true };
  assert.equal(findMostSpecificArrangementOption([legacy, granular], 25_000)?.id, "granular");
  assert.equal(findMostSpecificArrangementOption([granular, legacy], 25_000)?.id, "granular");
  assert.equal(findMostSpecificArrangementOption([legacy, granular], 75_000)?.id, "legacy");
});