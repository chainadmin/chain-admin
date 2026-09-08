import type { ProductBrand } from "@/config/brands";

export interface SoftphoneUser {
  id: string;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  name: string;
  role: string;
  tenantId: string;
  voipAccess: unknown;
  product: ProductBrand;
  restrictedServices: string[];
}

export interface VoipSession {
  user: SoftphoneUser;
  product: ProductBrand;
  callingAllowed: boolean;
}

export class SoftphoneRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface SoftphoneLoginResult {
  token: string;
  requiresPasswordChange?: boolean;
  product?: ProductBrand;
  user?: SoftphoneUser;
  tenant?: { slug?: string | null; name?: string | null };
}

export function softphoneApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const configured = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_URL?.replace(/\/+$/, "");
  return configured ? `${configured}${normalized}` : normalized;
}

export async function safeResponseJson(response: Response): Promise<Record<string, unknown> | null> {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/.test(contentType)) {
    return null;
  }
  try {
    const value = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function errorMessage(data: Record<string, unknown> | null, fallback: string): string {
  if (!data) return fallback;
  return typeof data.message === "string" && data.message.trim()
    ? data.message
    : typeof data.error === "string" && data.error.trim()
      ? data.error
      : fallback;
}

function requestFallback(status: number, operation: "Sign-in" | "Password change" | "Session validation"): string {
  if (status === 404) return `${operation} endpoint was not found. Check the configured API URL.`;
  if ([502, 503, 504].includes(status)) return `${operation} service is temporarily unavailable. Please try again.`;
  if (status === 401) return operation === "Sign-in"
    ? "Sign-in was rejected, but the server did not return a valid JSON error."
    : `${operation} was rejected by the server.`;
  return `${operation} failed because the server returned an invalid response (HTTP ${status}).`;
}

async function fetchRequest(input: string, init: RequestInit, operation: "Sign-in" | "Password change" | "Session validation") {
  try {
    return await fetch(input, init);
  } catch (error) {
    throw new SoftphoneRequestError(0, `Network error during ${operation.toLowerCase()}. Check your connection and try again.`);
  }
}

export async function requestSoftphoneLogin(
  username: string,
  password: string,
  product: ProductBrand,
): Promise<SoftphoneLoginResult> {
  const response = await fetchRequest(softphoneApiUrl("/api/agency/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password, product }),
  }, "Sign-in");
  const data = await safeResponseJson(response);
  if (!response.ok) {
    throw new SoftphoneRequestError(response.status, errorMessage(data, requestFallback(response.status, "Sign-in")));
  }
  if (!data || typeof data.token !== "string" || !data.token) {
    throw new SoftphoneRequestError(response.status, "Sign-in returned an invalid response without a session token.");
  }
  return data as unknown as SoftphoneLoginResult;
}

export async function requestVoipSession(token: string): Promise<VoipSession> {
  const response = await fetchRequest(softphoneApiUrl("/api/voip/session"), {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  }, "Session validation");
  const data = await safeResponseJson(response);
  if (!response.ok) {
    throw new SoftphoneRequestError(response.status, errorMessage(data, requestFallback(response.status, "Session validation")));
  }
  if (!data || typeof data.callingAllowed !== "boolean" || typeof data.product !== "string" ||
      !data.user || typeof data.user !== "object" || Array.isArray(data.user)) {
    throw new SoftphoneRequestError(response.status, "Session validation returned an invalid response.");
  }
  return data as unknown as VoipSession;
}

export async function requestTemporaryPasswordChange(
  changeToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const response = await fetchRequest(softphoneApiUrl("/api/chiamo/change-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${changeToken}` },
    credentials: "include",
    body: JSON.stringify({ currentPassword, newPassword }),
  }, "Password change");
  const data = await safeResponseJson(response);
  if (!response.ok) {
    throw new SoftphoneRequestError(response.status, errorMessage(data, requestFallback(response.status, "Password change")));
  }
  if (!data || data.success !== true) {
    throw new SoftphoneRequestError(response.status, "Password change returned an invalid response.");
  }
}

export function isMatchingVoipSession(session: VoipSession, product: ProductBrand): boolean {
  return session.product === product &&
    session.user?.product === product &&
    typeof session.user?.id === "string" &&
    typeof session.user?.tenantId === "string";
}

export function softphoneScope(product: ProductBrand, user: Pick<SoftphoneUser, "tenantId" | "id">): string {
  return `${product}:${user.tenantId}:${user.id}`;
}

export function scopedSoftphoneKey(scope: string, value: "user"): string {
  return `softphone:${scope}:${value}`;
}

export function clearLegacySoftphoneCache(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem("softphone_token");
  storage.removeItem("softphone_user");
}

export function cacheVerifiedSoftphoneUser(storage: Pick<Storage, "setItem" | "removeItem">, session: VoipSession): void {
  clearLegacySoftphoneCache(storage);
  storage.setItem(scopedSoftphoneKey(softphoneScope(session.product, session.user), "user"), JSON.stringify(session.user));
}