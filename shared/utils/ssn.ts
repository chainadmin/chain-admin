export interface ParsedSsnLast4 {
  /** Normalized four-digit string when a valid value is provided, otherwise null. */
  normalized: string | null;
  /** Indicates if any non-empty value was provided by the caller. */
  hasValue: boolean;
  /** Indicates if the provided value is valid (digits-only and exactly four digits when present). */
  isValid: boolean;
}

function extractDigits(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(Math.trunc(value)).toString();
  }

  if (typeof value === "string") {
    return value.replace(/\D/g, "");
  }

  return "";
}

function hasProvidedValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
}

/**
 * Normalizes any user-provided SSN last-four input into a digits-only string.
 * Returns null when the input doesn't contain at least four digits.
 */
export function normalizeSsnLast4(value: unknown): string | null {
  const digits = extractDigits(value);
  if (digits.length < 4) {
    return null;
  }
  const normalized = digits.slice(-4);
  return normalized.length === 4 ? normalized : null;
}

/**
 * Parses a raw SSN last-four input and reports if it is valid together with the normalized value.
 */
export function parseSsnLast4(value: unknown): ParsedSsnLast4 {
  const hasValue = hasProvidedValue(value);
  if (!hasValue) {
    return {
      normalized: null,
      hasValue: false,
      isValid: true,
    };
  }

  const normalized = normalizeSsnLast4(value);
  return {
    normalized,
    hasValue: true,
    isValid: normalized !== null,
  };
}

/**
 * Returns a masked representation suitable for UI display.
 */
export function maskSsnLast4(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return `•••• ${value}`;
}
