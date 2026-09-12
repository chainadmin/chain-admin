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

test('ring-team fan-out keeps every available agent in the same dial', () => {
  const xml = buildInboundTwiML({
    ...base,
    agentIds: ['agent-a', 'agent-b', 'agent-c'],
    mode: 'RING_TEAM',
    greeting: { enabled: false, type: null },
  });
  assert.equal((xml.match(/<Client>/g) || []).length, 3);
  assert.match(xml, /dial-status\?bucketId=bucket-a/);
});

test('direct voicemail buckets play a dedicated voicemail greeting, distinct from the tenant-wide inbound greeting', () => {
  const xml = buildInboundTwiML({
    ...base,
    mode: 'VOICEMAIL',
    // Callers must pass the voicemail-specific greeting for VOICEMAIL mode
    // (never the pre-routing inboundGreeting*) — see routes.ts.
    greeting: { enabled: true, type: 'TEXT', text: 'You have reached our voicemail.' },
  });
  assert.match(xml, /You have reached our voicemail/);
  assert.match(xml, /voicemail-recording\?bucketId=bucket-a/);
  assert.match(xml, /<Record/);
  assert.match(xml, /action="https:\/\/voice\.example\/api\/voice\/voicemail-complete"/);
});

test('direct voicemail with no configured greeting uses the default recording prompt', () => {
  const xml = buildInboundTwiML({
    ...base,
    mode: 'VOICEMAIL',
    greeting: { enabled: false, type: null },
  });
  assert.match(xml, /Please leave a message after the tone/);
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

test('privacy inbound bypasses ring team and uses separate greeting and marker', () => {
  const xml = buildInboundTwiML({
    ...base,
    mode: 'VOICEMAIL',
    privacy: true,
    greeting: { enabled: true, type: 'TEXT', text: 'Private mailbox greeting.' },
  });
  assert.match(xml, /Private mailbox greeting/);
  assert.match(xml, /privacy%3D1|privacy=1/);
  assert.doesNotMatch(xml, /<Dial|tenant-user-/);
});