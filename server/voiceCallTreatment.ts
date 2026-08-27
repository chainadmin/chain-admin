import twilio from 'twilio';
import { buildTenantVoiceIdentity } from './twilioVoiceService';
import { voiceMediaUrl } from './voiceMediaCatalog';

export function buildWaitingMusicTwiML(musicKey: string, callbackBase: string): string {
  const response = new twilio.twiml.VoiceResponse();
  response.play({ loop: 0 }, voiceMediaUrl(musicKey, callbackBase));
  return response.toString();
}

export function buildReconnectClientTwiML(tenantId: string, userId: string): string {
  const response = new twilio.twiml.VoiceResponse();
  response.dial().client(buildTenantVoiceIdentity(tenantId, userId));
  return response.toString();
}