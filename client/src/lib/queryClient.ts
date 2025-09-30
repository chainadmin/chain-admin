import { QueryClient, QueryFunction } from "@tanstack/react-query";
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

// Get the API base URL from environment or use relative URLs
const API_BASE = import.meta.env.VITE_API_URL || "";

function getApiUrl(path: string): string {
  if (path.startsWith("http")) {
    return path; // Already a full URL
  }

  if (!API_BASE) {
    return path;
  }

  try {
    return new URL(path, API_BASE).toString();
  } catch (error) {
    console.error("Failed to construct API URL", { path, API_BASE, error });
    const normalizedBase = API_BASE.replace(/\/$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = getApiUrl(url);
  const token = getAuthToken(); // Now checks cookies first, then localStorage
  const consumerToken = getStoredConsumerToken(); // Check for consumer token
  const headers: HeadersInit = {};
  
  // Only set Content-Type for non-FormData requests
  if (data && !(data instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  
  // Use consumer token for consumer endpoints, otherwise use admin token
  if (consumerToken && isConsumerEndpoint(url)) {
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
    // Handle single string query keys (like our consumer accounts URL)
    const queryPath = Array.isArray(queryKey) && queryKey.length === 1 && typeof queryKey[0] === 'string'
      ? queryKey[0]
      : queryKey.join("/") as string;
    
    // Skip fetching for placeholder keys
    if (queryPath.includes("no-fetch") || queryPath === "skip") {
      return null;
    }
    
    const url = getApiUrl(queryPath);
    const token = getAuthToken(); // Now checks cookies first, then localStorage
    const consumerToken = getStoredConsumerToken(); // Check for consumer token
    const headers: HeadersInit = {};
    
    // Use consumer token for consumer endpoints, otherwise use admin token
    if (consumerToken && isConsumerEndpoint(url)) {
      headers["Authorization"] = `Bearer ${consumerToken}`;
    } else if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    const res = await fetch(url, {
      headers,
      credentials: "include", // Important for cookies to be sent
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
