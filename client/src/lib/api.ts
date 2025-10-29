// Helper functions for making API calls that work in both local and Vercel environments
import { Capacitor } from '@capacitor/core';

function getApiBase(): string {
  // First check if EXPO_PUBLIC_API_URL is set (for Expo builds)
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  // Then check if VITE_API_URL is set (for Vite builds)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Check if we're in a Capacitor native environment FIRST (before localhost check)
  // Capacitor WebViews use capacitor://localhost, so we need to detect this early
  const isCapacitor = typeof window !== 'undefined' && 
                     (window.location.protocol === 'capacitor:' || 
                      window.location.protocol === 'ionic:' ||
                      Capacitor.isNativePlatform());
  
  if (isCapacitor) {
    // Native Capacitor apps ALWAYS use Railway production
    return 'https://chain-admin-production.up.railway.app';
  }
  
  // Only use localhost:5000 if we're actually on localhost in a BROWSER (not Capacitor)
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:5000';
  }
  
  // For web browsers on same domain (Replit), use relative URLs
  if (typeof window !== 'undefined' && 
      !window.location.hostname.includes('railway.app') &&
      Capacitor.getPlatform() === 'web') {
    return '';
  }
  
  // For ALL other cases, use Railway production
  return 'https://chain-admin-production.up.railway.app';
}

const API_BASE = getApiBase();

export function getApiEndpoint(path: string): string {
  // Ensure path starts with /
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
    console.log('🔑 API call with token:', {
      endpoint,
      hasToken: !!token,
      tokenLength: token.length,
      platform: Capacitor.getPlatform(),
      url
    });
  } else {
    console.warn('⚠️ API call WITHOUT token:', {
      endpoint,
      platform: Capacitor.getPlatform(),
      url
    });
  }
  
  const options: RequestInit = {
    method,
    headers,
    credentials: 'include', // Include cookies for session management
  };
  
  if (data) {
    options.body = data instanceof FormData ? data : JSON.stringify(data);
  }
  
  try {
    const response = await fetch(url, options);
    
    // Log response details for debugging
    console.log('📡 API response:', {
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