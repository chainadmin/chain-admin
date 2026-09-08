export interface TokenUpdatableDevice {
  updateToken(token: string): void;
}

export interface MuteableCall {
  mute(shouldMute: boolean): void;
}

export function buildSoftphoneDeviceOptions<T>(codecPreferences: T[]) {
  return {
    logLevel: 1 as const,
    codecPreferences,
    // Twilio otherwise discards invites before emitting "incoming" while a call is active.
    allowIncomingWhileBusy: true,
  };
}

export function synchronizeCallMute(call: MuteableCall, shouldMute: boolean): void {
  call.mute(shouldMute);
}

export function canStartSoftphoneOutboundCall(options: {
  hasNumber: boolean;
  dialLocked: boolean;
  requestPending: boolean;
  hasActiveCall: boolean;
  callTransitionPending: boolean;
}): boolean {
  return options.hasNumber &&
    !options.dialLocked &&
    !options.requestPending &&
    !options.hasActiveCall &&
    !options.callTransitionPending;
}

export type SoftphoneCallProgress = "active" | "transitioning" | "idle";

export function scheduleSoftphoneCallCleanup(
  getProgress: () => SoftphoneCallProgress,
  cleanup: () => void,
  schedule: (callback: () => void, delayMs: number) => unknown = setTimeout,
  initialDelayMs = 2_000,
  transitionRetryMs = 250,
): unknown {
  const attemptCleanup = () => {
    const progress = getProgress();
    if (progress === "active") return;
    if (progress === "transitioning") {
      schedule(attemptCleanup, transitionRetryMs);
      return;
    }
    cleanup();
  };
  return schedule(attemptCleanup, initialDelayMs);
}

/** Refreshes credentials on the existing device; lifecycle/destruction belongs to the session owner. */
export function updateLiveDeviceToken(
  device: TokenUpdatableDevice | null,
  currentToken: string | null,
  nextToken: string,
): string {
  if (!device || currentToken === nextToken) return currentToken ?? nextToken;
  device.updateToken(nextToken);
  return nextToken;
}