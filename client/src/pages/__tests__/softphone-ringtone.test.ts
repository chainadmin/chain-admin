import assert from "node:assert/strict";
import test from "node:test";
import {
  clampRingVolume,
  DEFAULT_RING_VOLUME,
  readStoredRingMuted,
  readStoredRingVolume,
  writeStoredRingMuted,
  writeStoredRingVolume,
} from "../../lib/softphone-ringtone";

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
  };
}

test("clampRingVolume keeps values within 0..1 and falls back for non-finite input", () => {
  assert.equal(clampRingVolume(0.5), 0.5);
  assert.equal(clampRingVolume(-1), 0);
  assert.equal(clampRingVolume(4), 1);
  assert.equal(clampRingVolume(Number.NaN), DEFAULT_RING_VOLUME);
});

test("ring volume defaults when nothing is stored, and round-trips once written", () => {
  const storage = fakeStorage();
  assert.equal(readStoredRingVolume(storage), DEFAULT_RING_VOLUME);
  assert.equal(readStoredRingVolume(null), DEFAULT_RING_VOLUME);

  writeStoredRingVolume(storage, 0.2);
  assert.equal(readStoredRingVolume(storage), 0.2);

  writeStoredRingVolume(storage, 5);
  assert.equal(readStoredRingVolume(storage), 1);
});

test("ring muted preference defaults to false and round-trips", () => {
  const storage = fakeStorage();
  assert.equal(readStoredRingMuted(storage), false);

  writeStoredRingMuted(storage, true);
  assert.equal(readStoredRingMuted(storage), true);

  writeStoredRingMuted(storage, false);
  assert.equal(readStoredRingMuted(storage), false);
});
