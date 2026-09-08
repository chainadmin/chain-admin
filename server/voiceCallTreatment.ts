import twilio from 'twilio';
import { buildTenantVoiceIdentity } from './twilioVoiceService';
import { voiceMediaUrl } from './voiceMediaCatalog';

export function buildWaitingMusicTwiML(musicKey: string, callbackBase: string): string {
  const response = new twilio.twiml.VoiceResponse();
  response.play({ loop: 0 }, voiceMediaUrl(musicKey, callbackBase));
  return response.toString();
}

export type ReconnectClientOptions = {
  retainedCallId: string;
  reconnectToken: string;
  callbackUrl: string;
};

export function buildReconnectClientTwiML(
  tenantId: string,
  userId: string,
  options: ReconnectClientOptions,
): string {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    action: options.callbackUrl,
    method: 'POST',
    timeout: 25,
  });
  const client = dial.client({
    statusCallback: options.callbackUrl,
    statusCallbackEvent: ['answered', 'completed'],
    statusCallbackMethod: 'POST',
  });
  client.identity(buildTenantVoiceIdentity(tenantId, userId));
  client.parameter({ name: 'RetainedCallId', value: options.retainedCallId });
  client.parameter({ name: 'ReconnectToken', value: options.reconnectToken });
  return response.toString();
}