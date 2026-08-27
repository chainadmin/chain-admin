import assert from 'node:assert/strict';
import test from 'node:test';
import { runSuspendedCallCleanup } from './voiceSuspendedCallCleanup';

test('scheduled cleanup atomically claims and terminates retained provider legs', async () => {
  const terminated: string[] = [];
  const result = await runSuspendedCallCleanup({
    claimExpired: async () => [
      { id: 'one', tenantId: 'tenant-a', retainedCallSid: 'CA-active-expired' },
      { id: 'two', tenantId: 'tenant-b', retainedCallSid: 'CA-stale-resuming' },
    ],
    terminateProviderCall: async call => {
      terminated.push(`${call.tenantId}:${call.retainedCallSid}`);
    },
    markTerminated: async () => undefined,
    releaseFailed: async () => undefined,
  });
  assert.deepEqual(terminated, [
    'tenant-a:CA-active-expired',
    'tenant-b:CA-stale-resuming',
  ]);
  assert.deepEqual(result, { claimed: 2, terminated: 2, failed: 0 });
});

test('one provider failure does not prevent other expired calls from terminating', async () => {
  const result = await runSuspendedCallCleanup({
    claimExpired: async () => [
      { id: 'one', tenantId: 'tenant-a', retainedCallSid: 'CA-fail' },
      { id: 'two', tenantId: 'tenant-a', retainedCallSid: 'CA-ok' },
    ],
    terminateProviderCall: async call => {
      if (call.retainedCallSid === 'CA-fail') throw new Error('provider unavailable');
    },
    markTerminated: async () => undefined,
    releaseFailed: async () => undefined,
  });
  assert.deepEqual(result, { claimed: 2, terminated: 1, failed: 1 });
});