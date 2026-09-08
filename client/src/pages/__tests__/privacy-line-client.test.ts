import assert from "node:assert/strict";
import { test } from "node:test";
import {
  privacyGreeting,
  privacyLineChoices,
  privacyLineNumber,
  privacyLinePayload,
} from "../../components/voip/privacy-line";
import { pcmByteLength, pcmToWav } from "../../components/voip/greeting-audio";

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

test("encodes microphone samples as a PCM WAV accepted by the greeting endpoint", async () => {
  const wav = pcmToWav([new Float32Array([0, 0.5, -0.5])], 8000);
  const bytes = new Uint8Array(await wav.arrayBuffer());
  assert.equal(wav.type, "audio/wav");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), "WAVE");
  assert.equal(pcmByteLength(3), 50);
});