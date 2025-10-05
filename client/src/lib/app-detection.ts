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
