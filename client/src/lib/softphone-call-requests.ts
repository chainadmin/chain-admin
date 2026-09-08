import { safeResponseJson, softphoneApiUrl } from "./softphone-session";
import type { PendingReconnect, ReconnectMetadata, RetainedCallKind } from "./softphone-call-lifecycle";

export class SoftphoneCallRequestError extends Error {
  constructor(public status: number, public code: string | undefined, message: string) {
    super(message);
  }
}

async function responseError(response: Response, fallback: string): Promise<SoftphoneCallRequestError> {
  const data = await safeResponseJson(response);
  return new SoftphoneCallRequestError(
    response.status,
    typeof data?.code === "string" ? data.code : undefined,
    typeof data?.message === "string" ? data.message : fallback,
  );
}

export async function requestReconnect(
  kind: RetainedCallKind,
  id: string,
  reconnectToken: string,
  headers: Record<string, string>,
): Promise<ReconnectMetadata> {
  const segment = kind === "held" ? "held-calls" : "parked-calls";
  const action = kind === "held" ? "resume" : "pickup";
  const response = await fetch(softphoneApiUrl(`/api/voip/${segment}/${id}/${action}`), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    credentials: "include",
    body: JSON.stringify({ reconnectToken }),
  });
  if (!response.ok) throw await responseError(response, `Could not ${action} call. The caller remains ${kind}.`);
  const data = await safeResponseJson(response);
  const reconnect = data?.reconnect as Record<string, unknown> | undefined;
  if (data?.success !== true || !reconnect ||
      typeof reconnect.id !== "string" || typeof reconnect.token !== "string" ||
      typeof reconnect.expiresAt !== "string" || typeof reconnect.callerName !== "string" ||
      typeof reconnect.callerNumber !== "string") {
    throw new SoftphoneCallRequestError(response.status, undefined, "Reconnect returned an invalid response. The caller remains retained.");
  }
  return reconnect as unknown as ReconnectMetadata;
}

export async function cancelReconnect(pending: PendingReconnect, headers: Record<string, string>): Promise<void> {
  const response = await fetch(softphoneApiUrl(`/api/voip/suspended-calls/${pending.id}/cancel-reconnect`), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    credentials: "include",
    body: JSON.stringify({ reconnectToken: pending.token }),
  });
  if (!response.ok) throw await responseError(response, "Could not cancel reconnect.");
}

export interface RetainableAgentCall {
  parameters: Record<string, string | undefined>;
  disconnect(): void;
}

export async function retainAgentCall<T>(
  kind: RetainedCallKind,
  oldAgentCall: RetainableAgentCall,
  details: { callerName: string; callerNumber: string; duration: number },
  headers: Record<string, string>,
  getCurrentCall: () => RetainableAgentCall | null,
): Promise<T> {
  const activeCallSid = oldAgentCall.parameters.CallSid;
  if (!activeCallSid) throw new SoftphoneCallRequestError(0, undefined, "The active call has no provider call ID.");
  const segment = kind === "held" ? "held-calls" : "parked-calls";
  const response = await fetch(softphoneApiUrl(`/api/voip/${segment}`), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    credentials: "include",
    body: JSON.stringify({ activeCallSid, ...details }),
  });
  if (!response.ok) {
    throw await responseError(
      response,
      kind === "held"
        ? "Could not retain the call. The caller remains connected."
        : "Could not park the call. The caller remains connected.",
    );
  }
  const data = await safeResponseJson(response);
  if (!data || typeof data.id !== "string") {
    throw new SoftphoneCallRequestError(response.status, undefined, "Call retention returned an invalid response. The caller remains connected.");
  }
  if (getCurrentCall() === oldAgentCall) oldAgentCall.disconnect();
  return data as unknown as T;
}