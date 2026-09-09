import assert from 'node:assert/strict';
import test from 'node:test';
import { PostmarkServerService } from './postmarkServerService';

test('ensureBroadcastStream leaves an existing broadcast stream intact', async () => {
  const originalFetch = global.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response('{}', { status: 200 });
  };

  try {
    const result = await new PostmarkServerService().ensureBroadcastStream('tenant-token');
    assert.deepEqual(result, { success: true });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].init?.headers && (requests[0].init.headers as Record<string, string>)['X-Postmark-Server-Token'], 'tenant-token');
  } finally {
    global.fetch = originalFetch;
  }
});

test('ensureBroadcastStream creates a missing stream as Broadcast', async () => {
  const originalFetch = global.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return requests.length === 1
      ? new Response('{}', { status: 404 })
      : new Response('{}', { status: 200 });
  };

  try {
    const result = await new PostmarkServerService().ensureBroadcastStream('tenant-token', 'client-campaigns');
    assert.deepEqual(result, { success: true });
    assert.equal(requests[1].url, 'https://api.postmarkapp.com/message-streams');
    assert.equal(requests[1].init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
      ID: 'client-campaigns',
      Name: 'Broadcast',
      MessageStreamType: 'Broadcast',
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('ensureBroadcastStream provisions a stream when Postmark reports missing as HTTP 422', async () => {
  const originalFetch = global.fetch;
  const requests: string[] = [];
  global.fetch = async (input) => {
    requests.push(String(input));
    return requests.length === 1
      ? new Response(JSON.stringify({ ErrorCode: 1226, Message: 'The message stream could not be found.' }), { status: 422 })
      : new Response('{}', { status: 200 });
  };

  try {
    const result = await new PostmarkServerService().ensureBroadcastStream('tenant-token');
    assert.deepEqual(result, { success: true });
    assert.deepEqual(requests, [
      'https://api.postmarkapp.com/message-streams/broadcast',
      'https://api.postmarkapp.com/message-streams',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('ensureBroadcastStream reports a provider configuration failure', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('{}', { status: 403 });

  try {
    const result = await new PostmarkServerService().ensureBroadcastStream('bad-token');
    assert.equal(result.success, false);
    assert.match(result.error || '', /HTTP 403/);
  } finally {
    global.fetch = originalFetch;
  }
});
