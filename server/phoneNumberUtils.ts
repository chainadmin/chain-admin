export function extractAreaCode(phoneNumber: string): string {
  const cleaned = phoneNumber.replace(/\D/g, '');
  if (cleaned.startsWith('1') && cleaned.length === 11) return cleaned.substring(1, 4);
  if (cleaned.length === 10) return cleaned.substring(0, 3);
  return '';
}
