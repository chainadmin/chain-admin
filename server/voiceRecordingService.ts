import { and, eq, or } from 'drizzle-orm';
import { db } from './db';
import { voipCallLogs, voipVoicemails } from '@shared/schema';
import {
  resolveCompanyTwilioRuntimeCredentials,
  TWILIO_PROVIDER_TIMEOUT_MS,
  type CompanyTwilioRuntimeCredentials,
} from './companyTwilioService';

export type TenantRecordingOwnership = {
  tenantId: string;
  recordingSid: string;
  callSid: string;
  source: 'CALL_LOG' | 'VOICEMAIL';
};

export function isExactTenantRecording(
  record: { tenantId: string; recordingSid: string | null; callSid: string | null },
  tenantId: string,
  providerIdentifier: string,
): boolean {
  return record.tenantId === tenantId
    && (record.recordingSid === providerIdentifier || record.callSid === providerIdentifier);
}

/** Exact, tenant-fenced lookup shared by call recording and voicemail playback. */
export async function findTenantRecording(
  tenantId: string,
  providerIdentifier: string,
): Promise<TenantRecordingOwnership | null> {
  const [callLog] = await db.select({
    tenantId: voipCallLogs.tenantId,
    recordingSid: voipCallLogs.recordingSid,
    callSid: voipCallLogs.callSid,
  }).from(voipCallLogs).where(and(
    eq(voipCallLogs.tenantId, tenantId),
    or(
      eq(voipCallLogs.recordingSid, providerIdentifier),
      eq(voipCallLogs.callSid, providerIdentifier),
    ),
  )).limit(1);
  if (callLog?.recordingSid && callLog.callSid && isExactTenantRecording(callLog, tenantId, providerIdentifier)) {
    return { tenantId, recordingSid: callLog.recordingSid, callSid: callLog.callSid, source: 'CALL_LOG' };
  }

  const [voicemail] = await db.select({
    tenantId: voipVoicemails.tenantId,
    recordingSid: voipVoicemails.recordingSid,
    callSid: voipVoicemails.callSid,
  }).from(voipVoicemails).where(and(
    eq(voipVoicemails.tenantId, tenantId),
    or(
      eq(voipVoicemails.recordingSid, providerIdentifier),
      eq(voipVoicemails.callSid, providerIdentifier),
    ),
  )).limit(1);
  if (voicemail?.recordingSid && isExactTenantRecording(voicemail, tenantId, providerIdentifier)) {
    return { tenantId, recordingSid: voicemail.recordingSid, callSid: voicemail.callSid, source: 'VOICEMAIL' };
  }
  return null;
}

export const RECORDING_MEDIA_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'application/octet-stream',
]);
const MAX_RECORDING_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_RECORDING_REDIRECTS = 3;

/**
 * Recording URLs are deliberately not a general-purpose proxy. Twilio sometimes
 * redirects the API recording URL to its media CDN, but no other origin is
 * allowed to receive a request made on behalf of a tenant.
 */
export function isAllowedTwilioRecordingUrl(url: URL, accountSid: string): boolean {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (host === 'api.twilio.com') {
    const expectedPrefix = `/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Recordings/`;
    return url.pathname.startsWith(expectedPrefix);
  }
  // Twilio serves recording objects from this CDN after an authenticated API
  // request. It does not need (and must not receive) tenant API credentials.
  return host === 'media.twiliocdn.com' || host.endsWith('.media.twiliocdn.com');
}

function isTenantCredentialDestination(url: URL, accountSid: string): boolean {
  return url.hostname.toLowerCase() === 'api.twilio.com'
    && url.pathname.startsWith(`/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/`);
}

export class RecordingMediaError extends Error {
  constructor(message: string, readonly httpStatus: number) {
    super(message);
  }
}

export function buildTwilioRecordingMediaUrl(accountSid: string, recordingSid: string): URL {
  if (!/^RE[A-Za-z0-9_-]+$/.test(recordingSid)) throw new RecordingMediaError('Recording not found', 404);
  const url = new URL('https://api.twilio.com/');
  url.pathname = `/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Recordings/${encodeURIComponent(recordingSid)}.mp3`;
  return url;
}

export async function fetchTenantRecordingMedia(
  tenantId: string,
  recordingSid: string,
  dependencies: {
    resolveCredentials?: (tenantId: string) => Promise<CompanyTwilioRuntimeCredentials>;
    fetch?: typeof fetch;
  } = {},
): Promise<Response> {
  const resolveCredentials = dependencies.resolveCredentials || resolveCompanyTwilioRuntimeCredentials;
  const fetchMedia = dependencies.fetch || fetch;
  const credentials = await resolveCredentials(tenantId);
  const authorization = `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64')}`;
  const overallController = new AbortController();
  const overallTimeout = setTimeout(() => overallController.abort(), TWILIO_PROVIDER_TIMEOUT_MS);
  let url = buildTwilioRecordingMediaUrl(credentials.accountSid, recordingSid);
  const visited = new Set<string>();
  let response: Response;
  try {
    for (let hop = 0; ; hop += 1) {
      if (hop > MAX_RECORDING_REDIRECTS || !isAllowedTwilioRecordingUrl(url, credentials.accountSid) || visited.has(url.href)) {
        throw new RecordingMediaError('Recording media redirect was rejected', 502);
      }
      visited.add(url.href);
      const headers: Record<string, string> = { Accept: 'audio/mpeg' };
      // Never leak the tenant's Basic credential to the CDN or an unexpected
      // cross-origin destination. Only the canonical Twilio API path can use it.
      if (isTenantCredentialDestination(url, credentials.accountSid)) headers.Authorization = authorization;
      response = await fetchMedia(url, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.any([overallController.signal, AbortSignal.timeout(TWILIO_PROVIDER_TIMEOUT_MS)]),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new RecordingMediaError('Recording media redirect was rejected', 502);
      try {
        url = new URL(location, url);
      } catch {
        throw new RecordingMediaError('Recording media redirect was rejected', 502);
      }
    }
  } catch (error) {
    if (error instanceof RecordingMediaError) throw error;
    throw new RecordingMediaError('Recording media is unavailable', 502);
  } finally {
    clearTimeout(overallTimeout);
  }
  if (response.status === 404) throw new RecordingMediaError('Recording not found', 404);
  if (!response.ok || !response.body) throw new RecordingMediaError('Recording media is unavailable', 502);
  const contentLength = Number(response.headers.get('content-length'));
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_RECORDING_MEDIA_BYTES) {
    await response.body.cancel();
    throw new RecordingMediaError('Recording media is too large', 502);
  }
  const contentType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (!RECORDING_MEDIA_MIME_TYPES.has(contentType)) {
    await response.body.cancel();
    throw new RecordingMediaError('Recording media returned an unsupported format', 502);
  }
  return response;
}