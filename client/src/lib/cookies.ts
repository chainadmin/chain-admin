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
  const isSecure = window.location.protocol === 'https:';
  
  const domain = isLocalhost ? '' : `domain=.${hostname.split('.').slice(-2).join('.')};`;
  const secure = isSecure ? 'Secure;' : '';

  const cookieString = `${name}=${value};${expires};path=/;${domain}${secure}SameSite=Lax`;
  console.log('[setCookie]', { name, valueLength: value.length, hostname, domain, secure, cookieString: cookieString.substring(0, 100) + '...' });
  document.cookie = cookieString;
}

export function persistTenantMetadata({ slug, name }: { slug?: string | null; name?: string | null }) {
  if (typeof window === 'undefined') return;

  if (slug) {
    setCookie('tenantSlug', slug);
    try {
      sessionStorage.setItem('tenantSlug', slug);
      localStorage.setItem('tenantSlug', slug);
    } catch (error) {
      console.warn('Unable to persist tenant slug to storage:', error);
    }
  }

  if (name) {
    setCookie('tenantName', encodeURIComponent(name));
    try {
      sessionStorage.setItem('tenantName', name);
      localStorage.setItem('tenantName', name);
    } catch (error) {
      console.warn('Unable to persist tenant name to storage:', error);
    }
  }
}

export function getStoredTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;

  const cookieSlug = getCookie('tenantSlug');
  if (cookieSlug) return cookieSlug;

  try {
    const sessionSlug = sessionStorage.getItem('tenantSlug');
    if (sessionSlug) return sessionSlug;
  } catch (error) {
    console.warn('Unable to read tenant slug from sessionStorage:', error);
  }

  try {
    const localSlug = localStorage.getItem('tenantSlug');
    if (localSlug) return localSlug;
  } catch (error) {
    console.warn('Unable to read tenant slug from localStorage:', error);
  }

  return null;
}

export function getStoredTenantName(): string | null {
  if (typeof window === 'undefined') return null;

  const cookieName = getCookie('tenantName');
  if (cookieName) {
    try {
      return decodeURIComponent(cookieName);
    } catch {
      return cookieName;
    }
  }

  try {
    const sessionName = sessionStorage.getItem('tenantName');
    if (sessionName) return sessionName;
  } catch (error) {
    console.warn('Unable to read tenant name from sessionStorage:', error);
  }

  try {
    const localName = localStorage.getItem('tenantName');
    if (localName) return localName;
  } catch (error) {
    console.warn('Unable to read tenant name from localStorage:', error);
  }

  return null;
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
  const localToken = localStorage.getItem('authToken');
  
  console.log('[getAuthToken]', { 
    hostname: window.location.hostname,
    hasCookieToken: !!cookieToken,
    hasLocalToken: !!localToken,
    cookieTokenLength: cookieToken?.length || 0,
    localTokenLength: localToken?.length || 0,
    allCookies: document.cookie.split(';').map(c => c.trim().split('=')[0])
  });
  
  if (cookieToken) return cookieToken;
  return localToken;
}

export function clearAuth() {
  // Clear both cookies and localStorage
  deleteCookie('authToken');
  deleteCookie('tenantSlug');
  deleteCookie('tenantName');
  localStorage.removeItem('authToken');
  localStorage.removeItem('userSession');
  try {
    sessionStorage.removeItem('tenantSlug');
    sessionStorage.removeItem('tenantName');
  } catch (error) {
    console.warn('Unable to clear tenant metadata from sessionStorage:', error);
  }
  try {
    localStorage.removeItem('tenantSlug');
    localStorage.removeItem('tenantName');
  } catch (error) {
    console.warn('Unable to clear tenant metadata from localStorage:', error);
  }
}
