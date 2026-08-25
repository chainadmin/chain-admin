/** Normalize user-entered identifiers before looking them up in the database. */
export function normalizeLoginIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Convert the date formats found in imports and browser date inputs to YYYY-MM-DD.
 * Parsing the components ourselves avoids changing the calendar day because of a
 * server's timezone.
 */
export function normalizeLoginDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const input = String(value).trim();
  if (!input) return null;

  const isoMatch = input.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\D|$)/);
  if (isoMatch) {
    return validDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const usMatch = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\D|$)/);
  if (usMatch) {
    return validDateParts(Number(usMatch[3]), Number(usMatch[1]), Number(usMatch[2]));
  }

  const digits = input.replace(/\D/g, "");
  if (digits.length === 8) {
    const yearFirst = validDateParts(
      Number(digits.slice(0, 4)),
      Number(digits.slice(4, 6)),
      Number(digits.slice(6, 8)),
    );
    if (yearFirst) return yearFirst;

    return validDateParts(
      Number(digits.slice(4, 8)),
      Number(digits.slice(0, 2)),
      Number(digits.slice(2, 4)),
    );
  }

  return null;
}

function validDateParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1000 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function loginDatesMatch(provided: string, stored: string | null | undefined): boolean {
  const normalizedProvided = normalizeLoginDate(provided);
  const normalizedStored = normalizeLoginDate(stored);
  return Boolean(normalizedProvided && normalizedStored && normalizedProvided === normalizedStored);
}
