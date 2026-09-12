export const RING_VOLUME_STORAGE_KEY = "softphone:ring-volume";
export const RING_MUTED_STORAGE_KEY = "softphone:ring-muted";
export const DEFAULT_RING_VOLUME = 0.5;

export interface RingtoneStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function clampRingVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RING_VOLUME;
  return Math.min(1, Math.max(0, value));
}

export function readStoredRingVolume(storage: RingtoneStorage | null | undefined): number {
  const raw = storage?.getItem(RING_VOLUME_STORAGE_KEY);
  if (raw === null || raw === undefined) return DEFAULT_RING_VOLUME;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampRingVolume(parsed) : DEFAULT_RING_VOLUME;
}

export function writeStoredRingVolume(storage: RingtoneStorage | null | undefined, value: number): void {
  storage?.setItem(RING_VOLUME_STORAGE_KEY, String(clampRingVolume(value)));
}

export function readStoredRingMuted(storage: RingtoneStorage | null | undefined): boolean {
  return storage?.getItem(RING_MUTED_STORAGE_KEY) === "true";
}

export function writeStoredRingMuted(storage: RingtoneStorage | null | undefined, value: boolean): void {
  storage?.setItem(RING_MUTED_STORAGE_KEY, value ? "true" : "false");
}

/**
 * Plays a looping two-tone ring cadence with a user-controlled volume, replacing
 * the Twilio Voice SDK's built-in incoming ringtone (which has no volume control).
 * Web Audio requires no bundled audio asset and lets volume be changed live.
 */
export class RingtonePlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private cadenceTimer: ReturnType<typeof setTimeout> | null = null;
  private volume = DEFAULT_RING_VOLUME;
  private playing = false;

  setVolume(value: number): void {
    this.volume = clampRingVolume(value);
    if (this.gain) this.gain.gain.value = this.volume;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.scheduleCadence();
  }

  stop(): void {
    this.playing = false;
    if (this.cadenceTimer) {
      clearTimeout(this.cadenceTimer);
      this.cadenceTimer = null;
    }
    this.stopTone();
  }

  private scheduleCadence(): void {
    if (!this.playing) return;
    this.startTone();
    // North American ring cadence: ~2s on, ~4s off.
    this.cadenceTimer = setTimeout(() => {
      this.stopTone();
      this.cadenceTimer = setTimeout(() => this.scheduleCadence(), 4000);
    }, 2000);
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    this.context = new AudioContextCtor();
    return this.context;
  }

  private startTone(): void {
    const context = this.ensureContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume();
    this.stopTone();

    const gain = context.createGain();
    gain.gain.value = this.volume;
    gain.connect(context.destination);
    this.gain = gain;

    // A dual-frequency tone (440Hz + 480Hz) approximates a classic phone ring.
    this.oscillators = [440, 480].map((frequency) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start();
      return oscillator;
    });
  }

  private stopTone(): void {
    for (const oscillator of this.oscillators) {
      try { oscillator.stop(); } catch { /* already stopped */ }
      oscillator.disconnect();
    }
    this.oscillators = [];
    this.gain?.disconnect();
    this.gain = null;
  }
}
