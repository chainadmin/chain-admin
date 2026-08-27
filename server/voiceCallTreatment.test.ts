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
  const xml = buildReconnectClientTwiML('tenant-a', 'agent-a');
  assert.match(xml, /<Dial><Client>tenant-user-[a-f0-9]{64}<\/Client><\/Dial>/);
  assert.doesNotMatch(xml, /tenant-b|agent-b/);
});