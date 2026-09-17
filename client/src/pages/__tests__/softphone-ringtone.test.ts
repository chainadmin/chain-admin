import assert from "node:assert/strict";
import test from "node:test";
import { createRingtonePlayer } from "../../lib/softphone-ringtone";

class FakeGain {
  gain = { value: 0 };
  connect() {}
  disconnect() {}
}

class FakeOscillator {
  frequency = { value: 0 };
  started = 0;
  stopped = 0;
  connect() {}
  disconnect() {}
  start() { this.started += 1; }
  stop() { this.stopped += 1; }
}

class FakeAudioContext {
  state: "running" | "suspended" = "running";
  destination = {};
  oscillators: FakeOscillator[] = [];
  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }
  createGain() {
    return new FakeGain() as unknown as GainNode;
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

function fakeAudioContextCtor(instances: FakeAudioContext[]): new () => AudioContext {
  return class extends FakeAudioContext {
    constructor() {
      super();
      instances.push(this);
    }
  } as unknown as new () => AudioContext;
}

test("createRingtonePlayer is a no-op without an AudioContext constructor", () => {
  const player = createRingtonePlayer(undefined);
  assert.doesNotThrow(() => player.start());
  assert.doesNotThrow(() => player.stop());
});

test("start() plays a tone immediately using the injected AudioContext", () => {
  const instances: FakeAudioContext[] = [];
  const player = createRingtonePlayer(fakeAudioContextCtor(instances));

  player.start();
  assert.equal(instances.length, 1);
  const context = instances[0];
  assert.ok(context.oscillators.length > 0, "expected at least one oscillator to start playing");
  assert.ok(context.oscillators.every((oscillator) => oscillator.started === 1));

  player.stop();
  assert.ok(context.oscillators.every((oscillator) => oscillator.stopped === 1));
});

test("start() is idempotent while already ringing", () => {
  const instances: FakeAudioContext[] = [];
  const player = createRingtonePlayer(fakeAudioContextCtor(instances));

  player.start();
  player.start();
  assert.equal(instances.length, 1, "a second start() should not open a second AudioContext");

  player.stop();
});

test("stop() before start() does not throw", () => {
  const instances: FakeAudioContext[] = [];
  const player = createRingtonePlayer(fakeAudioContextCtor(instances));
  assert.doesNotThrow(() => player.stop());
  assert.equal(instances.length, 0);
});
