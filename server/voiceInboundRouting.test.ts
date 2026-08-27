import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInboundTwiML, buildVoicemailCompleteTwiML } from './voiceInboundRouting';

const base = {
  tenantId: 'tenant-a',
  callSid: 'CA1',
  bucketId: 'bucket-a',
  agentIds: ['agent-a'],
  timeoutSeconds: 25,
  callbackBase: 'https://voice.example',
} as const;

test('ring-team inbound calls play text greeting and have voicemail fallback', () => {
  const xml = buildInboundTwiML({
    ...base,
    mode: 'RING_TEAM',
    greeting: { enabled: true, type: 'TEXT', text: 'Welcome to our office.' },
  });
  assert.match(xml, /Welcome to our office/);
  assert.match(xml, /dial-status\?bucketId=bucket-a/);
  assert.match(xml, /tenant-user-/);
});

test('direct voicemail buckets bypass the tenant greeting', () => {
  const xml = buildInboundTwiML({
    ...base,
    mode: 'VOICEMAIL',
    greeting: { enabled: true, type: 'TEXT', text: 'SHOULD NOT PLAY' },
  });
  assert.doesNotMatch(xml, /SHOULD NOT PLAY/);
  assert.match(xml, /voicemail-recording\?bucketId=bucket-a/);
  assert.match(xml, /<Record/);
  assert.match(xml, /action="https:\/\/voice\.example\/api\/voice\/voicemail-complete"/);
});

test('ring teams without members route to voicemail after the greeting', () => {
  const xml = buildInboundTwiML({
    ...base,
    agentIds: [],
    mode: 'RING_TEAM',
    greeting: { enabled: true, type: 'AUDIO', audioUrl: 'https://cdn.example/greeting.mp3' },
  });
  assert.match(xml, /<Play>https:\/\/cdn.example\/greeting.mp3/);
  assert.match(xml, /inbound-voicemail\?bucketId=bucket-a/);
});

test('voicemail completion hangs up without re-entering routing', () => {
  const direct = buildInboundTwiML({
    ...base,
    mode: 'VOICEMAIL',
    greeting: { enabled: false, type: null },
  });
  assert.match(direct, /action="https:\/\/voice\.example\/api\/voice\/voicemail-complete"/);

  const completion = buildVoicemailCompleteTwiML();
  assert.match(completion, /<Hangup\/>/);
  assert.doesNotMatch(completion, /<Redirect|<Dial|<Record/);
});