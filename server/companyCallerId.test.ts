import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLocalDidCallerId, type CallerIdCandidate } from './companyCallerId';

const numbers: CallerIdCandidate[] = [
  { tenantId: 'tenant', phoneNumber: '+12145550100', areaCode: '214', state: 'TX', numberType: 'LOCAL_PRESENCE', isActive: true },
  { tenantId: 'tenant', phoneNumber: '+17165550100', areaCode: '716', state: 'NY', numberType: 'LOCAL_PRESENCE', isActive: true },
];
const geography = [{ areaCode: '713', state: 'TX' }, { areaCode: '214', state: 'TX' }, { areaCode: '305', state: 'FL' }];

test('Local DID selection prefers an exact destination area code', () => {
  assert.equal(selectLocalDidCallerId('+12145551212', numbers, geography)?.areaCode, '214');
});

test('Local DID selection falls back to another area code in the destination state', () => {
  assert.equal(selectLocalDidCallerId('+17135551212', numbers, geography)?.areaCode, '214');
});

test('Local DID selection returns no caller ID when its state bucket has no number', () => {
  assert.equal(selectLocalDidCallerId('+13055551212', numbers, geography), undefined);
});
