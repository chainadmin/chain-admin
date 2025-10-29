// Helper functions for making API calls that work in both local and Vercel environments
import { Capacitor } from '@capacitor/core';

function getApiBase(): string {
  // First check if VITE_API_URL is set (allows override)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // For native mobile platforms (iOS/Android), ALWAYS use the production server
  // Check multiple platform indicators to ensure we catch all native scenarios
  const platform = Capacitor.getPlatform();
  const isNative = platform === 'ios' || platform === 'android' || Capacitor.isNativePlatform();
  
  if (isNative) {
    return import.meta.env.VITE_API_BASE_URL || 'https://chain-admin-production.up.railway.app';
  }
  
  // Only use localhost:5000 if we're actually on localhost
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:5000';
  }
  
  // For Replit webview and production, use same origin (empty string = relative URLs)
  // The Express server serves both frontend and API on the same port in Replit
  return '';
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