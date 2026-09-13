import assert from "node:assert/strict";
import test from "node:test";
import { isBucketDirectVoicemail } from "./voiceBucketVoicemailRouting";

const base = {
  isPrivacyLine: false,
  numberType: "LOCAL_PRESENCE" as const,
  localPresenceCallerIdEnabled: true,
  bucketRoutesToVoicemailSetting: true,
};

test("a bucket-list number routes straight to voicemail once the company turns the setting on", () => {
  assert.equal(isBucketDirectVoicemail(base), true);
});

test("the company setting being off means bucket numbers ring normally", () => {
  assert.equal(isBucketDirectVoicemail({ ...base, bucketRoutesToVoicemailSetting: false }), false);
  assert.equal(isBucketDirectVoicemail({ ...base, bucketRoutesToVoicemailSetting: null }), false);
});

test("a number not actually in the bucket list is unaffected by the setting", () => {
  assert.equal(isBucketDirectVoicemail({ ...base, localPresenceCallerIdEnabled: false }), false);
});

test("a non-local-presence number (primary, ported, toll-free) never qualifies", () => {
  for (const numberType of ["PRIMARY", "PORTED", "TOLL_FREE"]) {
    assert.equal(isBucketDirectVoicemail({ ...base, numberType }), false);
  }
});

test("the literal Privacy line number is never double-classified as bucket-direct-voicemail", () => {
  assert.equal(isBucketDirectVoicemail({ ...base, isPrivacyLine: true }), false);
});
