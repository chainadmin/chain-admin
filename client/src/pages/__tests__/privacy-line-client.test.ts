import assert from "node:assert/strict";
import { test } from "node:test";
import {
  privacyGreeting,
  privacyLineChoices,
  privacyLineNumber,
  privacyLinePayload,
} from "../../components/voip/privacy-line";

test("uses the approved Privacy Line PATCH payload and supports clearing the selection", () => {
  assert.deepEqual(
    privacyLinePayload(null, { enabled: false, type: null, text: null }),
    { phoneNumberId: null, greetingType: null, greetingText: null, greetingAudioUrl: null },
  );
  assert.deepEqual(
    privacyLinePayload("did-7", { enabled: true, type: "TEXT", text: "Leave a message." }),
    { phoneNumberId: "did-7", greetingType: "TEXT", greetingText: "Leave a message.", greetingAudioUrl: null },
  );
});

test("normalizes Privacy Line choices and keeps the dedicated number visible to agents", () => {
  const line = { id: "did-7", phoneNumber: "+1 212 555 0148" };
  const response = { selectedNumber: line, availableNumbers: [line], greeting: { text: "Hello" } };
  assert.equal(privacyLineNumber(response)?.phoneNumber, "+1 212 555 0148");
  assert.deepEqual(privacyLineChoices(response), [line]);
  assert.equal(privacyGreeting(response).text, "Hello");
});