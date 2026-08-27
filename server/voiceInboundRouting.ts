import twilio from 'twilio';
import { buildTenantVoiceIdentity } from './twilioVoiceService';

export type InboundGreeting = {
  enabled: boolean;
  type: 'TEXT' | 'AUDIO' | null;
  text?: string | null;
  audioUrl?: string | null;
};

export type InboundRoute = {
  tenantId: string;
  callSid: string;
  bucketId?: string | null;
  mode: 'RING_TEAM' | 'VOICEMAIL';
  agentIds: string[];
  timeoutSeconds: number;
  greeting: InboundGreeting;
  callbackBase: string;
};

export function buildVoicemailTwiML(route: Pick<InboundRoute, 'bucketId' | 'callbackBase'>): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: 'alice' }, 'Please leave a message after the tone.');
  const query = route.bucketId ? `?bucketId=${encodeURIComponent(route.bucketId)}` : '';
  response.record({
    maxLength: 180,
    playBeep: true,
    action: `${route.callbackBase}/api/voice/voicemail-complete`,
    method: 'POST',
    recordingStatusCallback: `${route.callbackBase}/api/voice/voicemail-recording${query}`,
    recordingStatusCallbackMethod: 'POST',
  });
  return response.toString();
}

export function buildVoicemailCompleteTwiML(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.hangup();
  return response.toString();
}

export function buildInboundTwiML(route: InboundRoute): string {
  // Direct voicemail deliberately bypasses the tenant-wide greeting.
  if (route.mode === 'VOICEMAIL') return buildVoicemailTwiML(route);
  const response = new twilio.twiml.VoiceResponse();
  if (route.greeting.enabled) {
    if (route.greeting.type === 'TEXT' && route.greeting.text) {
      response.say({ voice: 'alice', language: 'en-US' }, route.greeting.text);
    } else if (route.greeting.type === 'AUDIO' && route.greeting.audioUrl) {
      response.play(route.greeting.audioUrl);
    }
  }
  if (!route.agentIds.length) {
    response.redirect({ method: 'POST' }, `${route.callbackBase}/api/voice/inbound-voicemail${route.bucketId ? `?bucketId=${encodeURIComponent(route.bucketId)}` : ''}`);
    return response.toString();
  }
  const dial = response.dial({
    timeout: route.timeoutSeconds,
    action: `${route.callbackBase}/api/voice/dial-status${route.bucketId ? `?bucketId=${encodeURIComponent(route.bucketId)}` : ''}`,
    method: 'POST',
  });
  for (const id of route.agentIds) dial.client(buildTenantVoiceIdentity(route.tenantId, id));
  return response.toString();
}
