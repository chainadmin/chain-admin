export interface RingtonePlayer {
  start(): void;
  stop(): void;
}

type AudioContextCtor = new () => AudioContext;

function resolveAudioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
}

/**
 * Generates a two-tone ring cadence with the Web Audio API so an incoming
 * call is audible without shipping a ringtone asset. Rings in short bursts
 * (like a real phone) rather than one continuous tone.
 */
export function createRingtonePlayer(Ctor: AudioContextCtor | undefined = resolveAudioContextCtor()): RingtonePlayer {
  let context: AudioContext | null = null;
  let cycleTimer: ReturnType<typeof setTimeout> | null = null;
  let oscillators: OscillatorNode[] = [];
  let running = false;

  const stopTone = () => {
    for (const oscillator of oscillators) {
      try { oscillator.stop(); } catch { /* already stopped */ }
      oscillator.disconnect();
    }
    oscillators = [];
  };

  const playBurst = () => {
    if (!context) return;
    for (const frequency of [440, 480]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.12;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillators.push(oscillator);
    }
  };

  const cycle = () => {
    if (!running) return;
    playBurst();
    cycleTimer = setTimeout(() => {
      stopTone();
      if (!running) return;
      cycleTimer = setTimeout(cycle, 3000);
    }, 1500);
  };

  return {
    start() {
      if (running || !Ctor) return;
      running = true;
      if (!context) context = new Ctor();
      if (context.state === "suspended") void context.resume();
      cycle();
    },
    stop() {
      running = false;
      if (cycleTimer) {
        clearTimeout(cycleTimer);
        cycleTimer = null;
      }
      stopTone();
    },
  };
}
