import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import twilio from 'twilio';
import { once } from 'node:events';
import { verifyTwilioVoiceWebhook } from './voiceWebhookSecurity';

test('HTTP Voice webhook rejects forged signatures and unknown subaccounts', async () => {
  const accountSid = 'AC11111111111111111111111111111111';
  const authToken = 'test-auth-token';
  const params = { AccountSid: accountSid, CallSid: 'CA11111111111111111111111111111111' };
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/voice`;
  app.post('/voice', async (req, res) => {
    const tenantId = await verifyTwilioVoiceWebhook({
      signature: req.header('x-twilio-signature'),
      publicUrl: url,
      params: req.body,
      accountSid: req.body.AccountSid,
      resolveCredential: async sid => sid === accountSid ? { tenantId: 'tenant-a', authToken } : null,
    });
    res.status(tenantId ? 200 : 403).send(tenantId || 'forbidden');
  });

  try {
    const body = new URLSearchParams(params);
    const validSignature = twilio.getExpectedTwilioSignature(authToken, url, params);
    const valid = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': validSignature }, body });
    assert.equal(valid.status, 200);
    assert.equal(await valid.text(), 'tenant-a');

    const forged = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'forged' }, body: new URLSearchParams(params) });
    assert.equal(forged.status, 403);

    const unknownParams = { ...params, AccountSid: 'AC22222222222222222222222222222222' };
    const unknownSignature = twilio.getExpectedTwilioSignature(authToken, url, unknownParams);
    const unknown = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': unknownSignature }, body: new URLSearchParams(unknownParams) });
    assert.equal(unknown.status, 403);
  } finally {
    server.close();
  }
});