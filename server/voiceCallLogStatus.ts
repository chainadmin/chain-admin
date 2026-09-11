export const MISSED_INBOUND_STATUSES = new Set(['busy', 'no-answer', 'failed', 'canceled']);

/**
 * Twilio reports the parent inbound call as completed after its TwiML finishes,
 * even when no agent answered and the caller continued to voicemail. Preserve
 * the authoritative Dial result, and treat a persisted voicemail as definitive
 * evidence that the inbound call was missed.
 */
export function resolveInboundCallLogStatus(
  currentStatus: string | null | undefined,
  providerStatus: string | null | undefined,
  hasVoicemail = false,
): string {
  const current = String(currentStatus || '').toLowerCase();
  const incoming = String(providerStatus || '').toLowerCase();

  if (hasVoicemail) return MISSED_INBOUND_STATUSES.has(current) ? current : 'no-answer';
  if (MISSED_INBOUND_STATUSES.has(current) && incoming === 'completed') return current;
  return incoming || current || 'ringing';
}
