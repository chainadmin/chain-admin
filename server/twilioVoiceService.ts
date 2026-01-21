import twilio from 'twilio';
import AccessToken from 'twilio/lib/jwt/AccessToken.js';
const { VoiceGrant } = AccessToken;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const apiKeySid = process.env.TWILIO_API_KEY_SID;
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;

let twilioClient: twilio.Twilio | null = null;

if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
  console.log('Twilio Voice service initialized');
} else {
  console.warn('Twilio Voice service not configured - missing credentials');
}

export function getTwilioClient(): twilio.Twilio | null {
  return twilioClient;
}

export function generateVoiceToken(identity: string, tenantId: string): string | null {
  if (!accountSid || !apiKeySid || !apiKeySecret) {
    console.error('Cannot generate voice token - missing Twilio API credentials');
    return null;
  }

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity: identity,
    ttl: 3600,
  });

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    incomingAllow: true,
  });

  token.addGrant(voiceGrant);

  return token.toJwt();
}

export function extractAreaCode(phoneNumber: string): string {
  const cleaned = phoneNumber.replace(/\D/g, '');
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return cleaned.substring(1, 4);
  }
  if (cleaned.length === 10) {
    return cleaned.substring(0, 3);
  }
  return '';
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
  toNumber: string,
  fromNumber: string,
  callbackUrl: string
): Promise<{ callSid: string; status: string } | null> {
  if (!twilioClient) {
    console.error('Twilio client not initialized');
    return null;
  }

  try {
    const call = await twilioClient.calls.create({
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

export async function getRecordingUrl(recordingSid: string): Promise<string | null> {
  if (!twilioClient) {
    console.error('Twilio client not initialized');
    return null;
  }

  try {
    const recording = await twilioClient.recordings(recordingSid).fetch();
    return `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
  } catch (error: any) {
    console.error('Failed to get recording URL:', error.message);
    return null;
  }
}

export async function hangupCall(callSid: string): Promise<boolean> {
  if (!twilioClient) {
    console.error('Twilio client not initialized');
    return false;
  }

  try {
    await twilioClient.calls(callSid).update({ status: 'completed' });
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
  limit: number = 10
): Promise<AvailablePhoneNumber[]> {
  if (!twilioClient) {
    console.error('Twilio client not initialized');
    return [];
  }

  try {
    const numbers = await twilioClient.availablePhoneNumbers('US')
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
  limit: number = 10
): Promise<AvailablePhoneNumber[]> {
  if (!twilioClient) {
    console.error('Twilio client not initialized');
    return [];
  }

  try {
    const numbers = await twilioClient.availablePhoneNumbers('US')
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
  friendlyName?: string
): Promise<{ sid: string; phoneNumber: string } | null> {
  if (!twilioClient) {
    console.error('Twilio client not initialized');
    return null;
  }

  try {
    const voiceUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/voice/inbound`
      : undefined;
    
    const statusCallback = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/voice/call-status`
      : undefined;

    const purchasedNumber = await twilioClient.incomingPhoneNumbers.create({
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
    };
  } catch (error: any) {
    console.error('Failed to provision phone number:', error.message);
    return null;
  }
}

export async function releasePhoneNumber(phoneSid: string): Promise<boolean> {
  if (!twilioClient) {
    console.error('Twilio client not initialized');
    return false;
  }

  try {
    await twilioClient.incomingPhoneNumbers(phoneSid).remove();
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

export async function listOwnedPhoneNumbers(): Promise<OwnedPhoneNumber[]> {
  if (!twilioClient) {
    console.error('Twilio client not initialized');
    return [];
  }

  try {
    const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 100 });
    
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
