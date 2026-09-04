import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { agencyCredentials, invoices, tenants } from "@shared/schema";
import { chiamoSubscriptions } from "@shared/chiamo-schema";
import { calculateChiamoMonthlyService } from "@shared/chiamo";
import { db } from "./db";
import { emailService } from "./emailService";
import { generateInvoicePdf } from "./invoicePdf";
import {
  INVOICE_BRANDS,
  classifyInvoiceCustomer,
  resolveInvoiceRecipient,
  sanitizeDeliveryError,
} from "./invoiceBranding";

type ChiamoSubscription = typeof chiamoSubscriptions.$inferSelect;

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function oneCalendarMonthEarlier(value: string): string {
  const date = utcDate(value);
  const targetMonth = date.getUTCMonth() - 1;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(date.getUTCDate(), lastDay)).padStart(2, "0")}`;
}

export function oneCalendarMonthLater(value: string): string {
  const date = utcDate(value);
  const targetMonth = date.getUTCMonth() + 1;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(date.getUTCDate(), lastDay)).padStart(2, "0")}`;
}

export function buildChiamoInvoiceSnapshot(subscription: ChiamoSubscription, activeUsers: number) {
  const customCharges = (subscription.customCharges || []).map(charge => ({ ...charge, cents: Math.max(0, charge.cents) }));
  const discounts = (subscription.discounts || []).map(discount => ({ ...discount, cents: Math.max(0, discount.cents) }));
  const calculation = calculateChiamoMonthlyService(
    subscription.planId,
    activeUsers,
    subscription.smsAddonEnabled,
    {
      customBasePriceCents: subscription.customBasePriceCents,
      includedUsers: subscription.includedUsers,
      additionalUserPriceCents: subscription.additionalUserPriceCents,
      customCharges,
      discounts,
    },
  );
  if (!calculation) throw new Error(`Unknown Chiamo plan: ${subscription.planId}`);
  const chargeItems = [
    { description: `${calculation.plan.name} — Chiamo Connect monthly service`, amountCents: calculation.basePriceCents },
    ...(calculation.additionalUsers ? [{
      description: "Active agency user overage",
      amountCents: calculation.additionalUserChargeCents,
      quantity: calculation.additionalUsers,
      unitLabel: "users",
    }] : []),
    ...(calculation.textingChargeCents ? [{ description: "Business Texting add-on", amountCents: calculation.textingChargeCents }] : []),
    ...customCharges.filter(charge => charge.cents > 0).map(charge => ({ description: charge.name, amountCents: charge.cents })),
  ];
  let remainingChargeCents = chargeItems.reduce((sum, item) => sum + item.amountCents, 0);
  const discountItems = discounts.flatMap(discount => {
    const appliedCents = Math.min(discount.cents, remainingChargeCents);
    remainingChargeCents -= appliedCents;
    return appliedCents > 0 ? [{ description: `${discount.name} discount`, amountCents: -appliedCents }] : [];
  });
  const lineItems = [...chargeItems, ...discountItems];
  const lineItemTotal = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  if (lineItemTotal !== calculation.totalCents) {
    throw new Error("Chiamo invoice line items do not match the calculated total.");
  }
  return { calculation, lineItems };
}

