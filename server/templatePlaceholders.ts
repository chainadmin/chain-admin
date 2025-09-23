import type { ArrangementOption } from "@shared/schema";

type Primitive = string | number | null | undefined;

export type ArrangementReplacement = ArrangementOption & {
  summary?: string;
  details?: string;
  balanceRange?: string;
  monthlyRange?: string;
  maxTermLabel?: string;
};

export interface TemplateReplacementOptions {
  baseUrl?: string;
  arrangement?: ArrangementReplacement;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatCurrency(cents: Primitive): string {
  if (cents === null || cents === undefined) return "";
  const numericValue = typeof cents === "number" ? cents : Number(cents);
  if (Number.isNaN(numericValue)) return "";
  return `$${(numericValue / 100).toFixed(2)}`;
}

export function formatCurrencyRange(min?: Primitive, max?: Primitive): string {
  const minFormatted = formatCurrency(min ?? null);
  const maxFormatted = formatCurrency(max ?? null);

  if (minFormatted && maxFormatted) {
    if (minFormatted === maxFormatted) return minFormatted;
    return `${minFormatted} - ${maxFormatted}`;
  }

  return minFormatted || maxFormatted || "";
}

export function buildArrangementSummary(arrangement?: ArrangementOption | null): string {
  if (!arrangement) return "";

  const monthlyRange = formatCurrencyRange(arrangement.monthlyPaymentMin, arrangement.monthlyPaymentMax);
  const balanceRange = formatCurrencyRange(arrangement.minBalance, arrangement.maxBalance);
  const parts: string[] = [];

  if (monthlyRange) {
    parts.push(`Monthly payments between ${monthlyRange}`);
  }

  if (balanceRange) {
    parts.push(`for balances ${balanceRange}`);
  }

  if (arrangement.maxTermMonths) {
    parts.push(`up to ${arrangement.maxTermMonths} months`);
  }

  return parts.length ? `${parts.join(" ")}.` : "";
}

export function buildArrangementDetails(arrangement?: ArrangementOption | null): string {
  if (!arrangement) return "";

  const summary = buildArrangementSummary(arrangement);
  const balanceRange = formatCurrencyRange(arrangement.minBalance, arrangement.maxBalance);
  const monthlyRange = formatCurrencyRange(arrangement.monthlyPaymentMin, arrangement.monthlyPaymentMax);

  const lines = [
    arrangement.name ? `Plan: ${arrangement.name}` : null,
    arrangement.description || null,
    summary || null,
    balanceRange ? `Eligible balances: ${balanceRange}` : null,
    monthlyRange ? `Estimated monthly payment: ${monthlyRange}` : null,
    arrangement.maxTermMonths ? `Maximum term: ${arrangement.maxTermMonths} months` : null,
  ].filter(Boolean) as string[];

  return lines.join("\n");
}

export function enrichArrangement(option?: ArrangementOption | null): ArrangementReplacement | undefined {
  if (!option) return undefined;

  return {
    ...option,
    summary: buildArrangementSummary(option),
    details: buildArrangementDetails(option),
    balanceRange: formatCurrencyRange(option.minBalance, option.maxBalance),
    monthlyRange: formatCurrencyRange(option.monthlyPaymentMin, option.monthlyPaymentMax),
    maxTermLabel: option.maxTermMonths ? `${option.maxTermMonths} months` : "",
  };
}

function applyTemplateReplacement(template: string, key: string, value: string): string {
  if (!template) return template;
  const sanitizedValue = value ?? "";
  const regex = new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "gi");
  return template.replace(regex, sanitizedValue);
}

