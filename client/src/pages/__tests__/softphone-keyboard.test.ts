import assert from "node:assert/strict";
import test from "node:test";
import { softphoneEnterAction } from "../../lib/softphone-keyboard";

test("Enter starts a ready outbound call when a number is present", () => {
  assert.equal(softphoneEnterAction({ callState: "idle", hasNumber: true, busy: false, callTransitionPending: false }), "call");
});

test("Enter ends calls that are connecting, ringing, or active", () => {
  for (const callState of ["connecting", "ringing", "in-call"] as const) {
    assert.equal(softphoneEnterAction({ callState, hasNumber: true, busy: false, callTransitionPending: false }), "hangup");
  }
});

test("Enter does nothing when dialing is unavailable or a handoff is pending", () => {
  assert.equal(softphoneEnterAction({ callState: "idle", hasNumber: false, busy: false, callTransitionPending: false }), null);
  assert.equal(softphoneEnterAction({ callState: "idle", hasNumber: true, busy: true, callTransitionPending: false }), null);
  assert.equal(softphoneEnterAction({ callState: "in-call", hasNumber: true, busy: false, callTransitionPending: true }), null);
  assert.equal(softphoneEnterAction({ callState: "ended", hasNumber: true, busy: false, callTransitionPending: false }), null);
});
