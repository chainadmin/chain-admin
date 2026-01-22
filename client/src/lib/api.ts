import { isExpoApp, getPlatform } from './expo-bridge';

export function getApiBase(): string {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  if (isExpoApp()) {
    return 'https://chain-admin-production.up.railway.app';
  }
  
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:5000';
  }
  
  if (typeof window !== 'undefined' && 
      !window.location.hostname.includes('railway.app') &&
      getPlatform() === 'web') {
    return '';
  }
  
  return 'https://chain-admin-production.up.railway.app';
}

const API_BASE = getApiBase();

export function getApiEndpoint(path: string): string {
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  
  return API_BASE + path;
}

export async function apiCall(
  method: string,
  endpoint: string,
  data?: any,
  token?: string | null
): Promise<Response> {
  const url = getApiEndpoint(endpoint);
  
  const headers: HeadersInit = {};
  
  if (data && !(data instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    console.log('API call with token:', {
      endpoint,
      hasToken: !!token,
      tokenLength: token.length,
      platform: getPlatform(),
      url
    });
  } else {
    console.warn('API call WITHOUT token:', {
      endpoint,
      platform: getPlatform(),
      url
    });
  }
  
  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };
  
  if (data) {
    options.body = data instanceof FormData ? data : JSON.stringify(data);
  }
  
  try {
    const response = await fetch(url, options);
    
    console.log('API response:', {
      endpoint,
      status: response.status,
      ok: response.ok
    });
    
    return response;
  } catch (error) {
    console.error(`API call failed: ${method} ${url}`, error);
    throw error;
  }
}
