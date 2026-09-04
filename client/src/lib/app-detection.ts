const appEnvironment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};

/**
 * Detect if the app is running inside a Capacitor native container
 */
export function isCapacitorApp(): boolean {
  // Check if Capacitor is available
  if (typeof window === 'undefined') {
    return false;
  }

  // Capacitor adds a global Capacitor object
  return !!(window as any).Capacitor;
}

/**
 * Get deep link parameters from URL
 */
export function getDeepLinkParams(): URLSearchParams {
  if (typeof window === 'undefined') {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
}

/**
 * Get agency slug from deep link or current URL
 */
export function getAgencyFromDeepLink(): string | null {
  const params = getDeepLinkParams();
  return params.get('agency');
}

/**
 * Chiamo Connect is the default Voice presentation inside Chain. The product
 * hostname always keeps its own identity; the flag is only a safe rollback for
 * the embedded Chain experience.
 */
export function isChiamoHostname(hostname = typeof window === "undefined" ? "" : window.location.hostname): boolean {
  const configuredDomain = appEnvironment.VITE_CHIAMO_DOMAIN || "chiamoconnect.com";
  const configuredAppDomain = appEnvironment.VITE_CHIAMO_APP_DOMAIN || configuredDomain;
  return hostname === configuredDomain ||
    hostname === configuredAppDomain ||
    hostname.endsWith(`.${configuredDomain}`);
}

export function isChiamoConnectPhoneShell(
  flag = appEnvironment.VITE_CHIAMO_CONNECT_PHONE_SHELL,
  hostname = typeof window === "undefined" ? "" : window.location.hostname,
): boolean {
  return isChiamoHostname(hostname) || flag !== "false";
}
