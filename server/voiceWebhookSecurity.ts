import twilio from 'twilio';

export type VoiceWebhookCredential = {
  tenantId: string;
  authToken: string;
};

export async function verifyTwilioVoiceWebhook(input: {
  signature?: string | null;
  publicUrl: string;
  params: Record<string, string>;
  accountSid?: string | null;
  resolveCredential: (accountSid: string) => Promise<VoiceWebhookCredential | null>;
}): Promise<string | null> {
  if (!input.signature || !input.accountSid) return null;
  const credential = await input.resolveCredential(input.accountSid);
  if (!credential) return null;
  return twilio.validateRequest(credential.authToken, input.signature, input.publicUrl, input.params)
    ? credential.tenantId
    : null;
}