import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProvisionable, calculateCoverage, costReview, coverageMeetsMinimum, downgradeRequiresReleaseReview } from './localPresenceService';

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
