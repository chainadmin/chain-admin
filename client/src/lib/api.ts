// Helper functions for making API calls that work in both local and Vercel environments

function getApiBase(): string {
  // First check if VITE_API_URL is set (allows override)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Check if we're in development mode (localhost)
  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
  
  // For local development, use Express server on port 5000
  if (isDevelopment) {
    return 'http://localhost:5000';
  }
  
  // For production/preview (Vercel), use relative paths (same origin)
  // This works for both production and Vercel preview deployments
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