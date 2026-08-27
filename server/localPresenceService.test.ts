import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProvisionable, calculateCoverage, costReview, coverageMeetsMinimum, downgradeRequiresReleaseReview, selectDialingNumber, type DialingNumber } from './localPresenceService';
import { parseDialString } from './phoneNumberUtils';

const nationalPlus = [
  { state: 'NY', areaCode: '716', targetDids: 2, minimumDids: 1 },
  { state: 'NY', areaCode: '585', targetDids: 2, minimumDids: 2 },
];

test('coverage calculation reuses existing DIDs and calculates only upgrade gaps', () => {
  assert.deepEqual(calculateCoverage(nationalPlus, [{ areaCode: '716' }]), [
    { state: 'NY', areaCode: '716', required: 2, minimum: 1, existing: 1, need: 1 },
    { state: 'NY', areaCode: '585', required: 2, minimum: 2, existing: 0, need: 2 },
  ]);
});

test('provisioning cannot run before explicit approval', () => {
  assert.throws(() => assertProvisionable('COST_REVIEW', null), /explicit Global Admin approval/);
  assert.doesNotThrow(() => assertProvisionable('APPROVED', new Date()));
});

test('cost review reports provider cost and margin', () => {
  assert.deepEqual(costReview(3, 115, 5000), { didsToPurchase: 3, estimatedProviderCostCents: 345, customerPriceCents: 5000, estimatedGrossMarginCents: 4655 });
});

test('partial provisioning is not active until every minimum is met', () => {
  const coverage = calculateCoverage(nationalPlus, [{ areaCode: '716' }]);
  assert.equal(coverageMeetsMinimum(coverage, { '585': 1 }), false);
  assert.equal(coverageMeetsMinimum(coverage, { '585': 2 }), true);
});

test('downgrades require release review and never imply automatic release', () => {
  assert.equal(downgradeRequiresReleaseReview(nationalPlus, nationalPlus.slice(0, 1)), true);
});

const numbers: DialingNumber[] = [
  { id: 'primary', tenantId: 'a', phoneNumber: '+17165550100', areaCode: '716', state: 'NY', numberType: 'PRIMARY', isActive: true, isPrimary: true, status: 'ACTIVE' },
  { id: 'sf', tenantId: 'a', phoneNumber: '+14155550100', areaCode: '415', state: 'CA', numberType: 'LOCAL_PRESENCE', isActive: true, status: 'ACTIVE' },
  { id: 'la-overlay', tenantId: 'a', phoneNumber: '+14245550100', areaCode: '424', state: null, numberType: 'LOCAL_PRESENCE', isActive: true, status: 'ACTIVE' },
  { id: 'rochester', tenantId: 'a', phoneNumber: '+15855550100', areaCode: '585', state: 'NY', numberType: 'LOCAL_PRESENCE', isActive: true, status: 'ACTIVE' },
  { id: 'direct-la', tenantId: 'a', phoneNumber: '+12135550100', areaCode: '213', state: 'CA', numberType: 'PORTED', isActive: true, status: 'ACTIVE' },
  { id: 'toll-free', tenantId: 'a', phoneNumber: '+18005550100', areaCode: '800', numberType: 'TOLL_FREE', isActive: true, status: 'ACTIVE' },
  { id: 'inactive-exact', tenantId: 'a', phoneNumber: '+15105550100', areaCode: '510', state: 'CA', numberType: 'LOCAL_PRESENCE', isActive: false, status: 'ACTIVE' },
  { id: 'wrong-tenant', tenantId: 'b', phoneNumber: '+15105550999', areaCode: '510', state: 'CA', numberType: 'LOCAL_PRESENCE', isActive: true, status: 'ACTIVE' },
];

const states: Record<string, string> = {
  '213': 'CA', '310': 'CA', '415': 'CA', '424': 'CA', '510': 'CA',
  '212': 'NY', '585': 'NY', '716': 'NY',
  '305': 'FL',
};
const resolveState = (areaCode: string) => states[areaCode];

test('81 control prefix is removed and destination is normalized', () => {
  assert.deepEqual(parseDialString('81 (415) 555-1212'), {
    destination: '+14155551212',
    localPresenceRequested: true,
    controlPrefix: '81',
  });
  assert.equal(parseDialString('8114155551212').destination, '+14155551212');
});

test('ordinary E.164 and a legitimate 812 area code are not control dialing', () => {
  assert.equal(parseDialString('+18125551212').localPresenceRequested, false);
  assert.equal(parseDialString('18125551212').localPresenceRequested, false);
  assert.equal(parseDialString('8125551212').localPresenceRequested, false);
});

test('Local Presence chooses exact California area code first', () => {
  const decision = selectDialingNumber({ tenantId: 'a', dialString: '814155551212', numbers, areaCodeToState: resolveState });
  assert.equal(decision.callerId, '+14155550100');
  assert.equal(decision.selectionReason, 'LOCAL_PRESENCE_AREA_CODE');
  assert.equal(decision.destination, '+14155551212');
});

test('Local Presence uses another same-state overlay bucket', () => {
  const decision = selectDialingNumber({ tenantId: 'a', dialString: '813105551212', numbers, areaCodeToState: resolveState });
  assert.equal(decision.callerId, '+14155550100');
  assert.equal(decision.destinationState, 'CA');
  assert.equal(decision.selectionReason, 'LOCAL_PRESENCE_STATE');
});

test('state matching works outside California and falls back for an uncovered state', () => {
  const ny = selectDialingNumber({ tenantId: 'a', dialString: '812125551212', numbers, areaCodeToState: resolveState });
  assert.equal(ny.callerId, '+15855550100');
  assert.equal(ny.selectionReason, 'LOCAL_PRESENCE_STATE');

  const fl = selectDialingNumber({ tenantId: 'a', dialString: '813055551212', numbers, areaCodeToState: resolveState });
  assert.equal(fl.callerId, 'anonymous');
  assert.equal(fl.selectionReason, 'PRIVATE_FALLBACK');
});

test('inactive, direct-use, and foreign-tenant numbers cannot satisfy bucket matches', () => {
  const decision = selectDialingNumber({ tenantId: 'a', dialString: '815105551212', numbers });
  assert.equal(decision.callerId, 'anonymous');
  assert.equal(decision.selectionReason, 'PRIVATE_FALLBACK');
});

test('ordinary dialing honors an active selected direct or toll-free number', () => {
  const direct = selectDialingNumber({ tenantId: 'a', dialString: '+12125551212', numbers, selectedNumberId: 'direct-la' });
  assert.equal(direct.callerId, '+12135550100');
  assert.equal(direct.selectionReason, 'CALLER_SELECTED');

  const tollFree = selectDialingNumber({ tenantId: 'a', dialString: '2125551212', numbers, selectedNumberId: 'toll-free' });
  assert.equal(tollFree.callerId, '+18005550100');
});

test('ordinary dialing rejects unavailable, bucket, and non-owned selections and uses primary', () => {
  for (const selectedNumberId of ['inactive-exact', 'sf', 'wrong-tenant', 'missing']) {
    const decision = selectDialingNumber({ tenantId: 'a', dialString: '2125551212', numbers, selectedNumberId });
    assert.equal(decision.callerId, '+17165550100');
    assert.equal(decision.selectionReason, 'PRIMARY_FALLBACK');
  }
});
