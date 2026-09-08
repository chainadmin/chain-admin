import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test';

test('recording ownership requires exact tenant and recording or call SID', async () => {
  const { isExactTenantRecording } = await import('./voiceRecordingService');
  const record = { tenantId: 'tenant-a', recordingSid: 'RE-one', callSid: 'CA-one' };
  assert.equal(isExactTenantRecording(record, 'tenant-a', 'RE-one'), true);
  assert.equal(isExactTenantRecording(record, 'tenant-a', 'CA-one'), true);
  assert.equal(isExactTenantRecording(record, 'tenant-b', 'RE-one'), false);
  assert.equal(isExactTenantRecording(record, 'tenant-a', 'RE'), false);
});

test('recording media request uses tenant basic auth and canonical provider URL', async () => {
  const { fetchTenantRecordingMedia } = await import('./voiceRecordingService');
  const { TWILIO_PROVIDER_TIMEOUT_MS } = await import('./companyTwilioService');
  let requestedUrl = '';
  let authorization = '';
  const media = await fetchTenantRecordingMedia('tenant-a', 'RE-recording', {
    resolveCredentials: async () => ({ accountSid: 'AC-tenant', authToken: 'tenant-secret' }),
    fetch: async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get('authorization') || '';
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg', 'content-length': '3' },
      });
    },
  });
  assert.equal(TWILIO_PROVIDER_TIMEOUT_MS, 20_000);
  assert.equal(requestedUrl, 'https://api.twilio.com/2010-04-01/Accounts/AC-tenant/Recordings/RE-recording.mp3');
  assert.equal(authorization, `Basic ${Buffer.from('AC-tenant:tenant-secret').toString('base64')}`);
  assert.equal(media.headers.get('content-type'), 'audio/mpeg');
});

test('recording media maps provider absence and rejects non-audio bodies safely', async () => {
  const { fetchTenantRecordingMedia, RecordingMediaError } = await import('./voiceRecordingService');
  const credentials = async () => ({ accountSid: 'AC-tenant', authToken: 'tenant-secret' });
  await assert.rejects(
    fetchTenantRecordingMedia('tenant-a', 'RE-missing', {
      resolveCredentials: credentials,
      fetch: async () => new Response(null, { status: 404 }),
    }),
    (error: unknown) => error instanceof RecordingMediaError && error.httpStatus === 404,
  );
  await assert.rejects(
    fetchTenantRecordingMedia('tenant-a', 'RE-html', {
      resolveCredentials: credentials,
      fetch: async () => new Response('<html/>', { status: 200, headers: { 'content-type': 'text/html' } }),
    }),
    (error: unknown) => error instanceof RecordingMediaError && error.httpStatus === 502,
  );
});

test('recording media follows a validated Twilio CDN redirect without forwarding tenant auth', async () => {
  const { fetchTenantRecordingMedia } = await import('./voiceRecordingService');
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const media = await fetchTenantRecordingMedia('tenant-a', 'RE-recording', {
    resolveCredentials: async () => ({ accountSid: 'AC-tenant', authToken: 'tenant-secret' }),
    fetch: async (input, init) => {
      requests.push({ url: String(input), authorization: new Headers(init?.headers).get('authorization') });
      if (requests.length === 1) {
        return new Response(null, { status: 302, headers: { location: 'https://media.twiliocdn.com/recordings/object.mp3' } });
      }
      return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'audio/mpeg', 'content-length': '1' } });
    },
  });
  assert.equal(await media.arrayBuffer().then(body => body.byteLength), 1);
  assert.equal(requests.length, 2);
  assert.match(requests[0].authorization || '', /^Basic /);
  assert.equal(requests[1].authorization, null);
});

test('recording media follows multiple validated redirects and rejects invalid or looping targets', async () => {
  const { fetchTenantRecordingMedia, RecordingMediaError } = await import('./voiceRecordingService');
  const credentials = async () => ({ accountSid: 'AC-tenant', authToken: 'tenant-secret' });
  let calls = 0;
  await fetchTenantRecordingMedia('tenant-a', 'RE-recording', {
    resolveCredentials: credentials,
    fetch: async () => {
      calls += 1;
      if (calls === 1) return new Response(null, { status: 302, headers: { location: '/2010-04-01/Accounts/AC-tenant/Recordings/RE-recording.mp3?redirect=1' } });
      if (calls === 2) return new Response(null, { status: 302, headers: { location: 'https://media.twiliocdn.com/recordings/object.mp3' } });
      return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'audio/mpeg', 'content-length': '1' } });
    },
  });
  for (const location of [
    'http://media.twiliocdn.com/recordings/object.mp3',
    'https://example.invalid/recordings/object.mp3',
    '/2010-04-01/Accounts/AC-tenant/Recordings/RE-recording.mp3',
  ]) {
    await assert.rejects(fetchTenantRecordingMedia('tenant-a', 'RE-recording', {
      resolveCredentials: credentials,
      fetch: async () => new Response(null, { status: 302, headers: { location } }),
    }), (error: unknown) => error instanceof RecordingMediaError && error.httpStatus === 502);
  }
});