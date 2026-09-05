import assert from 'node:assert/strict';
import test from 'node:test';
import { canAgencyProductAccessPath, classifyAgencyApiPath } from '../shared/productRouteAccess';

test('classifies Chain, Chiamo, and shared agency API surfaces', () => {
  assert.equal(classifyAgencyApiPath('/accounts'), 'chain');
  assert.equal(classifyAgencyApiPath('/payments/123'), 'chain');
  assert.equal(classifyAgencyApiPath('/api/payments/123?limit=10'), 'chain');
  assert.equal(classifyAgencyApiPath('/campaign-logs'), 'chain');
  assert.equal(classifyAgencyApiPath('/chiamo/account'), 'chiamo');
  assert.equal(classifyAgencyApiPath('/api/chiamo/account'), 'chiamo');
  assert.equal(classifyAgencyApiPath('/chiamo/messages/123/respond'), 'chiamo');
  assert.equal(classifyAgencyApiPath('/auth/user'), 'shared');
  assert.equal(classifyAgencyApiPath('/settings'), 'shared');
  assert.equal(classifyAgencyApiPath('/team-members/123'), 'shared');
  assert.equal(classifyAgencyApiPath('/voip/numbers'), 'shared');
  assert.equal(classifyAgencyApiPath('/voice/token'), 'shared');
  assert.equal(classifyAgencyApiPath('/tenants/by-slug/example'), 'shared');
  assert.equal(classifyAgencyApiPath('/tenants/00000000-0000-4000-8000-000000000000'), 'chain');
});

test('prevents either product token from crossing into the other product API', () => {
  assert.equal(canAgencyProductAccessPath('chiamo', '/accounts'), false);
  assert.equal(canAgencyProductAccessPath('chiamo', '/consumers'), false);
  assert.equal(canAgencyProductAccessPath('chain', '/chiamo/account'), false);
  assert.equal(canAgencyProductAccessPath('chain', '/chiamo/messages'), false);
  assert.equal(canAgencyProductAccessPath('chain', '/auth/user'), true);
  assert.equal(canAgencyProductAccessPath('chiamo', '/settings'), true);
  assert.equal(canAgencyProductAccessPath('chiamo', '/tenants/00000000-0000-4000-8000-000000000000'), false);
});