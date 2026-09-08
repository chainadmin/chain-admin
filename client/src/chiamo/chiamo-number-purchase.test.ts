import assert from "node:assert/strict";
import test from "node:test";
import { confirmedNumberPurchase, retryPendingNumberPurchase } from "./chiamo-number-purchase";

test("a pending A retry cannot inherit a newly viewed B selection", () => {
  const pendingA = confirmedNumberPurchase("+12125550100", "local", "123e4567-e89b-42d3-a456-426614174000");
  const unconfirmedB = { phoneNumber: "+13105550100", numberType: "local" as const, idempotencyKey: "223e4567-e89b-42d3-a456-426614174000" };
  const retry = retryPendingNumberPurchase(pendingA);
  assert.equal(retry.phoneNumber, pendingA.phoneNumber);
  assert.equal(retry.idempotencyKey, pendingA.idempotencyKey);
  assert.notEqual(retry.phoneNumber, unconfirmedB.phoneNumber);
  assert.equal("confirmed" in unconfirmedB, false);
});