import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseLegacyChainPhoneControls,
  isChainPhoneEntitlementBillable,
  isPhoneEntitlementBillable,
  legacyPhoneBillingOwner,
  lifecycleFromChiamoBillingStatus,
  resolveChiamoPhoneState,
} from "./phoneProductEntitlementRules";

test("Chiamo lifecycle mapping never activates an unknown billing status", () => {
  assert.equal(lifecycleFromChiamoBillingStatus("ACTIVE"), "ACTIVE");
  assert.equal(lifecycleFromChiamoBillingStatus("past due"), "SUSPENDED");
  assert.equal(lifecycleFromChiamoBillingStatus("CANCELLED"), "CANCELLED");
  assert.equal(lifecycleFromChiamoBillingStatus(undefined), "SUSPENDED");
});

test("legacy ownership favors an existing Chiamo subscription", () => {
  assert.equal(legacyPhoneBillingOwner(true), "CHIAMO");
  assert.equal(legacyPhoneBillingOwner(false), "CHAIN");
});

test("only enabled active entitlements are billable", () => {
  assert.equal(isPhoneEntitlementBillable({ billingOwner: "CHAIN", lifecycleStatus: "ACTIVE", enabled: true }), true);
  assert.equal(isPhoneEntitlementBillable({ billingOwner: "CHIAMO", lifecycleStatus: "SUSPENDED", enabled: true }), false);
  assert.equal(isPhoneEntitlementBillable({ billingOwner: "CHAIN", lifecycleStatus: "ACTIVE", enabled: false }), false);
});

test("Chiamo ownership always suppresses the legacy Chain phone charge", () => {
  assert.equal(isChainPhoneEntitlementBillable({ billingOwner: "CHIAMO", lifecycleStatus: "ACTIVE", enabled: true }), false);
  assert.equal(isChainPhoneEntitlementBillable({ billingOwner: "CHAIN", lifecycleStatus: "ACTIVE", enabled: true }), true);
  assert.equal(isChainPhoneEntitlementBillable({ billingOwner: "CHAIN", lifecycleStatus: "SUSPENDED", enabled: true }), false);
});

test("Chiamo ownership cannot be changed through legacy Chain phone controls", () => {
  assert.equal(canUseLegacyChainPhoneControls("CHAIN"), true);
  assert.equal(canUseLegacyChainPhoneControls("CHIAMO"), false);
});

test("billing suspension preserves Voice intent and reactivation restores access", () => {
  const suspended = resolveChiamoPhoneState({
    lifecycleStatus: "SUSPENDED",
    currentEntitlementEnabled: true,
    currentServiceVoiceEnabled: true,
    currentServiceAccountActive: true,
  });
  assert.equal(suspended.entitlementEnabled, true);
  assert.equal(suspended.operationalAccountActive, false);
  assert.equal(suspended.allowed, false);

  const retriedSuspension = resolveChiamoPhoneState({
    lifecycleStatus: "SUSPENDED",
    currentEntitlementEnabled: suspended.entitlementEnabled,
    currentServiceVoiceEnabled: suspended.voiceConfigured,
    currentServiceAccountActive: suspended.operationalAccountActive,
  });
  assert.deepEqual(retriedSuspension, suspended);

  const reactivated = resolveChiamoPhoneState({
    lifecycleStatus: "ACTIVE",
    currentEntitlementEnabled: retriedSuspension.entitlementEnabled,
    currentServiceVoiceEnabled: retriedSuspension.voiceConfigured,
    currentServiceAccountActive: retriedSuspension.operationalAccountActive,
  });
  assert.equal(reactivated.entitlementEnabled, true);
  assert.equal(reactivated.operationalAccountActive, true);
  assert.equal(reactivated.allowed, true);
});

test("manual account disable remains disabled across billing retries", () => {
  const disabled = resolveChiamoPhoneState({
    lifecycleStatus: "ACTIVE",
    currentEntitlementEnabled: true,
    currentServiceVoiceEnabled: true,
    currentServiceAccountActive: true,
    requestedAccountActive: false,
  });
  assert.equal(disabled.entitlementEnabled, false);
  assert.equal(disabled.operationalAccountActive, false);

  const billingRetry = resolveChiamoPhoneState({
    lifecycleStatus: "ACTIVE",
    currentEntitlementEnabled: disabled.entitlementEnabled,
    currentServiceVoiceEnabled: disabled.voiceConfigured,
    currentServiceAccountActive: disabled.operationalAccountActive,
  });
  assert.equal(billingRetry.entitlementEnabled, false);
  assert.equal(billingRetry.operationalAccountActive, false);
});