import { db } from "./db";
import { wallets, walletLedger, tenants, tenantAddons, addons } from "@shared/schema";
import { eq, desc, sql, and, gt } from "drizzle-orm";
import type { Wallet, WalletLedgerEntry } from "@shared/schema";

export type WalletDebitType = 'sms_send' | 'email_send' | 'addon_charge' | 'campaign_estimate' | 'reservation' | 'adjustment';
export type WalletCreditType = 'topup' | 'refund' | 'adjustment';

export class InsufficientFundsError extends Error {
  constructor(public neededCents: number, public availableCents: number) {
    super(`Insufficient wallet funds: need ${neededCents}¢, have ${availableCents}¢`);
    this.name = 'InsufficientFundsError';
  }
}

async function getOrCreateWallet(tenantId: string): Promise<Wallet> {
  const existing = await db.select().from(wallets).where(eq(wallets.tenantId, tenantId)).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(wallets)
    .values({ tenantId, balanceCents: 0 })
    .onConflictDoNothing({ target: wallets.tenantId })
    .returning();
  if (created) return created;
  const [refetch] = await db.select().from(wallets).where(eq(wallets.tenantId, tenantId)).limit(1);
  return refetch;
}

async function getBalanceCents(tenantId: string): Promise<number> {
  const w = await getOrCreateWallet(tenantId);
  return Number(w.balanceCents || 0);
}

async function isWalletMode(tenantId: string): Promise<boolean> {
  const [t] = await db.select({ billingMode: tenants.billingMode }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return t?.billingMode === 'wallet';
}

async function credit(
  tenantId: string,
  amountCents: number,
  type: WalletCreditType,
  description?: string,
  metadata?: any,
  parentEntryId?: string,
): Promise<WalletLedgerEntry> {
  if (amountCents <= 0) throw new Error("Credit amount must be positive");
  return await db.transaction(async (tx) => {
    const [w] = await tx
      .update(wallets)
      .set({ balanceCents: sql`${wallets.balanceCents} + ${amountCents}`, updatedAt: new Date() })
      .where(eq(wallets.tenantId, tenantId))
      .returning();
    let walletRow = w;
    if (!walletRow) {
      const [created] = await tx
        .insert(wallets)
        .values({ tenantId, balanceCents: amountCents })
        .returning();
      walletRow = created;
    }
    const [entry] = await tx
      .insert(walletLedger)
      .values({
        tenantId,
        walletId: walletRow.id,
        amountCents,
        balanceAfterCents: Number(walletRow.balanceCents),
        type,
        description: description ?? null,
        metadata: metadata ?? {},
        parentEntryId: parentEntryId ?? null,
      })
      .returning();
    return entry;
  });
}

async function debit(
  tenantId: string,
  amountCents: number,
  type: WalletDebitType,
  description?: string,
  metadata?: any,
  parentEntryId?: string,
): Promise<WalletLedgerEntry> {
  if (amountCents <= 0) throw new Error("Debit amount must be positive");
  await getOrCreateWallet(tenantId);
  return await db.transaction(async (tx) => {
    const [current] = await tx.select().from(wallets).where(eq(wallets.tenantId, tenantId)).for("update").limit(1);
    if (!current) throw new InsufficientFundsError(amountCents, 0);
    const balance = Number(current.balanceCents || 0);
    if (balance < amountCents) {
      throw new InsufficientFundsError(amountCents, balance);
    }
    const newBalance = balance - amountCents;
    await tx
      .update(wallets)
      .set({ balanceCents: newBalance, updatedAt: new Date() })
      .where(eq(wallets.id, current.id));
    const [entry] = await tx
      .insert(walletLedger)
      .values({
        tenantId,
        walletId: current.id,
        amountCents: -amountCents,
        balanceAfterCents: newBalance,
        type,
        description: description ?? null,
        metadata: metadata ?? {},
        parentEntryId: parentEntryId ?? null,
      })
      .returning();
    return entry;
  });
}

/**
 * Daily prorated cost of all active monthly add-ons for a tenant.
 * Used as a soft "reserve" against the wallet balance so a tenant can't
 * spend their wallet down to zero on sends and then fail to pay for
 * the dedicated number / other recurring add-on at month-end.
 */
async function getDailyAddonProrationCents(tenantId: string): Promise<number> {
  const rows = await db
    .select({
      quantity: tenantAddons.quantity,
      monthly: addons.monthlyPriceCents,
    })
    .from(tenantAddons)
    .innerJoin(addons, eq(addons.id, tenantAddons.addonId))
    .where(and(eq(tenantAddons.tenantId, tenantId), eq(tenantAddons.status, 'active')));
  let total = 0;
  for (const r of rows) {
    const monthly = (r.monthly || 0) * (r.quantity || 1);
    if (monthly > 0) total += Math.ceil(monthly / 30);
  }
  return total;
}

/**
 * Reserve funds for an upcoming send/operation. Atomically debits the wallet
 * up-front and returns the ledger entry id which acts as the reservation handle.
 * Throws InsufficientFundsError if balance is insufficient — and the gate
 * includes the tenant's daily add-on proration so sends can't bankrupt the
 * tenant's recurring add-ons (e.g. dedicated number).
 */
async function reserveFunds(
  tenantId: string,
  amountCents: number,
  description: string,
  metadata?: any,
): Promise<WalletLedgerEntry> {
  const addonDaily = await getDailyAddonProrationCents(tenantId);
  const required = amountCents + addonDaily;
  let balance = await getBalanceCents(tenantId);
  if (balance < required) {
    // Attempt auto-reload BEFORE failing — this is what gives wallet
    // tenants a smooth "never run out mid-send" experience.
    try {
      const reload = await maybeAutoReload(tenantId, { force: true });
      if (reload) balance = await getBalanceCents(tenantId);
    } catch (e) {
      console.error('[wallet] reserveFunds auto-reload attempt failed', e);
    }
    if (balance < required) {
      throw new InsufficientFundsError(required, balance);
    }
  }
  return await debit(tenantId, amountCents, 'reservation', description, metadata);
}

/**
 * Commit a reservation by recording how much was actually used.
 * If actualCents < reservedCents, refunds the difference (linked to parent).
 * If actualCents > reservedCents, debits the additional amount.
 */
async function commitReservation(
  reservationId: string,
  actualCents: number,
  finalType: WalletDebitType,
  description?: string,
  metadata?: any,
): Promise<{ refunded?: WalletLedgerEntry; extraDebit?: WalletLedgerEntry; reservation: WalletLedgerEntry }>{
  const [reservation] = await db
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.id, reservationId))
    .limit(1);
  if (!reservation) throw new Error("Reservation not found");
  const reservedCents = Math.abs(Number(reservation.amountCents) || 0);
  // Mark the reservation entry's metadata to reflect what it ended up paying for
  const updatedMeta = {
    ...((reservation.metadata as any) || {}),
    committed: true,
    committedAs: finalType,
    actualCents,
    committedAt: new Date().toISOString(),
    ...(metadata || {}),
  };
  await db
    .update(walletLedger)
    .set({ metadata: updatedMeta, type: finalType, description: description ?? reservation.description })
    .where(eq(walletLedger.id, reservation.id));
  const result: any = { reservation };
  if (actualCents < reservedCents) {
    const diff = reservedCents - actualCents;
    if (diff > 0) {
      result.refunded = await credit(
        reservation.tenantId,
        diff,
        'refund',
        `Refund of unused reserved funds: ${description ?? reservation.description ?? ''}`.trim(),
        { reservationId, originalReservedCents: reservedCents, actualCents },
        reservationId,
      );
    }
  } else if (actualCents > reservedCents) {
    const extra = actualCents - reservedCents;
    try {
      result.extraDebit = await debit(
        reservation.tenantId,
        extra,
        finalType,
        `Additional charge beyond reservation: ${description ?? ''}`.trim(),
        { reservationId, originalReservedCents: reservedCents, actualCents },
        reservationId,
      );
    } catch (e) {
      // Insufficient funds for the extra; the reservation already covered the bulk.
      // Log the shortfall in the reservation metadata for reconciliation.
      await db
        .update(walletLedger)
        .set({ metadata: { ...updatedMeta, shortfallCents: extra } })
        .where(eq(walletLedger.id, reservation.id));
    }
  }
  return result;
}

