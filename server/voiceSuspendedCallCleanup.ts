export type ExpiredSuspendedCall = {
  id: string;
  tenantId: string;
  retainedCallSid: string;
};

export async function runSuspendedCallCleanup(deps: {
  claimExpired: () => Promise<ExpiredSuspendedCall[]>;
  claimStaleReconnects?: () => Promise<ExpiredSuspendedCall[]>;
  terminateProviderCall: (call: ExpiredSuspendedCall) => Promise<void>;
  markTerminated: (call: ExpiredSuspendedCall) => Promise<void>;
  markReconnectRestored?: (call: ExpiredSuspendedCall) => Promise<void>;
  releaseFailed: (call: ExpiredSuspendedCall) => Promise<void>;
  releaseReconnectFailed?: (call: ExpiredSuspendedCall) => Promise<void>;
}): Promise<{ claimed: number; terminated: number; restored: number; failed: number }> {
  const calls = await deps.claimExpired();
  const staleReconnects = await deps.claimStaleReconnects?.() ?? [];
  const terminationResults = await Promise.allSettled(calls.map(async call => {
    try {
      await deps.terminateProviderCall(call);
      await deps.markTerminated(call);
    } catch (error) {
      await deps.releaseFailed(call);
      throw error;
    }
  }));
  const reconnectResults = await Promise.allSettled(staleReconnects.map(async call => {
    try {
      if (!deps.markReconnectRestored) {
        throw new Error('Stale reconnect recovery dependencies are missing');
      }
      await deps.markReconnectRestored(call);
    } catch (error) {
      await deps.releaseReconnectFailed?.(call);
      throw error;
    }
  }));
  return {
    claimed: calls.length + staleReconnects.length,
    terminated: terminationResults.filter(result => result.status === 'fulfilled').length,
    restored: reconnectResults.filter(result => result.status === 'fulfilled').length,
    failed: [...terminationResults, ...reconnectResults].filter(result => result.status === 'rejected').length,
  };
}