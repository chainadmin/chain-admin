import jwt from 'jsonwebtoken';

export type GreetingAudioSelection = {
  purpose: 'voice-greeting-audio';
  tenantId: string;
  objectName: string;
  contentType: string;
};

export type VoicemailAudioSelection = {
  purpose: 'voice-voicemail-audio';
  tenantId: string;
  voicemailId: string;
};

export function signGreetingAudioToken(secret: string, selection: Omit<GreetingAudioSelection, 'purpose'>): string {
  return jwt.sign({ purpose: 'voice-greeting-audio', ...selection }, secret, { expiresIn: '10m' });
}

export function verifyGreetingAudioToken(secret: string, token: string, expectedTenantId?: string): GreetingAudioSelection | null {
  try {
    const selection = jwt.verify(token, secret) as Partial<GreetingAudioSelection>;
    const validContentType = ['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(selection.contentType || '');
    if (selection.purpose !== 'voice-greeting-audio'
      || !selection.tenantId
      || typeof (selection as any).exp !== 'number'
      || (expectedTenantId && selection.tenantId !== expectedTenantId)
      || !selection.objectName?.startsWith(`voice-greetings/${selection.tenantId}/`)
      || !validContentType) return null;
    return selection as GreetingAudioSelection;
  } catch {
    return null;
  }
}

export function createGreetingAudioReference(selection: Omit<GreetingAudioSelection, 'purpose'>): string {
  return `voice-greeting-ref:${Buffer.from(JSON.stringify(selection)).toString('base64url')}`;
}

export function parseGreetingAudioReference(reference: string, expectedTenantId?: string): Omit<GreetingAudioSelection, 'purpose'> | null {
  try {
    if (!reference.startsWith('voice-greeting-ref:')) return null;
    const selection = JSON.parse(Buffer.from(reference.slice('voice-greeting-ref:'.length), 'base64url').toString('utf8'));
    if (!selection.tenantId
      || (expectedTenantId && selection.tenantId !== expectedTenantId)
      || !selection.objectName?.startsWith(`voice-greetings/${selection.tenantId}/`)
      || !['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(selection.contentType)) return null;
    return selection;
  } catch {
    return null;
  }
}

export function createGreetingPlaybackUrl(secret: string, publicBaseUrl: string, reference: string): string | null {
  const selection = parseGreetingAudioReference(reference);
  if (!selection) return null;
  const token = signGreetingAudioToken(secret, selection);
  return `${publicBaseUrl.replace(/\/$/, '')}/api/voice/greeting-audio?token=${encodeURIComponent(token)}`;
}

export function signVoicemailAudioToken(secret: string, selection: Omit<VoicemailAudioSelection, 'purpose'>): string {
  return jwt.sign({ purpose: 'voice-voicemail-audio', ...selection }, secret, { expiresIn: '5m' });
}

export function verifyVoicemailAudioToken(secret: string, token: string): VoicemailAudioSelection | null {
  try {
    const selection = jwt.verify(token, secret) as Partial<VoicemailAudioSelection>;
    if (selection.purpose !== 'voice-voicemail-audio' || !selection.tenantId || !selection.voicemailId) return null;
    return selection as VoicemailAudioSelection;
  } catch {
    return null;
  }
}