/**
 * Refund a reservation in full (e.g. when the operation failed entirely).
 */
async function refundReservation(
  reservationId: string,
  reason?: string,
): Promise<WalletLedgerEntry | null> {
  const [reservation] = await db
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.id, reservationId))
    .limit(1);
  if (!reservation) return null;
  const reservedCents = Math.abs(Number(reservation.amountCents) || 0);
  if (reservedCents <= 0) return null;
  const updatedMeta = {
    ...((reservation.metadata as any) || {}),
    refundedInFull: true,
    refundReason: reason ?? null,
    refundedAt: new Date().toISOString(),
  };
  await db
    .update(walletLedger)
    .set({ metadata: updatedMeta })
    .where(eq(walletLedger.id, reservation.id));
  return await credit(
    reservation.tenantId,
    reservedCents,
    'refund',
    reason ?? `Refund of reservation`,
    { reservationId, fullRefund: true },
    reservationId,
  );
}

/**
 * Look up the most recent open reservation for a given campaign id (stored
 * inside the ledger entry's metadata.campaignId). Returns null if the
 * reservation is missing or already committed.
 */
async function findOpenCampaignReservation(
  tenantId: string,
  campaignId: string,
): Promise<WalletLedgerEntry | null> {
  const rows = await db
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.tenantId, tenantId))
    .orderBy(desc(walletLedger.createdAt))
    .limit(50);
  for (const r of rows) {
    const meta = (r.metadata as any) || {};
    if (meta.campaignId === campaignId && r.type === 'reservation' && !meta.committed && !meta.refundedInFull) {
      return r;
    }
  }
  return null;
}

