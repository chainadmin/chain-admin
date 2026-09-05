import assert from "node:assert/strict";
import test from "node:test";

import { countOptionalPaymentApprovals } from "./removalQueryHelpers";

test("missing optional payment approvals table contributes zero", async () => {
  const results = [{ rows: [{ relation: null }] }];
  const tx = {
    execute: async () => results.shift(),
  };

  assert.equal(await countOptionalPaymentApprovals(tx, "tenant-1"), 0);
  assert.equal(results.length, 0);
});

test("existing payment approvals table contributes its tenant count", async () => {
  const results = [
    { rows: [{ relation: "payment_approvals" }] },
    { rows: [{ count: 3 }] },
  ];
  const tx = {
    execute: async () => results.shift(),
  };

  assert.equal(await countOptionalPaymentApprovals(tx, "tenant-1"), 3);
  assert.equal(results.length, 0);
});