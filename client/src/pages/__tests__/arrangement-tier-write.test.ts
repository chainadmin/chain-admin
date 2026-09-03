import assert from "node:assert/strict";
import test from "node:test";

import {
  ArrangementTierValidationError,
  resolveArrangementTierForWrite,
} from "../../../../server/arrangementTierValidation";

test("server writes derive canonical boundaries from the selected tier", () => {
  assert.deepEqual(resolveArrangementTierForWrite("under_500"), {
    balanceTier: "under_500",
    minBalance: 0,
    maxBalance: 49_999,
  });
});

test("server writes reject unknown tiers", () => {
  assert.throws(
    () => resolveArrangementTierForWrite("under_750"),
    ArrangementTierValidationError,
  );
});

test("new rules cannot use the legacy tier, but existing legacy rules can retain it", () => {
  assert.throws(
    () => resolveArrangementTierForWrite("under_3000"),
    /cannot be used for a new arrangement/,
  );
  assert.deepEqual(
    resolveArrangementTierForWrite("under_3000", { allowLegacyTier: true }),
    {
      balanceTier: "under_3000",
      minBalance: 0,
      maxBalance: 299_999,
    },
  );
});