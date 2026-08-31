import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCompanyMessagingBlockMessage,
  isServiceRestrictedForMember,
} from './messagingAccess';

test('company messaging access blocks trials and explicitly disabled services', () => {
  assert.match(
    getCompanyMessagingBlockMessage('email', { isTrialAccount: true }) || '',
    /trial period/,
  );
  assert.match(
    getCompanyMessagingBlockMessage('sms', { smsServiceEnabled: false }) || '',
    /disabled/,
  );
  assert.equal(
    getCompanyMessagingBlockMessage('email', { emailServiceEnabled: true }),
    null,
  );
});

test('member restrictions apply to team roles but not owners', () => {
  assert.equal(isServiceRestrictedForMember('email', 'agent', ['email']), true);
  assert.equal(isServiceRestrictedForMember('sms', 'manager', ['email']), false);
  assert.equal(isServiceRestrictedForMember('email', 'owner', ['email']), false);
});