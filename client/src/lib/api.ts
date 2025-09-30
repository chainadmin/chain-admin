// Helper functions for making API calls that work in both local and Vercel environments

export function getApiEndpoint(path: string): string {
  // In production (Vercel), use relative paths
  // In development, also use relative paths (Express server handles them)
  // This ensures compatibility with both environments
  
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  
  // For Vercel deployment, the API routes are serverless functions
  // For local development, Express handles the routes
  return path;
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