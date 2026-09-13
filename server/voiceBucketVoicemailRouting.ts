/**
 * Company-wide opt-in: when on, EVERY number in the caller-ID bucket list
 * (not just the one dedicated Privacy line) skips ringing the team on a
 * callback and goes straight to voicemail — the ordinary main voicemail
 * greeting, never the dedicated Privacy greeting/inbox, and excluded from
 * missed-call counts the same way a Privacy line call already is. It is
 * all-or-nothing across the whole bucket list, never configurable per number.
 */
export function isBucketDirectVoicemail(input: {
  isPrivacyLine: boolean;
  numberType: string | null | undefined;
  localPresenceCallerIdEnabled: boolean | null | undefined;
  bucketRoutesToVoicemailSetting: boolean | null | undefined;
}): boolean {
  return !input.isPrivacyLine
    && input.numberType === "LOCAL_PRESENCE"
    && input.localPresenceCallerIdEnabled === true
    && input.bucketRoutesToVoicemailSetting === true;
}
