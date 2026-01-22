import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { isExpoApp } from './expo-bridge';
import { getAuthToken } from "./cookies";
import { getStoredConsumerToken } from "./consumer-auth";

function isConsumerEndpoint(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.includes("/consumer/") || normalized.includes("/consumer-");
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function parseErrorResponse(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return await res.json();
    } catch (error) {
      console.error("Failed to parse JSON error response", error);
      return null;
    }
  }

  try {
    const text = await res.text();
    return text || null;
  } catch (error) {
    console.error("Failed to read error response body", error);
    return null;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const errorData = await parseErrorResponse(res);
    const message =
      (typeof errorData === "object" && errorData !== null && "message" in errorData)
        ? String((errorData as Record<string, unknown>).message ?? res.statusText)
        : (typeof errorData === "string" && errorData.trim().length > 0)
          ? errorData
          : res.statusText || `Request failed with status ${res.status}`;

    throw new ApiError(res.status, message, errorData);
  }
}

function getApiUrl(path: string): string {
  if (path.startsWith("http")) {
    return path;
  }

  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL + path;
  }
  
  if (isExpoApp()) {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://chain-admin-production.up.railway.app';
    return baseUrl + path;
  }
  
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  
  if (hostname === 'localhost') {
    return 'http://localhost:5000' + path;
  }
  
  return path;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = getApiUrl(url);
  const token = getAuthToken();
  const consumerToken = getStoredConsumerToken();
  const adminToken = sessionStorage.getItem("admin_token");
  const headers: HeadersInit = {};
  
  if (data && !(data instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  
  if (consumerToken && isConsumerEndpoint(url)) {
    headers["Authorization"] = `Bearer ${consumerToken}`;
  } else if (adminToken && url.includes('/api/admin')) {
    headers["Authorization"] = `Bearer ${adminToken}`;
  } else if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  try {
    const res = await fetch(fullUrl, {
      method,
      headers,
      body: data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined),
      credentials: "include",
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ApiError(0, "Network error: Unable to connect to server. Please check your internet connection.", error);
    }
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const queryPath = Array.isArray(queryKey) && queryKey.length === 1 && typeof queryKey[0] === 'string'
      ? queryKey[0]
      : queryKey.join("/") as string;
    
    if (queryPath.includes("no-fetch") || queryPath === "skip") {
      return null;
    }
    
    const url = getApiUrl(queryPath);
    const token = getAuthToken();
    const consumerToken = getStoredConsumerToken();
    const adminToken = sessionStorage.getItem("admin_token");
    const headers: HeadersInit = {};
    
    if (consumerToken && isConsumerEndpoint(url)) {
      headers["Authorization"] = `Bearer ${consumerToken}`;
    } else if (adminToken && url.includes('/api/admin')) {
      headers["Authorization"] = `Bearer ${adminToken}`;
    } else if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    try {
      const res = await fetch(url, {
        headers,
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      if (error instanceof TypeError) {
        throw new ApiError(0, "Network error: Unable to connect to server. Please check your internet connection.", error);
      }
      throw error;
    }
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
