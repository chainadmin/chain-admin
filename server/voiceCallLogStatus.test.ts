import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInboundCallLogStatus } from './voiceCallLogStatus';

test('a parent completed callback cannot erase an authoritative missed Dial result', () => {
  for (const status of ['no-answer', 'busy', 'failed', 'canceled']) {
    assert.equal(resolveInboundCallLogStatus(status, 'completed'), status);
  }
});

test('a voicemail makes an inbound call missed even when the parent call completed', () => {
  assert.equal(resolveInboundCallLogStatus('completed', undefined, true), 'no-answer');
  assert.equal(resolveInboundCallLogStatus('ringing', undefined, true), 'no-answer');
});

test('ordinary inbound lifecycle statuses still advance normally', () => {
  assert.equal(resolveInboundCallLogStatus('ringing', 'in-progress'), 'in-progress');
  assert.equal(resolveInboundCallLogStatus('in-progress', 'completed'), 'completed');
});
