export interface TokenUpdatableDevice {
  updateToken(token: string): void;
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