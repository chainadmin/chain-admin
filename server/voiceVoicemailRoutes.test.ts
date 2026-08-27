import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { registerVoiceVoicemailRoutes } from './voiceVoicemailRoutes';

test('voicemail HTTP routes enforce admin access and tenant isolation', async () => {
  const items = [
    { id: 'vm-a', tenantId: 'tenant-a', recordingSid: 'RE-a', isRead: false },
    { id: 'vm-b', tenantId: 'tenant-b', recordingSid: 'RE-b', isRead: false },
  ];
  const app = express();
  app.use(express.json());
  const requireOwner: express.RequestHandler = (req, res, next) =>
    req.header('x-role') === 'owner' ? next() : res.status(403).send('forbidden');
  registerVoiceVoicemailRoutes(app, {
    requireOwner,
    getCurrentUser: async req => ({ id: 'user', tenantId: String(req.header('x-tenant')) }),
    list: async tenantId => items.filter(item => item.tenantId === tenantId),
    find: async (id, tenantId) => items.find(item => item.id === id && item.tenantId === tenantId) || null,
    markRead: async (id, tenantId, isRead) => {
      const item = items.find(candidate => candidate.id === id && candidate.tenantId === tenantId);
      if (!item) return null;
      item.isRead = isRead;
      return item;
    },
    remove: async (id, tenantId) => {
      const index = items.findIndex(item => item.id === id && item.tenantId === tenantId);
      if (index < 0) return false;
      items.splice(index, 1);
      return true;
    },
    createListenUrl: (tenantId, voicemailId) => `/audio/${tenantId}/${voicemailId}`,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const ownerA = { 'x-role': 'owner', 'x-tenant': 'tenant-a' };
  try {
    const list = await fetch(`${base}/api/voip/voicemail`, { headers: ownerA });
    assert.deepEqual((await list.json()).map((item: any) => item.id), ['vm-a']);
    assert.equal((await fetch(`${base}/api/voip/voicemail/vm-b/listen`, { headers: ownerA })).status, 404);
    assert.equal((await fetch(`${base}/api/voip/voicemail/vm-b/read`, { method: 'PATCH', headers: { ...ownerA, 'content-type': 'application/json' }, body: '{}' })).status, 404);
    assert.equal((await fetch(`${base}/api/voip/voicemail/vm-b`, { method: 'DELETE', headers: ownerA })).status, 404);
    assert.equal(items.some(item => item.id === 'vm-b'), true);
    assert.equal((await fetch(`${base}/api/voip/voicemail`, { headers: { 'x-role': 'agent', 'x-tenant': 'tenant-a' } })).status, 403);
    const ownListen = await fetch(`${base}/api/voip/voicemail/vm-a/listen`, { headers: ownerA });
    assert.equal(ownListen.status, 200);
    assert.deepEqual(await ownListen.json(), { url: '/audio/tenant-a/vm-a' });
  } finally {
    server.close();
  }
});