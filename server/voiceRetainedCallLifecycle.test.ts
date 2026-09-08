import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginReconnect,
  classifyRetainedCallback,
  hashReconnectToken,
  reconcilePreparedRetention,
  reconnectTokenSchema,
  runDurableRetentionStart,
} from './voiceRetainedCallLifecycle';

test('reconnect intention nonce must be a UUID and is stored only as a hash', () => {
  const token = '434c518b-cc43-4fa6-85d6-22e2e0586930';
  assert.equal(reconnectTokenSchema.safeParse(token).success, true);
  assert.equal(reconnectTokenSchema.safeParse('old-token').success, false);
  assert.equal(hashReconnectToken(token).length, 64);
  assert.doesNotMatch(hashReconnectToken(token), /434c518b/);
});

test('callback accepts an answer only for the retained parent leg', () => {
  assert.equal(classifyRetainedCallback('CA-parent', {
    ParentCallSid: 'CA-parent',
    CallSid: 'CA-client',
    CallStatus: 'in-progress',
  }), 'ANSWERED');
  assert.equal(classifyRetainedCallback('CA-parent', {
    ParentCallSid: 'CA-other',
    CallSid: 'CA-client',
    CallStatus: 'in-progress',
  }), 'WRONG_PARENT');
});

test('dial no-answer, busy, and failure restore music while completion is ignored', () => {
  for (const status of ['no-answer', 'busy', 'failed', 'canceled']) {
    assert.equal(classifyRetainedCallback('CA-parent', {
      CallSid: 'CA-parent',
      CallStatus: 'in-progress',
      DialCallStatus: status,
    }), 'RESTORE');
  }
  assert.equal(classifyRetainedCallback('CA-parent', {
    ParentCallSid: 'CA-parent',
    CallStatus: 'completed',
  }), 'IGNORE');
  assert.equal(classifyRetainedCallback('CA-parent', {
    CallSid: 'CA-parent',
    DialCallStatus: 'completed',
  }), 'ANSWERED');
});

test('durable record is prepared before provider redirection and acknowledgement', async () => {
  const events: string[] = [];
  await runDurableRetentionStart({
    prepare: async () => { events.push('prepare'); return { id: 'retained' }; },
    redirectToWaitingMusic: async () => { events.push('provider'); },
    acknowledge: async () => { events.push('ack'); return true; },
    recoverPrepared: async () => { events.push('recover'); },
  });
  assert.deepEqual(events, ['prepare', 'provider', 'ack']);
});

test('provider start and lost acknowledgement recover the durable prepared record', async () => {
  for (const failAt of ['provider', 'ack'] as const) {
    const events: string[] = [];
    await assert.rejects(runDurableRetentionStart({
      prepare: async () => ({ id: 'retained' }),
      redirectToWaitingMusic: async () => {
        events.push('provider');
        if (failAt === 'provider') throw new Error('provider unavailable');
      },
      acknowledge: async () => {
        events.push('ack');
        return failAt !== 'ack';
      },
      recoverPrepared: async () => { events.push('recover'); },
    }));
    assert.equal(events.at(-1), 'recover');
  }
});

test('concurrent pickup nonces produce one provider start and one conflict', async () => {
  let state: 'ACTIVE' | 'RESUMING' = 'ACTIVE';
  let ownerToken = '';
  let providerStarts = 0;
  const attempt = (token: string) => beginReconnect({
    claimActive: async () => {
      if (state !== 'ACTIVE') return null;
      state = 'RESUMING';
      ownerToken = token;
      return { token };
    },
    findExactClaim: async () => state === 'RESUMING' && ownerToken === token ? { token } : null,
    hasCompetingClaim: async () => state === 'RESUMING',
    startProviderReconnect: async () => { providerStarts += 1; },
  });
  const [first, second] = await Promise.all([attempt('nonce-a'), attempt('nonce-b')]);
  assert.deepEqual([first.kind, second.kind].sort(), ['CONFLICT', 'STARTED']);
  assert.equal(providerStarts, 1);
});

test('exact nonce retry is idempotent and ambiguous provider failure preserves claim', async () => {
  let starts = 0;
  await assert.rejects(beginReconnect({
    claimActive: async () => ({ id: 'call' }),
    findExactClaim: async () => null,
    hasCompetingClaim: async () => false,
    startProviderReconnect: async () => { starts += 1; throw new Error('response lost'); },
  }));
  const retry = await beginReconnect({
    claimActive: async () => null,
    findExactClaim: async () => ({ id: 'call' }),
    hasCompetingClaim: async () => true,
    startProviderReconnect: async () => { starts += 1; },
  });
  assert.equal(retry.kind, 'RETRY');
  assert.equal(starts, 1);
});

test('crash reconciliation never publishes a still-live original agent leg', () => {
  assert.equal(reconcilePreparedRetention('in-progress', 'in-progress'), 'FAILED');
  assert.equal(reconcilePreparedRetention('completed', 'in-progress'), 'ACTIVE');
  assert.equal(reconcilePreparedRetention('completed', 'completed'), 'COMPLETED');
});