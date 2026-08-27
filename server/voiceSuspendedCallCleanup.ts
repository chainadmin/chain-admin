export type ExpiredSuspendedCall = {
  id: string;
  tenantId: string;
  retainedCallSid: string;
};

export async function runSuspendedCallCleanup(deps: {
  claimExpired: () => Promise<ExpiredSuspendedCall[]>;
  terminateProviderCall: (call: ExpiredSuspendedCall) => Promise<void>;
  markTerminated: (call: ExpiredSuspendedCall) => Promise<void>;
  releaseFailed: (call: ExpiredSuspendedCall) => Promise<void>;
}): Promise<{ claimed: number; terminated: number; failed: number }> {
  const calls = await deps.claimExpired();
  const results = await Promise.allSettled(calls.map(async call => {
    try {
      await deps.terminateProviderCall(call);
      await deps.markTerminated(call);
    } catch (error) {
      await deps.releaseFailed(call);
      throw error;
    }
  }));
  return {
    claimed: calls.length,
    terminated: results.filter(result => result.status === 'fulfilled').length,
    failed: results.filter(result => result.status === 'rejected').length,
  };
}