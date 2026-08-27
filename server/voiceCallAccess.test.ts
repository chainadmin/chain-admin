import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTenantVoiceIdentity } from './twilioVoiceService';
import { canUseSoftphone, isVoiceCallOwnedByUser } from './voiceCallAccess';

test('softphone call treatment requires an active authorized user', () => {
  assert.equal(canUseSoftphone({ role: 'owner', isActive: true, voipAccess: false }), true);
  assert.equal(canUseSoftphone({ role: 'manager', isActive: true, voipAccess: false }), true);
  assert.equal(canUseSoftphone({ role: 'agent', isActive: true, voipAccess: true }), true);
  assert.equal(canUseSoftphone({ role: 'agent', isActive: true, voipAccess: false }), false);
  assert.equal(canUseSoftphone({ role: 'owner', isActive: false, voipAccess: true }), false);
});

test('hold and park accept only the authenticated users tenant-bound Twilio leg', () => {
  const identity = buildTenantVoiceIdentity('tenant-a', 'agent-a');
  assert.equal(isVoiceCallOwnedByUser('tenant-a', 'agent-a', `client:${identity}`, '+12025550100'), true);
  assert.equal(isVoiceCallOwnedByUser('tenant-a', 'agent-a', '+12025550100', `client:${identity}`), true);
  assert.equal(isVoiceCallOwnedByUser('tenant-a', 'agent-b', `client:${identity}`, '+12025550100'), false);
  assert.equal(isVoiceCallOwnedByUser('tenant-b', 'agent-a', `client:${identity}`, '+12025550100'), false);
});