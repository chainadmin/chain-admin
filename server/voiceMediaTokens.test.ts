import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
  signGreetingAudioToken,
  signVoicemailAudioToken,
  createGreetingAudioReference,
  createGreetingPlaybackUrl,
  parseGreetingAudioReference,
  verifyGreetingAudioToken,
  verifyVoicemailAudioToken,
} from './voiceMediaTokens';

test('greeting audio tokens are tenant and object-path bound', () => {
  const secret = 'test-secret';
  const token = signGreetingAudioToken(secret, {
    tenantId: 'tenant-a',
    objectName: 'voice-greetings/tenant-a/greeting.mp3',
    contentType: 'audio/mpeg',
  });
  assert.equal(verifyGreetingAudioToken(secret, token, 'tenant-a')?.tenantId, 'tenant-a');
  assert.equal(verifyGreetingAudioToken(secret, token, 'tenant-b'), null);
  assert.equal(verifyGreetingAudioToken('wrong-secret', token, 'tenant-a'), null);
  const foreignPath = signGreetingAudioToken(secret, {
    tenantId: 'tenant-a',
    objectName: 'voice-greetings/tenant-b/greeting.mp3',
    contentType: 'audio/mpeg',
  });
  assert.equal(verifyGreetingAudioToken(secret, foreignPath, 'tenant-a'), null);
  const reference = createGreetingAudioReference({
    tenantId: 'tenant-a',
    objectName: 'voice-greetings/tenant-a/greeting.mp3',
    contentType: 'audio/mpeg',
  });
  assert.equal(parseGreetingAudioReference(reference, 'tenant-a')?.objectName, 'voice-greetings/tenant-a/greeting.mp3');
  assert.equal(parseGreetingAudioReference(reference, 'tenant-b'), null);
  const playbackUrl = createGreetingPlaybackUrl(secret, 'https://voice.example', reference);
  assert.ok(playbackUrl?.startsWith('https://voice.example/api/voice/greeting-audio?token='));
  const playbackToken = new URL(playbackUrl!).searchParams.get('token')!;
  assert.equal(verifyGreetingAudioToken(secret, playbackToken, 'tenant-a')?.tenantId, 'tenant-a');
  const expired = jwt.sign({
    purpose: 'voice-greeting-audio',
    tenantId: 'tenant-a',
    objectName: 'voice-greetings/tenant-a/greeting.mp3',
    contentType: 'audio/mpeg',
  }, secret, { expiresIn: -1 });
  assert.equal(verifyGreetingAudioToken(secret, expired, 'tenant-a'), null);
});

test('voicemail audio tokens reject tampering and preserve tenant identity', () => {
  const secret = 'test-secret';
  const token = signVoicemailAudioToken(secret, { tenantId: 'tenant-a', voicemailId: 'vm-a' });
  const selection = verifyVoicemailAudioToken(secret, token);
  assert.equal(selection?.purpose, 'voice-voicemail-audio');
  assert.equal(selection?.tenantId, 'tenant-a');
  assert.equal(selection?.voicemailId, 'vm-a');
  assert.equal(verifyVoicemailAudioToken('wrong-secret', token), null);
});