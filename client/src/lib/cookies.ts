// Helper functions for cookie management

export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

export function setCookie(name: string, value: string, days: number = 7) {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = `expires=${date.toUTCString()}`;
  
  // Set cookie with domain support for subdomains
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const domain = isLocalhost ? '' : `domain=.${hostname.split('.').slice(-2).join('.')};`;
  
  document.cookie = `${name}=${value};${expires};path=/;${domain}SameSite=Lax`;
}

export function deleteCookie(name: string) {
  // Delete cookie on current domain and parent domain
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;`;
  
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isLocalhost) {
    const parentDomain = `.${hostname.split('.').slice(-2).join('.')}`;
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;domain=${parentDomain};`;
  }
}

export function getAuthToken(): string | null {
  // Check cookies first, then localStorage for backwards compatibility
  const cookieToken = getCookie('authToken');
  if (cookieToken) return cookieToken;
  
  return localStorage.getItem('authToken');
}

export function clearAuth() {
  // Clear both cookies and localStorage
  deleteCookie('authToken');
  deleteCookie('tenantSlug');
  deleteCookie('tenantName');
  localStorage.removeItem('authToken');
  localStorage.removeItem('userSession');
}