async function deliverChiamoInvoice(invoiceId: string): Promise<boolean> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 60 * 60 * 1000);
  const [claim] = await db.update(invoices).set({ deliveryStatus: "sending", deliveryAttemptedAt: now, deliveryLastError: null })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.issuer, "CHIAMO"), or(
      eq(invoices.deliveryStatus, "pending"),
      eq(invoices.deliveryStatus, "failed"),
      and(eq(invoices.deliveryStatus, "sending"), lte(invoices.deliveryAttemptedAt, staleBefore)),
    ))).returning({ id: invoices.id });
  if (!claim) return false;
  const [row] = await db.select({ invoice: invoices, tenantName: tenants.name })
    .from(invoices).innerJoin(tenants, eq(invoices.tenantId, tenants.id))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.issuer, "CHIAMO"))).limit(1);
  if (!row) return false;
  if (!row.invoice.recipientEmail) {
    await db.update(invoices).set({ deliveryStatus: "failed", deliveryLastError: "No valid billing email is on file." })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.issuer, "CHIAMO")));
    return false;
  }
  const brand = INVOICE_BRANDS.CHIAMO;
  const pdf = generateInvoicePdf({ ...row.invoice, issuer: "CHIAMO", tenantName: row.tenantName, status: row.invoice.status || "pending" });
  const amount = (Number(row.invoice.totalAmountCents) / 100).toFixed(2);
  const result = await emailService.sendEmail({
    to: row.invoice.recipientEmail,
    from: brand.sender,
    replyTo: brand.replyTo,
    subject: `Chiamo Connect Invoice ${row.invoice.invoiceNumber} — $${amount}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2 style="color:#21bfb2">Chiamo Connect Invoice ${row.invoice.invoiceNumber}</h2><p>Dear ${escapeHtml(row.tenantName)},</p><p>Your Chiamo Connect business communications invoice is attached.</p><p><strong>Total due: $${amount}</strong><br>Due ${row.invoice.dueDate.toLocaleDateString()}</p><p>Questions? Reply to this email to contact Chiamo Connect support.</p><hr><small>Chiamo Connect business communications</small></div>`,
    tag: "chiamo-invoice",
    tenantId: row.invoice.tenantId,
    useTenantDeliveryConfig: false,
    attachments: [{ name: `${brand.filePrefix}-${safeFilePart(row.invoice.invoiceNumber)}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
  if (result.success) {
    await db.update(invoices).set({ deliveryStatus: "sent", emailedAt: new Date(), deliveryLastError: null })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.issuer, "CHIAMO"), eq(invoices.deliveryStatus, "sending")));
    return true;
  }
  await db.update(invoices).set({ deliveryStatus: "failed", deliveryLastError: sanitizeDeliveryError(new Error(result.error || "Postmark delivery failed")) })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.issuer, "CHIAMO")));
  return false;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const safeFilePart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");

export async function runChiamoInvoicePass(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const rows = await db.select({ tenant: tenants, subscription: chiamoSubscriptions })
    .from(tenants).innerJoin(chiamoSubscriptions, eq(chiamoSubscriptions.tenantId, tenants.id))
    .where(and(eq(tenants.chiamoConnectEnabled, true), eq(tenants.chainCoreEnabled, false), eq(chiamoSubscriptions.billingStatus, "ACTIVE")));
  let created = 0, sent = 0, failed = 0, skipped = 0;
  for (const row of rows) {
    if (classifyInvoiceCustomer(row.tenant) !== "CHIAMO_ONLY") continue;
    const outstanding = await db.select({ id: invoices.id }).from(invoices).where(and(
      eq(invoices.tenantId, row.tenant.id), eq(invoices.issuer, "CHIAMO"),
      or(eq(invoices.deliveryStatus, "pending"), eq(invoices.deliveryStatus, "failed"), eq(invoices.deliveryStatus, "sending")),
    )).orderBy(asc(invoices.createdAt));
    if (outstanding.length) {
      for (const invoice of outstanding) (await deliverChiamoInvoice(invoice.id)) ? sent++ : failed++;
    }
    if (!row.subscription.nextBillingDate || row.subscription.nextBillingDate > today) { skipped++; continue; }
    const createdInvoice = await db.transaction(async tx => {
      const [lockedTenant] = await tx.select().from(tenants).where(eq(tenants.id, row.tenant.id)).for("update").limit(1);
      const [lockedSub] = await tx.select().from(chiamoSubscriptions).where(eq(chiamoSubscriptions.tenantId, row.tenant.id)).for("update").limit(1);
      if (!lockedTenant || !lockedSub || classifyInvoiceCustomer(lockedTenant) !== "CHIAMO_ONLY" || lockedSub.billingStatus !== "ACTIVE" || !lockedSub.nextBillingDate || lockedSub.nextBillingDate > today) return null;
      const periodEndText = lockedSub.nextBillingDate;
      const periodStartText = oneCalendarMonthEarlier(periodEndText);
      const boundedStart = lockedSub.startDate && lockedSub.startDate > periodStartText ? lockedSub.startDate : periodStartText;
      const periodStart = utcDate(boundedStart);
      const periodEnd = utcDate(periodEndText);
      const [{ count: activeUsers }] = await tx.select({ count: sql<number>`count(*)::int` }).from(agencyCredentials)
        .where(and(eq(agencyCredentials.tenantId, row.tenant.id), eq(agencyCredentials.isActive, true)));
      const snapshot = buildChiamoInvoiceSnapshot(lockedSub, activeUsers);
      const existing = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.tenantId, row.tenant.id), eq(invoices.issuer, "CHIAMO"), eq(invoices.periodStart, periodStart), eq(invoices.periodEnd, periodEnd))).limit(1);
      if (existing.length) return null;
      const [invoice] = await tx.insert(invoices).values({
        tenantId: row.tenant.id, subscriptionId: null, invoiceNumber: `CHIAMO-${periodEndText.replace(/-/g, "")}-${row.tenant.id.slice(0, 8)}`,
        issuer: "CHIAMO", recipientEmail: resolveInvoiceRecipient("CHIAMO", row.tenant.email), deliveryStatus: "pending",
        periodStart, periodEnd, dueDate: periodEnd, status: "pending",
        baseAmountCents: snapshot.calculation.basePriceCents, perConsumerCents: 0, consumerCount: activeUsers,
        totalAmountCents: snapshot.calculation.totalCents, lineItems: snapshot.lineItems,
      }).returning();
      await tx.update(chiamoSubscriptions).set({ nextBillingDate: oneCalendarMonthLater(periodEndText), updatedAt: now }).where(eq(chiamoSubscriptions.tenantId, row.tenant.id));
      return invoice;
    });
    if (!createdInvoice) { skipped++; continue; }
    created++;
    (await deliverChiamoInvoice(createdInvoice.id)) ? sent++ : failed++;
  }
  return { created, sent, failed, skipped };
}