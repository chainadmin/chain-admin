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
  const response = await fetchMedia(buildTwilioRecordingMediaUrl(credentials.accountSid, recordingSid), {
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64')}`,
      Accept: 'audio/mpeg',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(TWILIO_PROVIDER_TIMEOUT_MS),
  });
  if (response.status === 404) throw new RecordingMediaError('Recording not found', 404);
  if (!response.ok || !response.body) throw new RecordingMediaError('Recording media is unavailable', 502);
  const contentType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (!RECORDING_MEDIA_MIME_TYPES.has(contentType)) {
    await response.body.cancel();
    throw new RecordingMediaError('Recording media returned an unsupported format', 502);
  }
  return response;
}