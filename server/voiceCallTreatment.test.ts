import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReconnectClientTwiML, buildWaitingMusicTwiML } from './voiceCallTreatment';
import { DEFAULT_VOICE_MUSIC_KEY, VOICE_MEDIA_CATALOG } from './voiceMediaCatalog';

test('approved catalog contains the five supplied tracks with Art Gallery Museum as default', () => {
  assert.equal(DEFAULT_VOICE_MUSIC_KEY, 'art-gallery-museum');
  assert.deepEqual(VOICE_MEDIA_CATALOG.map(track => track.key), [
    'art-gallery-museum',
    'lounge-jazz',
    'elevator-on-hold',
    'positive-jazz',
    'elevator',
  ]);
});

test('hold and park treatments can use distinct approved music URLs', () => {
  const hold = buildWaitingMusicTwiML('positive-jazz', 'https://voice.example.test');
  const park = buildWaitingMusicTwiML('elevator', 'https://voice.example.test');
  assert.match(hold, /\/api\/voice\/media\/positive-jazz/);
  assert.match(park, /\/api\/voice\/media\/elevator/);
  assert.notEqual(hold, park);
});

test('resuming a held or parked caller reconnects only to the tenant-bound user identity', () => {
  const xml = buildReconnectClientTwiML('tenant-a', 'agent-a', {
    retainedCallId: 'retained-id',
    reconnectToken: '434c518b-cc43-4fa6-85d6-22e2e0586930',
    callbackUrl: 'https://voice.example.test/api/voice/retained-call-status?id=retained-id',
  });
  assert.match(xml, /<Dial action="https:\/\/voice\.example\.test\/api\/voice\/retained-call-status\?id=retained-id" method="POST" timeout="25">/);
  assert.match(xml, /<Client statusCallback=/);
  assert.match(xml, /<Identity>tenant-user-[a-f0-9]{64}<\/Identity>/);
  assert.match(xml, /<Parameter name="RetainedCallId" value="retained-id"\/>/);
  assert.match(xml, /<Parameter name="ReconnectToken" value="434c518b-cc43-4fa6-85d6-22e2e0586930"\/>/);
  assert.match(xml, /tenant-user-[a-f0-9]{64}/);
  assert.doesNotMatch(xml, /tenant-b|agent-b/);
});