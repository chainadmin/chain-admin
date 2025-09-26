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

const CACHE_BYPASS_PATTERNS = [
  '/api/consumer',
  'api/consumer',
  '/api/consumer-',
  'api/consumer-',
  '/api/public/agency-branding',
];

function shouldBypassCache(path: string): boolean {
  return CACHE_BYPASS_PATTERNS.some(pattern => path.includes(pattern));
}

function withCacheBust(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_=${Date.now()}`;
}

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
  const isGet = method.toUpperCase() === 'GET';
  const bypassCache = isGet && shouldBypassCache(url);
  const initialUrl = bypassCache ? withCacheBust(fullUrl) : fullUrl;
  const token = getAuthToken(); // Now checks cookies first, then localStorage
  const consumerToken = localStorage.getItem('consumerToken'); // Check for consumer token
  const baseHeaders: Record<string, string> = {};

  // Only set Content-Type for non-FormData requests
  if (data && !(data instanceof FormData)) {
    baseHeaders["Content-Type"] = "application/json";
  }

  // Use consumer token for consumer endpoints, otherwise use admin token
  if (url.includes('/consumer') && consumerToken) {
    baseHeaders["Authorization"] = `Bearer ${consumerToken}`;
  } else if (token) {
    baseHeaders["Authorization"] = `Bearer ${token}`;
  }

  const fetchInit: RequestInit = {
    method,
    headers: baseHeaders,
    // FormData should be sent as-is, JSON data should be stringified
    body: data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined),
    credentials: "include", // Important for cookies to be sent
    cache: "no-store",
  };

  let res = await fetch(initialUrl, fetchInit);

  if (res.status === 304 && bypassCache) {
    const retryInit: RequestInit = {
      ...fetchInit,
      headers: {
        ...baseHeaders,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    };
    res = await fetch(withCacheBust(fullUrl), retryInit);
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const rawPath = queryKey.join("/") as string;
    const url = getApiUrl(rawPath);
    const bypassCache = shouldBypassCache(rawPath);
    const requestUrl = bypassCache ? withCacheBust(url) : url;
    const token = getAuthToken(); // Now checks cookies first, then localStorage
    const consumerToken = localStorage.getItem('consumerToken'); // Check for consumer token
    const baseHeaders: Record<string, string> = {};

    // Use consumer token for consumer endpoints, otherwise use admin token
    if (url.includes('/consumer') && consumerToken) {
      baseHeaders["Authorization"] = `Bearer ${consumerToken}`;
    } else if (token) {
      baseHeaders["Authorization"] = `Bearer ${token}`;
    }

    const fetchInit: RequestInit = {
      headers: baseHeaders,
      credentials: "include", // Important for cookies to be sent
      cache: "no-store",
    };

    let res = await fetch(requestUrl, fetchInit);

    if (res.status === 304 && bypassCache) {
      const retryInit: RequestInit = {
        ...fetchInit,
        headers: {
          ...baseHeaders,
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      };
      res = await fetch(withCacheBust(url), retryInit);
    }

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
