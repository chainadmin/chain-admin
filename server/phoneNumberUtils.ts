export function extractAreaCode(phoneNumber: string): string {
  const cleaned = phoneNumber.replace(/\D/g, '');
  if (cleaned.startsWith('1') && cleaned.length === 11) return cleaned.substring(1, 4);
  if (cleaned.length === 10) return cleaned.substring(0, 3);
  return '';
}

/**
 * Normalize a North American destination to E.164.
 *
 * Keeping this deliberately strict is important for the dial-prefix parser:
 * malformed input must not be made to look like a valid Local Presence call.
 */
export function normalizePhoneNumberE164(phoneNumber: string): string {
  const value = phoneNumber.trim();
  const digits = value.replace(/\D/g, '');

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  throw new Error('Destination must be a valid 10-digit North American phone number');
}

export type ParsedDialString = {
  destination: string;
  localPresenceRequested: boolean;
  controlPrefix: '81' | null;
};

/**
 * The Local Presence control code is two additional leading digits. Thus an
 * unformatted control-code dial is 12 digits (81 + a ten-digit destination),
 * or 13 digits when the caller also entered the NANP country code. A leading
 * "+" always denotes E.164 and can never be interpreted as a control code.
 */
export function parseDialString(dialString: string): ParsedDialString {
  const value = dialString.trim();
  if (!value) throw new Error('Destination is required');

  const digits = value.replace(/\D/g, '');
  const hasLocalPresencePrefix = !value.startsWith('+')
    && digits.startsWith('81')
    && (digits.length === 12 || (digits.length === 13 && digits.substring(2, 3) === '1'));
  const destinationDigits = hasLocalPresencePrefix ? digits.substring(2) : digits;

  return {
    destination: normalizePhoneNumberE164(destinationDigits),
    localPresenceRequested: hasLocalPresencePrefix,
    controlPrefix: hasLocalPresencePrefix ? '81' : null,
  };
}

export const parseLocalPresenceDialString = parseDialString;
