import assert from "node:assert/strict";
import test from "node:test";
import {
  callerIdBucketFeatureAllowed,
  canRequestCallerIdBucketAddon,
  CallerIdBucketAddonRequestError,
  validateCallerIdBucketAddonRequest,
  withCallerIdBucketAddonCharge,
  withoutCallerIdBucketAddonCharge,
} from "./callerIdBucketAddon";
import { CALLER_ID_BUCKET_ADDON_CHARGE_NAME } from "@shared/chiamo-schema";

test("the bucket caller-ID feature is only allowed once Global Admin has approved the add-on", () => {
  assert.equal(callerIdBucketFeatureAllowed(null), false);
  assert.equal(callerIdBucketFeatureAllowed(undefined), false);
  assert.equal(callerIdBucketFeatureAllowed("REQUESTED"), false);
  assert.equal(callerIdBucketFeatureAllowed("DENIED"), false);
  assert.equal(callerIdBucketFeatureAllowed("CANCELLED"), false);
  assert.equal(callerIdBucketFeatureAllowed("APPROVED"), true);
});

test("a company can (re)request the add-on unless a request is already pending or approved", () => {
  assert.equal(canRequestCallerIdBucketAddon(null), true);
  assert.equal(canRequestCallerIdBucketAddon("DENIED"), true);
  assert.equal(canRequestCallerIdBucketAddon("CANCELLED"), true);
  assert.equal(canRequestCallerIdBucketAddon("REQUESTED"), false);
  assert.equal(canRequestCallerIdBucketAddon("APPROVED"), false);
});

test("requesting the add-on requires explicit agreement to the charge", () => {
  assert.throws(
    () => validateCallerIdBucketAddonRequest({ agreed: false, currentStatus: null }),
    (error: unknown) => error instanceof CallerIdBucketAddonRequestError && error.code === "AGREEMENT_REQUIRED",
  );
  assert.throws(
    () => validateCallerIdBucketAddonRequest({ agreed: undefined, currentStatus: null }),
    (error: unknown) => error instanceof CallerIdBucketAddonRequestError && error.code === "AGREEMENT_REQUIRED",
  );
  assert.doesNotThrow(() => validateCallerIdBucketAddonRequest({ agreed: true, currentStatus: null }));
});

test("requesting the add-on rejects a duplicate pending or approved request even with agreement", () => {
  assert.throws(
    () => validateCallerIdBucketAddonRequest({ agreed: true, currentStatus: "REQUESTED" }),
    (error: unknown) => error instanceof CallerIdBucketAddonRequestError && error.code === "ALREADY_REQUESTED",
  );
  assert.throws(
    () => validateCallerIdBucketAddonRequest({ agreed: true, currentStatus: "APPROVED" }),
    (error: unknown) => error instanceof CallerIdBucketAddonRequestError && error.code === "ALREADY_REQUESTED",
  );
});

test("approving the add-on adds its named charge without disturbing other custom charges", () => {
  const charges = [{ name: "Rush setup fee", cents: 500 }];
  const withAddon = withCallerIdBucketAddonCharge(charges, 4000);
  assert.deepEqual(withAddon, [
    { name: "Rush setup fee", cents: 500 },
    { name: CALLER_ID_BUCKET_ADDON_CHARGE_NAME, cents: 4000 },
  ]);
});

test("re-approving replaces the existing addon charge rather than duplicating it", () => {
  const charges = [{ name: CALLER_ID_BUCKET_ADDON_CHARGE_NAME, cents: 4000 }, { name: "Other", cents: 100 }];
  const updated = withCallerIdBucketAddonCharge(charges, 5000);
  assert.deepEqual(updated, [{ name: "Other", cents: 100 }, { name: CALLER_ID_BUCKET_ADDON_CHARGE_NAME, cents: 5000 }]);
});

test("denying or cancelling the add-on removes only its own charge", () => {
  const charges = [{ name: "Other", cents: 100 }, { name: CALLER_ID_BUCKET_ADDON_CHARGE_NAME, cents: 4000 }];
  assert.deepEqual(withoutCallerIdBucketAddonCharge(charges), [{ name: "Other", cents: 100 }]);
});
