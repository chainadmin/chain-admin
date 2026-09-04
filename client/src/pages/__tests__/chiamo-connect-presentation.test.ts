import assert from "node:assert/strict";
import test from "node:test";
import { isChiamoConnectPhoneShell } from "@/lib/app-detection";
import { canShowChainVoiceCommerce, getVoicePresentation } from "@/lib/chiamo-connect-presentation";

test("Chiamo Connect shell is enabled by default and Chain can opt into the legacy presentation", () => {
  assert.equal(isChiamoConnectPhoneShell(undefined, "chainsoftwaregroup.com"), true);
  assert.equal(isChiamoConnectPhoneShell("false", "chainsoftwaregroup.com"), false);
  assert.equal(isChiamoConnectPhoneShell("false", "chiamoconnect.com"), true);
});

test("Chiamo-owned service never exposes Chain activation", () => {
  const presentation = getVoicePresentation({ billingOwner: "CHIAMO", entitlementStatus: "CANCELLED", voipEnabled: false, isOwner: true });
  assert.equal(presentation.action, "contact-chiamo");
  assert.equal(presentation.label, "UNAVAILABLE");
});

test("loading entitlement never offers activation or calling access", () => {
  const presentation = getVoicePresentation({ isLoading: true, billingOwner: "CHAIN", isOwner: true });
  assert.equal(presentation.label, "CHECKING");
  assert.equal(presentation.action, "none");
});

test("unknown or failed ownership fails closed without activation", () => {
  assert.equal(getVoicePresentation({ isOwner: true }).action, "none");
  assert.equal(getVoicePresentation({ hasError: true, isOwner: true }).action, "none");
});

test("only a Chain owner can activate an inactive service", () => {
  assert.equal(getVoicePresentation({ billingOwner: "CHAIN", entitlementStatus: "CANCELLED", voipEnabled: false, isOwner: true }).action, "enable");
  assert.equal(getVoicePresentation({ billingOwner: "CHAIN", entitlementStatus: "CANCELLED", voipEnabled: false, isOwner: false }).action, "contact-admin");
});

test("embedded Chiamo-owned service never exposes Chain commerce", () => {
  assert.equal(canShowChainVoiceCommerce("CHIAMO"), false);
  assert.equal(canShowChainVoiceCommerce(), false);
  assert.equal(canShowChainVoiceCommerce("CHAIN"), true);
});