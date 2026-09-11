export const US_PAYMENT_TIME_ZONE = "America/New_York";

const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Returns the US Eastern calendar date for an instant. Payment processing runs
 * in this same time zone, so midnight UTC never advances the UI a day early.
 */
export function getUsPaymentDateKey(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: US_PAYMENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Formats either a payment instant or a date-only schedule without UTC drift. */
export function formatUsPaymentDate(value: string, includeTime = true): string {
  const calendarMatch = calendarDatePattern.exec(value);
  // Noon UTC is still the same calendar day throughout the continental US.
  const date = new Date(calendarMatch ? `${value}T12:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return "Invalid date";

  return date.toLocaleDateString("en-US", {
    timeZone: US_PAYMENT_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(calendarMatch || !includeTime
      ? {}
      : { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }),
  });
}

export function getUsRelativeDateLabel(dateKey: string, now = new Date()): string {
  if (dateKey === "unknown" || !dateKey) return "Unknown Date";

  const todayKey = getUsPaymentDateKey(now);
  const yesterday = new Date(`${todayKey}T12:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (dateKey === todayKey) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";
  return formatUsPaymentDate(dateKey, false);
}
