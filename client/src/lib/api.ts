// Helper functions for making API calls that work in both local and Vercel environments
import { Capacitor } from '@capacitor/core';

function getApiBase(): string {
  // First check if VITE_API_URL is set (allows override)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // For native mobile platforms (iOS/Android), use the production server
  if (Capacitor.isNativePlatform()) {
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
    return response;
  } catch (error) {
    console.error(`API call failed: ${method} ${url}`, error);
    throw error;
  }
}