async function listLedger(tenantId: string, limit = 100): Promise<WalletLedgerEntry[]> {
  return await db
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.tenantId, tenantId))
    .orderBy(desc(walletLedger.createdAt))
    .limit(limit);
}

interface WalletRates {
  smsRateMicros: number;
  emailRateMicros: number;
  // Legacy cents view (rounded for display only — never use for billing math)
  smsRateCents: number;
  emailRateCents: number;
  lowBalanceThresholdCents: number;
}

async function getRates(tenantId: string): Promise<WalletRates> {
  const [t] = await db
    .select({
      smsMicros: tenants.walletSmsRateMicros,
      emailMicros: tenants.walletEmailRateMicros,
      smsCents: tenants.walletSmsRateCents,
      emailCents: tenants.walletEmailRateCents,
      threshold: tenants.walletLowBalanceThresholdCents,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const smsRateMicros = t?.smsMicros ?? 9500;
  const emailRateMicros = t?.emailMicros ?? 800;
  return {
    smsRateMicros,
    emailRateMicros,
    smsRateCents: smsRateMicros / 10000,
    emailRateCents: emailRateMicros / 10000,
    lowBalanceThresholdCents: t?.threshold ?? 500,
  };
}

/**
 * Compute a charge in whole cents for `units` units at a sub-cent micros rate.
 * Always rounds UP so the platform never undercharges.
 */
function computeChargeCents(rateMicros: number, units: number): number {
  if (rateMicros <= 0 || units <= 0) return 0;
  const totalMicros = rateMicros * units;
  // 1 cent = 10000 micros
  return Math.ceil(totalMicros / 10000);
}

/**
 * After a successful debit, check if balance fell below the auto-reload
 * threshold and fire an auto-reload via the configured payment method.
 * Returns the credit ledger entry on success, or null if not auto-reloaded.
 *
 * NOTE: This is a stub for the actual payment-processor charge. Wire up to
 * Stripe/AuthNet/NMI in production by calling the existing platform billing
 * service with `walletPaymentMethodToken`.
 */
async function maybeAutoReload(
  tenantId: string,
  opts?: { force?: boolean },
): Promise<WalletLedgerEntry | null> {
  const [t] = await db
    .select({
      enabled: tenants.walletAutoReloadEnabled,
      threshold: tenants.walletAutoReloadThresholdCents,
      amount: tenants.walletAutoReloadAmountCents,
      token: tenants.walletPaymentMethodToken,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!t || !t.enabled || !t.token || !t.amount || t.amount <= 0) return null;
  // When `force` is set (e.g. called from reserveFunds on insufficient
  // funds), skip the threshold gate — the balance is already too low to
  // cover the upcoming send.
  if (!opts?.force) {
    const balance = await getBalanceCents(tenantId);
    if (balance >= (t.threshold ?? 500)) return null;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.warn(`[wallet] auto-reload skipped: STRIPE_SECRET_KEY not configured (tenant ${tenantId})`);
    return null;
  }

  // Idempotency: don't double-charge if an auto-reload was issued in the
  // last 5 minutes. The wallet_ledger metadata.kind === 'auto_reload' acts
  // as our durable lock.
  const recent = await db
    .select({ id: walletLedger.id, createdAt: walletLedger.createdAt })
    .from(walletLedger)
    .where(and(
      eq(walletLedger.tenantId, tenantId),
      eq(walletLedger.type, 'topup'),
      sql`${walletLedger.metadata}->>'kind' = 'auto_reload'`,
      gt(walletLedger.createdAt, new Date(Date.now() - 5 * 60_000)),
    ))
    .limit(1);
  if (recent.length > 0) return null;

  try {
    const StripeMod = (await import("stripe")).default as any;
    const stripe = new StripeMod(stripeKey);
    const idempotencyKey = `wallet-autoreload-${tenantId}-${Math.floor(Date.now() / 60_000)}`;
    const intent = await stripe.paymentIntents.create(
      {
        amount: t.amount,
        currency: 'usd',
        payment_method: t.token,
        confirm: true,
        off_session: true,
        description: `Wallet auto-reload`,
        metadata: { tenantId, kind: 'auto_reload' },
      },
      { idempotencyKey },
    );
    if (intent.status !== 'succeeded') {
      console.warn(`[wallet] auto-reload intent ${intent.id} status=${intent.status} (tenant ${tenantId})`);
      return null;
    }
    return await credit(
      tenantId,
      t.amount,
      'topup',
      `Auto-reload via saved card`,
      { paymentIntentId: intent.id, kind: 'auto_reload' },
    );
  } catch (e: any) {
    console.error(`[wallet] auto-reload failed for tenant ${tenantId}:`, e?.message || e);
    return null;
  }
}

export const walletService = {
  getOrCreateWallet,
  getBalanceCents,
  isWalletMode,
  credit,
  debit,
  reserveFunds,
  commitReservation,
  refundReservation,
  findOpenCampaignReservation,
  listLedger,
  getRates,
  computeChargeCents,
  maybeAutoReload,
  getDailyAddonProrationCents,
};
