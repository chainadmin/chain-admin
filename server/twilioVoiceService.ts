import twilio from 'twilio';
import { createHash } from 'node:crypto';
import AccessToken from 'twilio/lib/jwt/AccessToken.js';
import {
  getCompanyTwilioClient,
  resolveCompanyTwilioAccount,
  resolveCompanyTwilioVoiceConfiguration,
  voiceWebhookBaseUrl,
  type CompanyTwilioVoiceConfiguration,
} from './companyTwilioService';
import { extractAreaCode } from './phoneNumberUtils';
export { extractAreaCode } from './phoneNumberUtils';
const { VoiceGrant } = AccessToken;

export type CompanyTwilioClientFactory = (tenantId: string) => Promise<twilio.Twilio>;

export function buildTenantVoiceIdentity(tenantId: string, userIdentity: string): string {
  if (!tenantId || !userIdentity) throw new Error('Tenant and user identity are required');
  const canonicalIdentity = `${tenantId.length}:${tenantId}${userIdentity.length}:${userIdentity}`;
  return `tenant-user-${createHash('sha256').update(canonicalIdentity).digest('hex')}`;
}

export async function generateVoiceToken(
  userIdentity: string,
  tenantId: string,
  configurationResolver: (tenantId: string) => Promise<CompanyTwilioVoiceConfiguration>
    = resolveCompanyTwilioVoiceConfiguration,
): Promise<string> {
  const configuration = await configurationResolver(tenantId);
  const token = new AccessToken(
    configuration.subaccountSid,
    configuration.apiKeySid,
    configuration.apiKeySecret,
    {
    identity: buildTenantVoiceIdentity(tenantId, userIdentity),
    ttl: 3600,
    },
  );

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: configuration.twimlAppSid,
    incomingAllow: true,
  });

  token.addGrant(voiceGrant);

  return token.toJwt();
}

export function formatPhoneE164(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return `+${cleaned}`;
  }
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  return phone;
}


export async function initiateOutboundCall(
  tenantId: string,
  toNumber: string,
  fromNumber: string,
  callbackUrl: string,
  clientFactory: CompanyTwilioClientFactory = getCompanyTwilioClient,
): Promise<{ callSid: string; status: string } | null> {
  try {
    const client = await clientFactory(tenantId);
    const call = await client.calls.create({
      to: formatPhoneE164(toNumber),
      from: formatPhoneE164(fromNumber),
      url: callbackUrl,
      record: true,
      recordingStatusCallback: `${callbackUrl.replace('/voice/outbound', '/voice/recording-status')}`,
      statusCallback: `${callbackUrl.replace('/voice/outbound', '/voice/call-status')}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    return {
      callSid: call.sid,
      status: call.status,
    };
  } catch (error: any) {
    console.error('Failed to initiate outbound call:', error.message);
    return null;
  }
}

export async function getRecordingUrl(
  tenantId: string,
  recordingSid: string,
  clientFactory: CompanyTwilioClientFactory = getCompanyTwilioClient,
): Promise<string | null> {
  try {
    const client = await clientFactory(tenantId);
    const recording = await client.recordings(recordingSid).fetch();
    return `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
  } catch (error: any) {
    console.error('Failed to get recording URL:', error.message);
    return null;
  }
}

export async function hangupCall(
  tenantId: string,
  callSid: string,
  clientFactory: CompanyTwilioClientFactory = getCompanyTwilioClient,
): Promise<boolean> {
  try {
    const client = await clientFactory(tenantId);
    await client.calls(callSid).update({ status: 'completed' });
    return true;
  } catch (error: any) {
    console.error('Failed to hangup call:', error.message);
    return false;
  }
}

export function generateTwiML(options: {
  action: 'dial' | 'say' | 'connect-client';
  to?: string;
  from?: string;
  message?: string;
  clientIdentity?: string;
  record?: boolean;
}): string {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  switch (options.action) {
    case 'dial':
      if (options.to) {
        const dial = response.dial({
          callerId: options.from,
          record: options.record ? 'record-from-answer-dual' : undefined,
          recordingStatusCallback: '/api/voice/recording-status',
        });
        dial.number(options.to);
      }
      break;
    case 'say':
      response.say(options.message || 'Hello');
      break;
    case 'connect-client':
      if (options.clientIdentity) {
        const dial = response.dial({
          callerId: options.from,
          record: options.record ? 'record-from-answer-dual' : undefined,
          recordingStatusCallback: '/api/voice/recording-status',
        });
        dial.client(options.clientIdentity);
      }
      break;
  }

  return response.toString();
}

export interface AvailablePhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  isoCountry: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

export async function searchAvailableLocalNumbers(
  areaCode: string,
  limit: number = 10,
  tenantId?: string,
): Promise<AvailablePhoneNumber[]> {
  try {
    if (!tenantId) throw new Error('Organization is required to search DIDs');
    const client = await getCompanyTwilioClient(tenantId, true);
    const numbers = await client.availablePhoneNumbers('US')
      .local
      .list({
        areaCode: parseInt(areaCode),
        voiceEnabled: true,
        limit,
      });

    return numbers.map(n => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality || '',
      region: n.region || '',
      isoCountry: n.isoCountry || 'US',
      capabilities: {
        voice: n.capabilities?.voice || false,
        sms: n.capabilities?.sms || false,
        mms: n.capabilities?.mms || false,
      },
    }));
  } catch (error: any) {
    console.error('Failed to search local numbers:', error.message);
    return [];
  }
}

