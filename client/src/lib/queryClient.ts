import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAuthToken } from "./cookies";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Get the API base URL from environment or use relative URLs
const API_BASE = import.meta.env.VITE_API_URL || '';

function getApiUrl(path: string): string {
  if (path.startsWith('http')) {
    return path; // Already a full URL
  }
  return API_BASE + path;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = getApiUrl(url);
  const token = getAuthToken(); // Now checks cookies first, then localStorage
  const consumerToken = localStorage.getItem('consumerToken'); // Check for consumer token
  const headers: HeadersInit = {};
  
  // Only set Content-Type for non-FormData requests
  if (data && !(data instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  
  // Use consumer token for consumer endpoints, otherwise use admin token
  if (url.includes('/consumer/') && consumerToken) {
    headers["Authorization"] = `Bearer ${consumerToken}`;
  } else if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const res = await fetch(fullUrl, {
    method,
    headers,
    // FormData should be sent as-is, JSON data should be stringified
    body: data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined),
    credentials: "include", // Important for cookies to be sent
    cache: "no-store",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = getApiUrl(queryKey.join("/") as string);
    const token = getAuthToken(); // Now checks cookies first, then localStorage
    const consumerToken = localStorage.getItem('consumerToken'); // Check for consumer token
    const headers: HeadersInit = {};
    
    // Use consumer token for consumer endpoints, otherwise use admin token
    if (url.includes('/consumer/') && consumerToken) {
      headers["Authorization"] = `Bearer ${consumerToken}`;
    } else if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    const res = await fetch(url, {
      headers,
      credentials: "include", // Important for cookies to be sent
      cache: "no-store",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
