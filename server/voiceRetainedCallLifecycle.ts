import { createHash } from 'node:crypto';
import { z } from 'zod';

export const reconnectTokenSchema = z.string().uuid();

export function hashReconnectToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export type RetainedCallbackDecision = 'ANSWERED' | 'RESTORE' | 'IGNORE' | 'WRONG_PARENT';
export type RetentionReconciliationStatus = 'FAILED' | 'ACTIVE' | 'COMPLETED';

const TERMINAL_PROVIDER_STATUSES = new Set(['completed', 'canceled', 'failed', 'busy', 'no-answer']);

/** Only a synchronous, non-retryable provider rejection proves no redirect was accepted. */
export function isDefiniteProviderRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = Number((error as { status?: unknown }).status);
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export function reconcilePreparedRetention(
  activeLegStatus: string,
  retainedLegStatus: string,
): RetentionReconciliationStatus {
  const activeLive = !TERMINAL_PROVIDER_STATUSES.has(activeLegStatus);
  const retainedLive = !TERMINAL_PROVIDER_STATUSES.has(retainedLegStatus);
  if (activeLive) return 'FAILED';
  if (retainedLive) return 'ACTIVE';
  return 'COMPLETED';
}

export function isIdempotentCancelState(status: string): boolean {
  return status === 'ACTIVE' || status === 'CANCELING';
}

export function classifyRetainedCallback(
  retainedCallSid: string,
  body: Record<string, unknown>,
): RetainedCallbackDecision {
  if (body.CallSid !== retainedCallSid && body.ParentCallSid !== retainedCallSid) {
    return 'WRONG_PARENT';
  }
  // Dial action callbacks contain both fields and the parent CallStatus commonly
  // remains "in-progress" even when the child failed. Always classify the Dial
  // result first. Child progress callbacks do not contain DialCallStatus.
  const dialStatus = String(body.DialCallStatus || '').toLowerCase();
  if (dialStatus) {
    if (dialStatus === 'completed') return 'ANSWERED';
    if (['busy', 'failed', 'no-answer', 'canceled'].includes(dialStatus)) return 'RESTORE';
    return 'IGNORE';
  }
  const callStatus = String(body.CallStatus || '').toLowerCase();
  if (callStatus === 'in-progress' || callStatus === 'answered') return 'ANSWERED';
  return 'IGNORE';
}

/**
 * Enforces the critical ordering for a provider-retained call: durable state is
 * prepared first, provider treatment starts second, and ACTIVE is acknowledged
 * only after provider acceptance. The operation id remains the caller's fence.
 */
export async function runDurableRetentionStart<T>(deps: {
  prepare: () => Promise<T>;
  redirectToWaitingMusic: (prepared: T) => Promise<void>;
  acknowledge: (prepared: T) => Promise<boolean>;
  recoverPrepared: (prepared: T) => Promise<void>;
}): Promise<T> {
  const prepared = await deps.prepare();
  try {
    await deps.redirectToWaitingMusic(prepared);
    if (!await deps.acknowledge(prepared)) throw new Error('retention_fence_lost');
    return prepared;
  } catch (error) {
    await deps.recoverPrepared(prepared);
    throw error;
  }
}

export type BeginReconnectResult<T> =
  | { kind: 'STARTED' | 'RETRY'; record: T }
  | { kind: 'CONFLICT' | 'MISSING' };

/**
 * Coordinates the atomic SQL claim with idempotent exact-nonce retries. A
 * provider error deliberately leaves the claimed row untouched because update
 * acceptance is ambiguous and signed callbacks may already be in flight.
 */
export async function beginReconnect<T>(deps: {
  claimActive: () => Promise<T | null>;
  findExactClaim: () => Promise<T | null>;
  hasCompetingClaim: () => Promise<boolean>;
  startProviderReconnect: (record: T) => Promise<void>;
}): Promise<BeginReconnectResult<T>> {
  const claimed = await deps.claimActive();
  if (claimed) {
    await deps.startProviderReconnect(claimed);
    return { kind: 'STARTED', record: claimed };
  }
  const exact = await deps.findExactClaim();
  if (exact) return { kind: 'RETRY', record: exact };
  if (await deps.hasCompetingClaim()) return { kind: 'CONFLICT' };
  return { kind: 'MISSING' };
}