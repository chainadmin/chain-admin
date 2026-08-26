import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCompanyCallerId, type CallerIdCandidate } from './companyCallerId';

const inventory: CallerIdCandidate[] = [
  { tenantId: 'company-a', phoneNumber: '+17165550100', areaCode: '716', numberType: 'PRIMARY', isActive: true },
  { tenantId: 'company-a', phoneNumber: '+12125550100', areaCode: '212', numberType: 'LOCAL_PRESENCE', isActive: true },
  { tenantId: 'company-a', phoneNumber: '+13055550100', areaCode: '305', numberType: 'LOCAL_PRESENCE', isActive: false },
  { tenantId: 'company-b', phoneNumber: '+12125550999', areaCode: '212', numberType: 'LOCAL_PRESENCE', isActive: true },
];

test('uses an exact active Local Presence DID owned by the company', () => {
  assert.equal(selectCompanyCallerId('company-a', '212-555-0199', inventory)?.phoneNumber, '+12125550100');
});

test('falls back to the company Primary DID and never crosses tenants', () => {
  assert.equal(selectCompanyCallerId('company-a', '404-555-0199', inventory)?.phoneNumber, '+17165550100');
  assert.equal(selectCompanyCallerId('company-b', '716-555-0199', inventory), undefined);
});

test('does not select an inactive Local Presence DID', () => {
  assert.equal(selectCompanyCallerId('company-a', '305-555-0199', inventory)?.phoneNumber, '+17165550100');
});