export function replaceTemplateVariables(
  template: string,
  consumer: any,
  account: any,
  tenant: any,
  options: TemplateReplacementOptions = {},
): string {
  if (!template) return template;

  const baseUrl = (options.baseUrl ?? process.env.REPLIT_DOMAINS) || "localhost:5000";
  const sanitizedBaseUrl = (baseUrl || "localhost:5000").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const consumerEmail = consumer?.email || "";
  const consumerSlug = tenant?.slug;

  let consumerPortalUrl = "";
  if (sanitizedBaseUrl && consumerSlug) {
    const emailPath = consumerEmail ? `/${encodeURIComponent(consumerEmail)}` : "";
    consumerPortalUrl = `https://${sanitizedBaseUrl}/consumer/${consumerSlug}${emailPath}`;
  }

  const appDownloadUrl = sanitizedBaseUrl ? `https://${sanitizedBaseUrl}/download` : "";

  const firstName = consumer?.firstName || "";
  const lastName = consumer?.lastName || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const consumerPhone = consumer?.phone || "";

  const balanceCents = account?.balanceCents;
  const formattedBalance = formatCurrency(balanceCents);
  const formattedDueDate = account?.dueDate ? new Date(account.dueDate).toLocaleDateString() : "";
  const dueDateIso = account?.dueDate ? new Date(account.dueDate).toISOString().split("T")[0] : "";

  const arrangement = options.arrangement;
  const arrangementSummary = arrangement ? arrangement.summary ?? buildArrangementSummary(arrangement) : "";
  const arrangementDetails = arrangement ? arrangement.details ?? buildArrangementDetails(arrangement) : "";
  const arrangementBalanceRange = arrangement
    ? arrangement.balanceRange ?? formatCurrencyRange(arrangement.minBalance, arrangement.maxBalance)
    : "";
  const arrangementMonthlyRange = arrangement
    ? arrangement.monthlyRange ?? formatCurrencyRange(arrangement.monthlyPaymentMin, arrangement.monthlyPaymentMax)
    : "";
  const arrangementMaxTermLabel = arrangement
    ? arrangement.maxTermLabel ?? (arrangement.maxTermMonths ? `${arrangement.maxTermMonths} months` : "")
    : "";

  const replacements: Record<string, string> = {
    firstName,
    lastName,
    fullName,
    consumerName: fullName,
    email: consumerEmail,
    phone: consumerPhone,
    consumerId: consumer?.id || "",
    accountId: account?.id || "",
    accountNumber: account?.accountNumber || "",
    creditor: account?.creditor || "",
    balance: formattedBalance,
    balence: formattedBalance,
    balanceCents: balanceCents !== undefined && balanceCents !== null ? String(balanceCents) : "",
    dueDate: formattedDueDate,
    dueDateIso,
    consumerPortalLink: consumerPortalUrl,
    consumerPortalUrl,
    appDownloadLink: appDownloadUrl,
    agencyName: tenant?.name || "",
    agencyEmail: tenant?.email || "",
    agencyPhone: tenant?.phoneNumber || tenant?.twilioPhoneNumber || "",
    arrangementId: arrangement?.id || "",
    arrangementName: arrangement?.name || "",
    arrangementDescription: arrangement?.description || "",
    arrangementSummary,
    arrangementDetails,
    arrangementBalanceRange,
    arrangementMonthlyRange,
    arrangementMonthlyPaymentMin: arrangement ? formatCurrency(arrangement.monthlyPaymentMin) : "",
    arrangementMonthlyPaymentMax: arrangement ? formatCurrency(arrangement.monthlyPaymentMax) : "",
    arrangementMinBalance: arrangement ? formatCurrency(arrangement.minBalance) : "",
    arrangementMaxBalance: arrangement ? formatCurrency(arrangement.maxBalance) : "",
    arrangementMaxTerm: arrangement?.maxTermMonths ? String(arrangement.maxTermMonths) : "",
    arrangementMaxTermMonths: arrangement?.maxTermMonths ? String(arrangement.maxTermMonths) : "",
    arrangementMaxTermLabel,
  };

  let processedTemplate = template;
  for (const [key, value] of Object.entries(replacements)) {
    processedTemplate = applyTemplateReplacement(processedTemplate, key, value || "");
  }

  return processedTemplate;
}