export async function searchAvailableTollFreeNumbers(
  limit: number = 10,
  tenantId?: string,
): Promise<AvailablePhoneNumber[]> {
  try {
    if (!tenantId) throw new Error('Organization is required to search DIDs');
    const client = await getCompanyTwilioClient(tenantId, true);
    const numbers = await client.availablePhoneNumbers('US')
      .tollFree
      .list({
        voiceEnabled: true,
        limit,
      });

    return numbers.map(n => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality || '',
      region: n.region || '',
      isoCountry: n.isoCountry || 'US',
      capabilities: {
        voice: n.capabilities?.voice || false,
        sms: n.capabilities?.sms || false,
        mms: n.capabilities?.mms || false,
      },
    }));
  } catch (error: any) {
    console.error('Failed to search toll-free numbers:', error.message);
    return [];
  }
}

export async function provisionPhoneNumber(
  phoneNumber: string,
  friendlyName?: string,
  tenantId?: string,
): Promise<{ sid: string; phoneNumber: string; subaccountSid: string } | null> {
  try {
    if (!tenantId) throw new Error('Organization is required for DID provisioning');
    const account = await resolveCompanyTwilioAccount(tenantId, { createIfMissing: true });
    const client = await getCompanyTwilioClient(tenantId);
    const callbackBase = voiceWebhookBaseUrl();
    const voiceUrl = `${callbackBase}/api/voice/inbound`;
    const statusCallback = `${callbackBase}/api/voice/call-status`;

    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber,
      friendlyName: friendlyName || `Chain VoIP - ${phoneNumber}`,
      voiceUrl,
      voiceMethod: 'POST',
      statusCallback,
      statusCallbackMethod: 'POST',
    });

    return {
      sid: purchasedNumber.sid,
      phoneNumber: purchasedNumber.phoneNumber,
      subaccountSid: account.subaccountSid,
    };
  } catch (error: any) {
    console.error('Failed to provision phone number:', error.message);
    return null;
  }
}

export async function releasePhoneNumber(phoneSid: string, tenantId?: string): Promise<boolean> {
  try {
    if (!tenantId) throw new Error('Organization is required for DID release');
    const client = await getCompanyTwilioClient(tenantId);
    await client.incomingPhoneNumbers(phoneSid).remove();
    return true;
  } catch (error: any) {
    console.error('Failed to release phone number:', error.message);
    return false;
  }
}

export function isTollFreeNumber(phoneNumber: string): boolean {
  const areaCode = extractAreaCode(phoneNumber);
  return ['800', '888', '877', '866', '855', '844', '833'].includes(areaCode);
}

export interface OwnedPhoneNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  numberType: 'local' | 'toll_free';
  areaCode: string;
}

export async function listOwnedPhoneNumbers(tenantId?: string): Promise<OwnedPhoneNumber[]> {
  try {
    if (!tenantId) throw new Error('Organization is required to list DIDs');
    const client = await getCompanyTwilioClient(tenantId);
    const numbers = await client.incomingPhoneNumbers.list({ limit: 100 });
    
    return numbers.map((num) => ({
      sid: num.sid,
      phoneNumber: num.phoneNumber,
      friendlyName: num.friendlyName || '',
      numberType: isTollFreeNumber(num.phoneNumber) ? 'toll_free' as const : 'local' as const,
      areaCode: extractAreaCode(num.phoneNumber),
    }));
  } catch (error: any) {
    console.error('Failed to list owned phone numbers:', error.message);
    return [];
  }
}
