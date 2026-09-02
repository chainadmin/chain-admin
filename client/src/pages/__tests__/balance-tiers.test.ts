import assert from "node:assert/strict";
import test from "node:test";

import {
  balanceTiers,
  getBalanceRangeFromTier,
  getBalanceTierLabel,
  selectableBalanceTiers,
} from "../../../../shared/schema";

test("selectable balance tiers include $500 and $1,000 breakpoints without gaps", () => {
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

test("the legacy under-$3,000 tier remains readable but is not selectable", () => {
  assert.ok(balanceTiers.includes("under_3000"));
  assert.ok(!selectableBalanceTiers.includes("under_3000" as never));
  assert.deepEqual(getBalanceRangeFromTier("under_3000"), {
    minBalance: 0,
    maxBalance: 299_999,
  });
  assert.equal(getBalanceTierLabel("under_3000"), "Under $3,000");
});

test("new balance tiers have clear display labels and cent boundaries", () => {
  assert.deepEqual(getBalanceRangeFromTier("under_500"), {
    minBalance: 0,
    maxBalance: 49_999,
  });
  assert.deepEqual(getBalanceRangeFromTier("500_to_1000"), {
    minBalance: 50_000,
    maxBalance: 99_999,
  });
  assert.deepEqual(getBalanceRangeFromTier("1000_to_3000"), {
    minBalance: 100_000,
    maxBalance: 299_999,
  });

  assert.equal(getBalanceTierLabel("under_500"), "Under $500");
  assert.equal(getBalanceTierLabel("500_to_1000"), "$500 - $1,000");
  assert.equal(getBalanceTierLabel("1000_to_3000"), "$1,000 - $3,000");
});
