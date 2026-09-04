import { z } from "zod";

export type InvoiceIssuer = "CHAIN" | "CHIAMO";

export const INVOICE_BRANDS = {
  CHAIN: {
    displayName: "Chain Software Group",
    sender: "Chain Software Group <support@chainsoftwaregroup.com>",
    replyTo: "support@chainsoftwaregroup.com",
    filePrefix: "Chain-Invoice",
  },
  CHIAMO: {
    displayName: "Chiamo Connect",
    sender: "Chiamo Connect <support@chiamoconnect.com>",
    replyTo: "support@chiamoconnect.com",
    filePrefix: "Chiamo-Connect-Invoice",
  },
} as const;

export function classifyInvoiceCustomer(tenant: { chainCoreEnabled: boolean; chiamoConnectEnabled: boolean }): "CHAIN" | "CHIAMO_ONLY" {
  return tenant.chiamoConnectEnabled && !tenant.chainCoreEnabled ? "CHIAMO_ONLY" : "CHAIN";
}

export function normalizeInvoiceRecipient(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && z.string().email().max(254).safeParse(normalized).success ? normalized : null;
}

export function resolveInvoiceRecipient(
  issuer: InvoiceIssuer,
  tenantEmail?: string | null,
  chainBillingEmail?: string | null,
): string | null {
  return normalizeInvoiceRecipient(issuer === "CHAIN" ? chainBillingEmail || tenantEmail : tenantEmail);
}

export function sanitizeDeliveryError(error: unknown): string {
  const generic = "Invoice email delivery failed; retry is pending.";
  if (!(error instanceof Error) || !error.message) return generic;
  return error.message
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(?:token|key|secret|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500) || generic;
}

export function shouldDeliverInvoice(status: "pending" | "sent" | "failed" | string | null): boolean {
  return status === "pending" || status === "failed";
}

/** A sending claim is retried only after the worker has had an hour to finish. */
export function isDeliveryClaimEligible(status: string | null, attemptedAt: Date | null, now = new Date()): boolean {
  return status === "pending" || status === "failed"
    || (status === "sending" && !!attemptedAt && now.getTime() - attemptedAt.getTime() >= 60 * 60 * 1000);
}