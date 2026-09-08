import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  createOutboundCallPreparationHandler,
  isUnsupportedPrivateSelection,
  type OutboundCallPreparationDependencies,
} from './outboundCallPreparation';
import type { DialingNumber } from './localPresenceService';

const primary: DialingNumber = {
  id: 'primary',
  tenantId: 'company-a',
  phoneNumber: '+17165550100',
  areaCode: '716',
  numberType: 'PRIMARY',
  isActive: true,
  isPrimary: true,
  status: 'ACTIVE',
};

function makeBoundary(numbers: DialingNumber[] = [primary]) {
  const calls: { inventory: number; callLogs: number; tokens: number; signed?: any } =
    { inventory: 0, callLogs: 0, tokens: 0 };
  const dependencies: OutboundCallPreparationDependencies = {
    getCurrentUser: async () => ({
      id: 'user-a',
      tenantId: 'company-a',
      role: 'agent',
      voipAccess: true,
      credentialId: 'credential-a',
    }),
    getNumbers: async () => {
      calls.inventory++;
      return numbers;
    },
    getPrivacyLine: async () => numbers.find(number => number.id === 'privacy'),
    consumerBelongsToTenant: async () => true,
    accountBelongsToTenant: async () => true,
    getAreaCodeToState: async () => areaCode => areaCode === '716' ? 'NY' : areaCode === '305' ? 'FL' : undefined,
    createCallLog: async () => {
      calls.callLogs++;
      return { id: 'log-a' };
    },
    signSelectionToken: async payload => {
      calls.tokens++;
      calls.signed = payload;
      return 'signed-selection';
    },
  };
  const handler = createOutboundCallPreparationHandler(dependencies);

  const request = async (body: Record<string, unknown>) => {
    let status = 200;
    let payload: any;
    const req = { body } as Request;
    const res = {
      status(value: number) {
        status = value;
        return this;
      },
      json(value: unknown) {
        payload = value;
        return this;
      },
    } as unknown as Response;
    await handler(req, res, () => undefined);
    return { status, payload };
  };

  return { calls, request };
}

test('outbound HTTP preparation succeeds with an active owned company number', async () => {
  const boundary = makeBoundary();
  const response = await boundary.request({ toNumber: '(212) 555-1212', selectedNumberId: 'primary' });

  assert.equal(response.status, 200);
  assert.equal(response.payload.fromNumber, primary.phoneNumber);
  assert.equal(response.payload.toNumber, '+12125551212');
  assert.equal(response.payload.selectionToken, 'signed-selection');
  assert.equal(response.payload.isPrivate, false);
  assert.equal(boundary.calls.inventory, 1);
  assert.equal(boundary.calls.callLogs, 1);
  assert.equal(boundary.calls.tokens, 1);
});

test('explicit private mode uses exactly the dedicated active owned DID', async () => {
  const privacy = { ...primary, id: 'privacy', phoneNumber: '+17165550199', isPrimary: false };
  const boundary = makeBoundary([primary, privacy]);
  const response = await boundary.request({
    toNumber: '2125551212',
    callerIdMode: 'private',
    selectedNumberId: primary.id,
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.fromNumber, privacy.phoneNumber);
  assert.equal(response.payload.isPrivate, true);
  assert.equal(boundary.calls.signed.callerIdMode, 'PRIVACY');
  assert.equal(boundary.calls.signed.callerIdNumberId, privacy.id);
  assert.equal(boundary.calls.signed.callerId, privacy.phoneNumber);
  assert.notEqual(boundary.calls.signed.callerId, primary.phoneNumber);
});

test('missing dedicated Privacy DID fails without log or token and never falls back', async () => {
  const boundary = makeBoundary();
  const response = await boundary.request({ toNumber: '2125551212', callerIdMode: 'PRIVATE' });
  assert.equal(response.status, 409);
  assert.equal(response.payload.code, 'PRIVACY_LINE_UNAVAILABLE');
  assert.equal(boundary.calls.inventory, 1);
  assert.equal(boundary.calls.callLogs, 0);
  assert.equal(boundary.calls.tokens, 0);
});

test('uncovered Local Presence never reveals the primary fallback', async () => {
  const boundary = makeBoundary();
  const response = await boundary.request({ toNumber: '813055551212' });

  assert.equal(response.status, 422);
  assert.equal(response.payload.code, 'PRIVATE_CALLER_ID_UNAVAILABLE');
  assert.equal(response.payload.fromNumber, undefined);
  assert.equal(boundary.calls.inventory, 1);
  assert.equal(boundary.calls.callLogs, 0);
  assert.equal(boundary.calls.tokens, 0);
});

test('missing normal company inventory is a clear conflict', async () => {
  const boundary = makeBoundary([]);
  const response = await boundary.request({ toNumber: '2125551212' });

  assert.equal(response.status, 409);
  assert.equal(response.payload.code, 'NO_ACTIVE_CALLER_ID');
  assert.doesNotMatch(response.payload.message, /company-a/);
  assert.equal(boundary.calls.inventory, 1);
  assert.equal(boundary.calls.callLogs, 0);
  assert.equal(boundary.calls.tokens, 0);
});

test('an unavailable selected number preserves primary fallback semantics', async () => {
  const boundary = makeBoundary();
  const response = await boundary.request({ toNumber: '2125551212', selectedNumberId: 'not-owned' });

  assert.equal(response.status, 200);
  assert.equal(response.payload.selectionReason, 'PRIMARY_FALLBACK');
  assert.equal(response.payload.fromNumber, primary.phoneNumber);
});

test('a malformed dial string is rejected before inventory or side effects', async () => {
  const boundary = makeBoundary();
  const response = await boundary.request({ toNumber: '555' });

  assert.equal(response.status, 400);
  assert.equal(response.payload.code, 'INVALID_DIAL_STRING');
  assert.equal(boundary.calls.inventory, 0);
  assert.equal(boundary.calls.callLogs, 0);
  assert.equal(boundary.calls.tokens, 0);
});

test('stale signed private selections are identified regardless of legacy shape', () => {
  assert.equal(isUnsupportedPrivateSelection({ callerIdMode: 'PRIVATE', callerId: '+17165550100' }), true);
  assert.equal(isUnsupportedPrivateSelection({ callerIdMode: 'NUMBER', callerId: 'anonymous' }), true);
  assert.equal(isUnsupportedPrivateSelection({ callerIdMode: 'NUMBER', callerId: '+17165550100' }), false);
  assert.equal(isUnsupportedPrivateSelection({ callerIdMode: 'PRIVACY', callerId: '+17165550100' }), false);
});