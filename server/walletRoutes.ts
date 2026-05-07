import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { db } from "./db";
import { addons, tenantAddons, tenants, invoices, voipPhoneNumbers } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticateUser, requireOwner } from "./authMiddleware";
import { walletService, InsufficientFundsError } from "./walletService";
import { storage } from "./storage";

// 404 if the tenant is not in wallet billing mode. Required by the wallet
// routing contract — non-wallet tenants should not see wallet endpoints.
const requireWalletMode: RequestHandler = async (req: any, res, next) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ message: "No tenant access" });
  if (!(await walletService.isWalletMode(tenantId))) {
    return res.status(404).json({ message: "Wallet not enabled for this tenant" });
  }
  next();
};

// platform_admin only
const requirePlatformAdmin: RequestHandler = (req: any, res, next) => {
  if (req.user?.role === 'platform_admin') return next();
  return res.status(403).json({ message: "Platform admin privileges required." });
};

export function registerWalletRoutes(app: Express) {
  // ---- Wallet ----
  app.get('/api/wallet/balance', authenticateUser, requireWalletMode, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const balanceCents = await walletService.getBalanceCents(tenantId);
      const rates = await walletService.getRates(tenantId);
      res.json({
        balanceCents,
        balanceDollars: balanceCents / 100,
        lowBalance: balanceCents < rates.lowBalanceThresholdCents,
        ...rates,
      });
    } catch (err: any) {
      console.error("wallet/balance error:", err);
      res.status(500).json({ message: "Failed to fetch wallet balance" });
    }
  });

  app.get('/api/wallet/ledger', authenticateUser, requireWalletMode, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
      const entries = await walletService.listLedger(tenantId, limit);
      res.json({ entries });
    } catch (err: any) {
      console.error("wallet/ledger error:", err);
      res.status(500).json({ message: "Failed to fetch wallet ledger" });
    }
  });

  // Cost estimate including any active monthly add-on proration if requested.
  app.post('/api/wallet/estimate', authenticateUser, requireWalletMode, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const schema = z.object({
        channel: z.enum(['sms', 'email']),
        // Accept either `units` (legacy) or `recipientCount` (mobile) — they
        // mean the same thing: the number of recipients to send to.
        units: z.number().int().min(1).max(1_000_000).optional(),
        recipientCount: z.number().int().min(1).max(1_000_000).optional(),
        // For SMS, optional message to compute segment-precise cost
        message: z.string().optional(),
        // Include prorated daily share of active monthly add-ons in the estimate
        includeAddons: z.boolean().optional(),
      }).refine((d) => d.units != null || d.recipientCount != null, {
        message: 'units or recipientCount is required',
      });
      const parsed = schema.parse(req.body);
      const { channel, message, includeAddons } = parsed;
      const units = (parsed.units ?? parsed.recipientCount)!;
      const rates = await walletService.getRates(tenantId);
      const rateMicros = channel === 'sms' ? rates.smsRateMicros : rates.emailRateMicros;
      // For SMS: if a message is provided, segments = ceil(len / 160) per recipient
      const effectiveUnits = channel === 'sms' && message
        ? Math.max(1, Math.ceil(message.length / 160)) * units
        : units;
      const sendCents = walletService.computeChargeCents(rateMicros, effectiveUnits);

      let addonProrationCents = 0;
      const addonBreakdown: any[] = [];
      if (includeAddons) {
        const rows = await db
          .select({
            quantity: tenantAddons.quantity,
            code: addons.code,
            name: addons.name,
            monthly: addons.monthlyPriceCents,
          })
          .from(tenantAddons)
          .innerJoin(addons, eq(addons.id, tenantAddons.addonId))
          .where(and(eq(tenantAddons.tenantId, tenantId), eq(tenantAddons.status, 'active')));
        for (const r of rows) {
          const monthly = (r.monthly || 0) * (r.quantity || 1);
          // Daily proration for visibility
          const daily = Math.ceil(monthly / 30);
          addonProrationCents += daily;
          addonBreakdown.push({ code: r.code, name: r.name, monthlyCents: monthly, dailyCents: daily });
        }
      }

      const balanceCents = await walletService.getBalanceCents(tenantId);
      const totalCents = sendCents + addonProrationCents;
      // Segments per recipient (for SMS) is useful for the mobile preview
      const segments = channel === 'sms' && message
        ? Math.max(1, Math.ceil(message.length / 160))
        : undefined;
      res.json({
        channel,
        units,
        recipientCount: units,
        effectiveUnits,
        rateMicros,
        sendCents,
        addonProrationCents,
        addons: addonBreakdown,
        // Both names supported for client compatibility
        estimateCents: totalCents,
        totalCents,
        perUnitCents: units > 0 ? Math.ceil(sendCents / units) : 0,
        segments,
        estimateDollars: totalCents / 100,
        balanceCents,
        canAfford: balanceCents >= totalCents,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: err.errors });
      }
      console.error("wallet/estimate error:", err);
      res.status(500).json({ message: "Failed to compute estimate" });
    }
  });

  // Top up — payment-backed only (Stripe PaymentIntent verified) or admin manual.
  app.post('/api/wallet/topup', authenticateUser, requireWalletMode, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const schema = z.object({
        amountCents: z.number().int().min(100).max(1_000_000),
        description: z.string().optional(),
        paymentIntentId: z.string().optional(),
        adminCredit: z.boolean().optional(),
      });
      const data = schema.parse(req.body);

      if (data.paymentIntentId) {
        if (!process.env.STRIPE_SECRET_KEY) {
          return res.status(503).json({ message: "Stripe not configured. Cannot verify payment." });
        }
        let StripeMod: any;
        try { StripeMod = (await import("stripe")).default; }
        catch { return res.status(503).json({ message: "Stripe SDK not installed." }); }
        const client = new StripeMod(process.env.STRIPE_SECRET_KEY);
        let intent: any;
        try {
          intent = await client.paymentIntents.retrieve(data.paymentIntentId, {
            expand: ['payment_method'],
          });
        } catch (e: any) {
          return res.status(400).json({ message: `Could not retrieve payment intent: ${e.message}` });
        }
        if (intent.status !== 'succeeded') {
          return res.status(400).json({ message: `Payment intent not succeeded (status: ${intent.status})` });
        }
        // Strict binding: intent MUST have been created by /api/wallet/topup-request
        // for THIS tenant. Reject any intent missing the wallet metadata or
        // with a different tenantId — prevents reusing intents from other
        // payment flows (e.g. consumer payments) to credit wallet balance.
        if (intent.metadata?.kind !== 'wallet_topup') {
          return res.status(400).json({ message: "Payment intent was not created for wallet top-up." });
        }
        if (!intent.metadata?.tenantId || intent.metadata.tenantId !== tenantId) {
          return res.status(400).json({ message: "Payment intent tenant mismatch." });
        }
        // Exact amount + currency match (no over/under crediting).
        if (Number(intent.amount) !== data.amountCents) {
          return res.status(400).json({
            message: `Payment intent amount (${intent.amount}¢) does not match top-up amount (${data.amountCents}¢).`,
          });
        }
        if ((intent.currency || '').toLowerCase() !== 'usd') {
          return res.status(400).json({ message: `Unsupported currency: ${intent.currency}` });
        }
        // Idempotency: don't double-credit the same intent (scoped by tenant
        // via the credit's tenantId column + intent id in metadata).
        const existing = await db
          .select({ id: sql<string>`id` })
          .from(sql`wallet_ledger`)
          .where(sql`tenant_id = ${tenantId} AND metadata->>'paymentIntentId' = ${data.paymentIntentId}`)
          .limit(1);
        if (existing[0]) {
          const balanceCents = await walletService.getBalanceCents(tenantId);
          return res.json({ alreadyApplied: true, balanceCents });
        }
        const entry = await walletService.credit(
          tenantId,
          data.amountCents,
          'topup',
          data.description ?? `Wallet top-up (Stripe ${data.paymentIntentId})`,
          { paymentIntentId: data.paymentIntentId, by: req.user.id, source: 'stripe' },
        );
        // Persist the payment method so auto-reload can off-session charge.
        // Stripe returns the PM as either a string id or an expanded object.
        try {
          const pm = intent.payment_method;
          const pmId: string | null = typeof pm === 'string' ? pm : pm?.id || null;
          if (pmId) {
            await db
              .update(tenants)
              .set({ walletPaymentMethodToken: pmId })
              .where(eq(tenants.id, tenantId));
            console.log(`[wallet] saved payment method ${pmId} for tenant ${tenantId}`);
          }
        } catch (e) {
          console.error('[wallet] failed to persist payment method on topup', e);
        }
        const balanceCents = await walletService.getBalanceCents(tenantId);
        return res.json({ entry, balanceCents });
      }

      if (data.adminCredit) {
        if (req.user?.role !== 'platform_admin') {
          return res.status(403).json({ message: "Only platform_admin can issue manual wallet credits." });
        }
        const entry = await walletService.credit(
          tenantId,
          data.amountCents,
          'topup',
          data.description ?? `Manual admin credit by ${req.user.id}`,
          { source: 'admin_manual', by: req.user.id },
        );
        const balanceCents = await walletService.getBalanceCents(tenantId);
        return res.json({ entry, balanceCents });
      }

      return res.status(400).json({
        message: "Top-up requires either `paymentIntentId` (verified Stripe) or `adminCredit` (platform_admin).",
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: err.errors });
      }
      console.error("wallet/topup error:", err);
      res.status(500).json({ message: "Failed to top up wallet" });
    }
  });

  // Owner-initiated top-up REQUEST: creates a real Stripe PaymentIntent
  // (when STRIPE_SECRET_KEY is configured) and returns the client_secret.
  // The caller confirms payment in the browser; the wallet is credited via
  // POST /api/wallet/topup with the resulting paymentIntentId.
  app.post('/api/wallet/topup-request', authenticateUser, requireOwner, requireWalletMode, async (req: any, res) => {
    const schema = z.object({ amountCents: z.number().int().min(100).max(1_000_000) });
    try {
      const tenantId = req.user.tenantId;
      const { amountCents } = schema.parse(req.body);
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({
          message: "Payments are not configured on this server. Contact your platform admin to enable Stripe.",
        });
      }
      let StripeMod: any;
      try { StripeMod = (await import("stripe")).default; }
      catch { return res.status(503).json({ message: "Stripe SDK not installed." }); }
      const client = new StripeMod(process.env.STRIPE_SECRET_KEY);
      const intent = await client.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        // Save the card for future off-session charges (auto-reload).
        setup_future_usage: 'off_session',
        metadata: { tenantId, kind: 'wallet_topup', userId: req.user.id || 'unknown' },
        description: `Chain wallet top-up for tenant ${tenantId}`,
      });
      console.log(`[wallet] Top-up intent ${intent.id} created for tenant ${tenantId} (${amountCents}¢)`);
      res.json({
        amountCents,
        paymentIntentId: intent.id,
        clientSecret: intent.client_secret,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: err.errors });
      }
      console.error("wallet/topup-request error:", err);
      res.status(500).json({ message: "Failed to create top-up payment intent" });
    }
  });

  // Auto-reload settings — both GET and POST (and PATCH alias to /settings)
  const fetchAutoReload = async (tenantId: string) => {
    const [t] = await db.select({
      enabled: tenants.walletAutoReloadEnabled,
      thresholdCents: tenants.walletAutoReloadThresholdCents,
      amountCents: tenants.walletAutoReloadAmountCents,
      paymentMethodToken: tenants.walletPaymentMethodToken,
      lowBalanceThresholdCents: tenants.walletLowBalanceThresholdCents,
    }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return {
      enabled: !!t?.enabled,
      thresholdCents: t?.thresholdCents ?? 500,
      amountCents: t?.amountCents ?? 2500,
      hasPaymentMethod: !!t?.paymentMethodToken,
      lowBalanceThresholdCents: t?.lowBalanceThresholdCents ?? 500,
    };
  };

  app.get('/api/wallet/auto-reload', authenticateUser, requireOwner, requireWalletMode, async (req: any, res) => {
    res.json(await fetchAutoReload(req.user.tenantId));
  });

  const updateWalletSettingsHandler: RequestHandler = async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const schema = z.object({
        enabled: z.boolean().optional(),
        autoReloadEnabled: z.boolean().optional(),
        thresholdCents: z.number().int().min(100).max(1_000_000).optional(),
        autoReloadThresholdCents: z.number().int().min(100).max(1_000_000).optional(),
        amountCents: z.number().int().min(100).max(1_000_000).optional(),
        autoReloadAmountCents: z.number().int().min(100).max(1_000_000).optional(),
        paymentMethodToken: z.string().nullable().optional(),
        lowBalanceThresholdCents: z.number().int().min(0).max(1_000_000).optional(),
      });
      const data = schema.parse(req.body);
      const enabled = data.enabled ?? data.autoReloadEnabled;
      const thresholdCents = data.thresholdCents ?? data.autoReloadThresholdCents;
      const amountCents = data.amountCents ?? data.autoReloadAmountCents;
      if (enabled === true && !data.paymentMethodToken) {
        const [t] = await db.select({ token: tenants.walletPaymentMethodToken })
          .from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        if (!t?.token) {
          return res.status(400).json({
            message: "Cannot enable auto-reload without a payment method on file.",
          });
        }
      }
      const update: any = {};
      if (enabled !== undefined) update.walletAutoReloadEnabled = enabled;
      if (thresholdCents !== undefined) update.walletAutoReloadThresholdCents = thresholdCents;
      if (amountCents !== undefined) update.walletAutoReloadAmountCents = amountCents;
      if (data.paymentMethodToken !== undefined) update.walletPaymentMethodToken = data.paymentMethodToken;
      if (data.lowBalanceThresholdCents !== undefined) update.walletLowBalanceThresholdCents = data.lowBalanceThresholdCents;
      if (Object.keys(update).length > 0) {
        await db.update(tenants).set(update).where(eq(tenants.id, tenantId));
      }
      res.json(await fetchAutoReload(tenantId));
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: err.errors });
      }
      console.error("wallet/settings error:", err);
      res.status(500).json({ message: "Failed to update wallet settings" });
    }
  };

  app.post('/api/wallet/auto-reload', authenticateUser, requireOwner, requireWalletMode, updateWalletSettingsHandler);
  app.patch('/api/wallet/settings', authenticateUser, requireOwner, requireWalletMode, updateWalletSettingsHandler);

  // Owner-only billing mode switcher (NOT gated on wallet mode — needed to enter it).
  // Spec calls for POST; we also accept PATCH for backwards-compat with earlier clients.
  const billingModeHandler = async (req: any, res: any) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant access" });
      const schema = z.object({ billingMode: z.enum(['subscription', 'wallet']) });
      const { billingMode } = schema.parse(req.body);
      await db.update(tenants).set({ billingMode }).where(eq(tenants.id, tenantId));
      if (billingMode === 'wallet') {
        await walletService.getOrCreateWallet(tenantId);
      }
      const tenant = await storage.getTenant(tenantId);
      res.json({ billingMode, tenant });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: err.errors });
      }
      console.error("tenant/billing-mode error:", err);
      res.status(500).json({ message: "Failed to update billing mode" });
    }
  };
  app.post('/api/tenant/billing-mode', authenticateUser, requireOwner, billingModeHandler);
  app.patch('/api/tenant/billing-mode', authenticateUser, requireOwner, billingModeHandler);

  // ---- Add-on catalog ----
  app.get('/api/addons', authenticateUser, async (_req, res) => {
    try {
      const catalog = await db.select().from(addons).where(eq(addons.isActive, true));
      res.json({ addons: catalog });
    } catch (err: any) {
      console.error("addons catalog error:", err);
      res.status(500).json({ message: "Failed to fetch add-on catalog" });
    }
  });

  // Platform-admin add-on catalog management
  app.post('/api/admin/addons', authenticateUser, requirePlatformAdmin, async (req: any, res) => {
    try {
      const schema = z.object({
        code: z.string().min(1).max(64),
        name: z.string().min(1).max(128),
        description: z.string().optional(),
        monthlyPriceCents: z.number().int().min(0),
        perUnitPriceCents: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      });
      const data = schema.parse(req.body);
      const [created] = await db.insert(addons).values({
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        monthlyPriceCents: data.monthlyPriceCents,
        perUnitPriceCents: data.perUnitPriceCents ?? 0,
        isActive: data.isActive ?? true,
      }).returning();
      res.status(201).json({ addon: created });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error("admin/addons create error:", err);
      res.status(500).json({ message: "Failed to create add-on" });
    }
  });

  app.patch('/api/admin/addons/:code', authenticateUser, requirePlatformAdmin, async (req: any, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(128).optional(),
        description: z.string().nullable().optional(),
        monthlyPriceCents: z.number().int().min(0).optional(),
        perUnitPriceCents: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      });
      const data = schema.parse(req.body);
      const update: any = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.description !== undefined) update.description = data.description;
      if (data.monthlyPriceCents !== undefined) update.monthlyPriceCents = data.monthlyPriceCents;
      if (data.perUnitPriceCents !== undefined) update.perUnitPriceCents = data.perUnitPriceCents;
      if (data.isActive !== undefined) update.isActive = data.isActive;
      const [updated] = await db.update(addons).set(update).where(eq(addons.code, req.params.code)).returning();
      if (!updated) return res.status(404).json({ message: "Add-on not found" });
      res.json({ addon: updated });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: err.errors });
      console.error("admin/addons update error:", err);
      res.status(500).json({ message: "Failed to update add-on" });
    }
  });

  app.delete('/api/admin/addons/:code', authenticateUser, requirePlatformAdmin, async (req: any, res) => {
    try {
      const [updated] = await db.update(addons).set({ isActive: false }).where(eq(addons.code, req.params.code)).returning();
      if (!updated) return res.status(404).json({ message: "Add-on not found" });
      res.json({ addon: updated, message: "Add-on deactivated (existing tenant subscriptions remain)" });
    } catch (err: any) {
      console.error("admin/addons delete error:", err);
      res.status(500).json({ message: "Failed to delete add-on" });
    }
  });

  // Tenant's activated add-ons — both flat and nested addon shape for UI compatibility
  app.get('/api/tenant/addons', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant access" });
      const rows = await db
        .select({
          id: tenantAddons.id,
          addonId: tenantAddons.addonId,
          status: tenantAddons.status,
          quantity: tenantAddons.quantity,
          activatedAt: tenantAddons.activatedAt,
          cancelledAt: tenantAddons.cancelledAt,
          lastChargedAt: tenantAddons.lastChargedAt,
          nextChargeAt: tenantAddons.nextChargeAt,
          metadata: tenantAddons.metadata,
          addonCode: addons.code,
          addonName: addons.name,
          addonDescription: addons.description,
          addonMonthlyPriceCents: addons.monthlyPriceCents,
          addonPerUnitPriceCents: addons.perUnitPriceCents,
        })
        .from(tenantAddons)
        .innerJoin(addons, eq(addons.id, tenantAddons.addonId))
        .where(eq(tenantAddons.tenantId, tenantId));
      res.json({
        tenantAddons: rows.map((r) => ({
          id: r.id,
          addonId: r.addonId,
          addonCode: r.addonCode,
          status: r.status,
          quantity: r.quantity,
          activatedAt: r.activatedAt,
          cancelledAt: r.cancelledAt,
          lastChargedAt: r.lastChargedAt,
          nextChargeAt: r.nextChargeAt,
          metadata: r.metadata,
          addon: {
            code: r.addonCode,
            name: r.addonName,
            description: r.addonDescription,
            monthlyPriceCents: r.addonMonthlyPriceCents,
            perUnitPriceCents: r.addonPerUnitPriceCents,
          },
        })),
      });
    } catch (err: any) {
      console.error("tenant/addons error:", err);
      res.status(500).json({ message: "Failed to fetch tenant add-ons" });
    }
  });

  // Activate an add-on (owner-only). Includes Twilio dedicated-number provisioning.
  app.post('/api/tenant/addons', authenticateUser, requireOwner, async (req: any, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant access" });
      const schema = z.object({
        addonCode: z.string().min(1),
        quantity: z.number().int().min(1).max(100).optional().default(1),
        areaCode: z.string().optional(),
      });
      const parsed = schema.parse(req.body);
      const result = await activateAddonForTenant(tenantId, parsed);
      if ('errorStatus' in result) return res.status(result.errorStatus).json(result.errorBody);
      return res.status(201).json(result.body);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: err.errors });
      }
      console.error("tenant/addons activate error:", err);
      return res.status(500).json({ message: "Failed to activate add-on" });
    }
  });

  // ---- Spec-compliant alias: enable add-on by id or code ----
  // Calls the same shared service as POST /api/tenant/addons.
  app.post('/api/tenant/addons/:addonId/enable', authenticateUser, requireOwner, async (req: any, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant access" });
      const { addonId } = req.params;
      const schema = z.object({
        quantity: z.number().int().min(1).max(100).optional().default(1),
        areaCode: z.string().optional(),
      });
      const { quantity, areaCode } = schema.parse(req.body || {});
      // Resolve addon by id OR by code so the alias accepts either.
      let [addon] = await db.select().from(addons).where(eq(addons.id, addonId)).limit(1);
      if (!addon) {
        const [byCode] = await db.select().from(addons).where(eq(addons.code, addonId)).limit(1);
        addon = byCode;
      }
      if (!addon || !addon.isActive) {
        return res.status(404).json({ message: "Add-on not found or inactive" });
      }
      const result = await activateAddonForTenant(tenantId, { addonCode: addon.code, quantity, areaCode });
      if ('errorStatus' in result) return res.status(result.errorStatus).json(result.errorBody);
      return res.status(201).json(result.body);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: err.errors });
      }
      console.error("tenant/addons enable error:", err);
      res.status(500).json({ message: "Failed to enable add-on" });
    }
  });

  // Disable (cancel) an add-on for the current tenant by addon id or code.
  app.post('/api/tenant/addons/:addonId/disable', authenticateUser, requireOwner, async (req: any, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant access" });
      const { addonId } = req.params;
      // Look up the tenant_addons row by addon id OR addon code.
      const [byId] = await db
        .select({ taId: tenantAddons.id, code: addons.code, metadata: tenantAddons.metadata })
        .from(tenantAddons)
        .innerJoin(addons, eq(addons.id, tenantAddons.addonId))
        .where(and(eq(tenantAddons.tenantId, tenantId), eq(addons.id, addonId)))
        .limit(1);
      const [byCode] = byId ? [byId] : await db
        .select({ taId: tenantAddons.id, code: addons.code, metadata: tenantAddons.metadata })
        .from(tenantAddons)
        .innerJoin(addons, eq(addons.id, tenantAddons.addonId))
        .where(and(eq(tenantAddons.tenantId, tenantId), eq(addons.code, addonId)))
        .limit(1);
      const target = byId || byCode;
      if (!target) return res.status(404).json({ message: "Add-on not active for this tenant" });

      if (target.code === 'dedicated_number') {
        const dedicated = (target.metadata as any)?.dedicatedNumber;
        if (dedicated?.twilioSid) {
          try {
            const { releasePhoneNumber } = await import('./twilioVoiceService');
            await releasePhoneNumber(dedicated.twilioSid);
            try {
              await db.update(voipPhoneNumbers)
                .set({ isActive: false, isPrimary: false } as any)
                .where(and(eq(voipPhoneNumbers.tenantId, tenantId), eq(voipPhoneNumbers.twilioPhoneSid, dedicated.twilioSid)));
            } catch {}
          } catch (e) {
            console.error('[addons] failed to release dedicated_number on disable', e);
          }
        }
        try {
          await db.update(tenants)
            .set({ twilioPhoneNumber: dedicated?.previousTwilioPhoneNumber ?? null } as any)
            .where(eq(tenants.id, tenantId));
        } catch (e) {
          console.error('[addons] failed to restore tenant caller-id on disable', e);
        }
      }

      const [updated] = await db
        .update(tenantAddons)
        .set({ status: 'cancelled', cancelledAt: new Date(), nextChargeAt: null })
        .where(eq(tenantAddons.id, target.taId))
        .returning();
      res.json({ tenantAddon: updated });
    } catch (err: any) {
      console.error("tenant/addons disable error:", err);
      res.status(500).json({ message: "Failed to disable add-on" });
    }
  });

  // Cancel an add-on (legacy path retained for backwards compatibility)
  app.delete('/api/tenant/addons/:id', authenticateUser, requireOwner, async (req: any, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant access" });
      const { id } = req.params;
      const [target] = await db
        .select({
          id: tenantAddons.id,
          addonId: tenantAddons.addonId,
          metadata: tenantAddons.metadata,
          code: addons.code,
        })
        .from(tenantAddons)
        .innerJoin(addons, eq(addons.id, tenantAddons.addonId))
        .where(and(eq(tenantAddons.id, id), eq(tenantAddons.tenantId, tenantId)))
        .limit(1);
      if (!target) return res.status(404).json({ message: "Add-on not found" });

      // Lifecycle: release the dedicated number if any and restore prior caller-id
      if (target.code === 'dedicated_number') {
        const dedicated = (target.metadata as any)?.dedicatedNumber;
        if (dedicated?.twilioSid) {
          try {
            const { releasePhoneNumber } = await import('./twilioVoiceService');
            await releasePhoneNumber(dedicated.twilioSid);
            console.log(`[addons] dedicated_number released for tenant ${tenantId}: ${dedicated.phoneNumber}`);
            try {
              await db.update(voipPhoneNumbers)
                .set({ isActive: false, isPrimary: false } as any)
                .where(and(eq(voipPhoneNumbers.tenantId, tenantId), eq(voipPhoneNumbers.twilioPhoneSid, dedicated.twilioSid)));
            } catch {}
          } catch (e) {
            console.error('[addons] failed to release dedicated_number', e);
          }
        }
        // Restore the previous outbound caller-id (or clear it) so future
        // sends fall back to the shared pool number.
        try {
          await db.update(tenants)
            .set({ twilioPhoneNumber: dedicated?.previousTwilioPhoneNumber ?? null } as any)
            .where(eq(tenants.id, tenantId));
        } catch (e) {
          console.error('[addons] failed to restore tenant outbound caller-id', e);
        }
      }

      const [updated] = await db
        .update(tenantAddons)
        .set({ status: 'cancelled', cancelledAt: new Date(), nextChargeAt: null })
        .where(eq(tenantAddons.id, id))
        .returning();
      res.json({ tenantAddon: updated });
    } catch (err: any) {
      console.error("tenant/addons cancel error:", err);
      res.status(500).json({ message: "Failed to cancel add-on" });
    }
  });
}

/**
 * Daily cron: charge monthly add-on fees that have come due. Wallet tenants
 * are debited; subscription tenants get an invoice line item appended (or
 * a new à la carte invoice created for the period). Idempotent on
 * `next_charge_at`.
 */
/**
 * Shared add-on activation logic — invoked by both POST /api/tenant/addons
 * and POST /api/tenant/addons/:addonId/enable. Charges wallet (or skips
 * for subscription tenants), provisions Twilio dedicated numbers, and
 * upserts the tenant_addons row. Idempotent re-activation is supported.
 */
type ActivateAddonInput = { addonCode: string; quantity?: number; areaCode?: string };
type ActivateAddonResult =
  | { body: { tenantAddon: any; addon: any; walletCharge: any } }
  | { errorStatus: number; errorBody: { message: string; [k: string]: any } };

export async function activateAddonForTenant(
  tenantId: string,
  input: ActivateAddonInput,
): Promise<ActivateAddonResult> {
  const quantity = input.quantity ?? 1;
  const areaCode = input.areaCode;
  const [addon] = await db.select().from(addons).where(eq(addons.code, input.addonCode)).limit(1);
  if (!addon || !addon.isActive) {
    return { errorStatus: 404, errorBody: { message: "Add-on not found or inactive" } };
  }
  const existing = await db
    .select()
    .from(tenantAddons)
    .where(and(eq(tenantAddons.tenantId, tenantId), eq(tenantAddons.addonId, addon.id)))
    .limit(1);

  const walletMode = await walletService.isWalletMode(tenantId);
  const chargeCents = (addon.monthlyPriceCents || 0) * quantity;
  const now = new Date();
  // Next renewal lands on the 1st of next month (matches monthly cron).
  const nextCharge = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));

  // ---- Lifecycle: dedicated_number must be provisioned BEFORE we charge ----
  // For dedicated_number, Twilio provisioning is an irreversible cost that the
  // tenant is paying for. We refuse to activate (and refuse to charge) if we
  // cannot actually allocate them a working number — otherwise the tenant
  // would be billed for a non-functional add-on.
  let provisionedMeta: any = (existing[0]?.metadata as any) || {};
  let provisionedPhone: { phoneNumber: string; sid: string } | null = null;
  if (addon.code === 'dedicated_number') {
    try {
      const { provisionPhoneNumber, searchAvailableLocalNumbers } = await import('./twilioVoiceService');
      let phoneNumber: string | null = null;
      try {
        const candidates = await searchAvailableLocalNumbers(areaCode || '');
        if (Array.isArray(candidates) && candidates.length > 0) {
          phoneNumber = candidates[0].phoneNumber;
        }
      } catch (e) {
        console.error('[addons] dedicated_number search failed', e);
      }
      if (!phoneNumber) {
        return {
          errorStatus: 503,
          errorBody: {
            message: areaCode
              ? `No available phone numbers found in area code ${areaCode}. Try a different area code.`
              : 'No available phone numbers found. Try again later or specify an area code.',
          },
        };
      }
      const provisioned = await provisionPhoneNumber(phoneNumber, `Chain SMS - ${tenantId.slice(0, 8)}`);
      if (!provisioned) {
        return {
          errorStatus: 502,
          errorBody: { message: 'Failed to provision dedicated number with Twilio. Please try again.' },
        };
      }
      provisionedPhone = { phoneNumber: provisioned.phoneNumber, sid: provisioned.sid };
    } catch (e: any) {
      console.error('[addons] dedicated_number provisioning error (Twilio not configured?)', e);
      return {
        errorStatus: 503,
        errorBody: { message: 'Phone number provisioning is unavailable. Please contact support.' },
      };
    }
  }

  // Now that any required external provisioning has succeeded, charge the wallet.
  let chargeEntry: any = null;
  if (walletMode && chargeCents > 0) {
    try {
      chargeEntry = await walletService.debit(
        tenantId,
        chargeCents,
        'addon_charge',
        `Add-on activation: ${addon.name} (x${quantity})`,
        { addonCode: addon.code, addonId: addon.id, quantity, period: 'first_month' },
      );
    } catch (e: any) {
      // Rollback Twilio provisioning if we can't pay for it.
      if (provisionedPhone) {
        try {
          const { releasePhoneNumber } = await import('./twilioVoiceService');
          await releasePhoneNumber(provisionedPhone.sid);
        } catch (releaseErr) {
          console.error('[addons] failed to release Twilio number after charge failure', releaseErr);
        }
      }
      if (e instanceof InsufficientFundsError) {
        return {
          errorStatus: 402,
          errorBody: {
            message: "Insufficient wallet balance to activate add-on",
            neededCents: e.neededCents,
            availableCents: e.availableCents,
          },
        };
      }
      throw e;
    }
  }

  // Persist the dedicated-number side-effects only after the charge is locked in.
  if (provisionedPhone) {
    const [prevTenant] = await db
      .select({ prev: tenants.twilioPhoneNumber })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    provisionedMeta = {
      ...provisionedMeta,
      dedicatedNumber: {
        phoneNumber: provisionedPhone.phoneNumber,
        twilioSid: provisionedPhone.sid,
        provisionedAt: now.toISOString(),
        previousTwilioPhoneNumber: prevTenant?.prev ?? null,
      },
    };
    try {
      await db.insert(voipPhoneNumbers).values({
        tenantId,
        phoneNumber: provisionedPhone.phoneNumber,
        twilioPhoneSid: provisionedPhone.sid,
        isActive: true,
        isPrimary: true,
        numberType: 'local',
      } as any);
    } catch (e) {
      console.error('[addons] failed to record dedicated_number in voip_phone_numbers', e);
    }
    try {
      await db.update(tenants)
        .set({ twilioPhoneNumber: provisionedPhone.phoneNumber } as any)
        .where(eq(tenants.id, tenantId));
    } catch (e) {
      console.error('[addons] failed to set tenant outbound caller-id', e);
    }
    console.log(`[addons] dedicated_number provisioned for tenant ${tenantId}: ${provisionedPhone.phoneNumber}`);
  }

  let row;
  if (existing[0]) {
    const [updated] = await db
      .update(tenantAddons)
      .set({
        status: 'active',
        quantity,
        cancelledAt: null,
        lastChargedAt: walletMode && chargeCents > 0 ? now : existing[0].lastChargedAt,
        nextChargeAt: chargeCents > 0 ? nextCharge : existing[0].nextChargeAt,
        metadata: provisionedMeta,
      })
      .where(eq(tenantAddons.id, existing[0].id))
      .returning();
    row = updated;
  } else {
    const [created] = await db
      .insert(tenantAddons)
      .values({
        tenantId,
        addonId: addon.id,
        status: 'active',
        quantity,
        lastChargedAt: walletMode && chargeCents > 0 ? now : null,
        nextChargeAt: chargeCents > 0 ? nextCharge : null,
        metadata: provisionedMeta,
      })
      .returning();
    row = created;
  }
  return { body: { tenantAddon: row, addon, walletCharge: chargeEntry } };
}

export async function runAddonRenewalCron(): Promise<{ charged: number; invoiced: number; skipped: number; failed: number }>{
  const now = new Date();
  const stats = { charged: 0, invoiced: 0, skipped: 0, failed: 0 };
  const due = await db
    .select({
      id: tenantAddons.id,
      tenantId: tenantAddons.tenantId,
      addonId: tenantAddons.addonId,
      quantity: tenantAddons.quantity,
      nextChargeAt: tenantAddons.nextChargeAt,
      addonCode: addons.code,
      addonName: addons.name,
      addonMonthlyPriceCents: addons.monthlyPriceCents,
    })
    .from(tenantAddons)
    .innerJoin(addons, eq(addons.id, tenantAddons.addonId))
    .where(eq(tenantAddons.status, 'active'));

  for (const row of due) {
    if (!row.nextChargeAt || row.nextChargeAt > now) { stats.skipped++; continue; }
    const cost = (row.addonMonthlyPriceCents || 0) * (row.quantity || 1);
    if (cost <= 0) { stats.skipped++; continue; }
    const isWallet = await walletService.isWalletMode(row.tenantId);
    try {
      if (isWallet) {
        await walletService.debit(
          row.tenantId,
          cost,
          'addon_charge',
          `Add-on monthly renewal: ${row.addonName}`,
          { addonId: row.addonId, addonCode: row.addonCode, quantity: row.quantity, period: 'renewal' },
        );
        stats.charged++;
      } else {
        // Subscription tenant: append a line item to a fresh à la carte invoice
        const periodStart = now;
        const periodEnd = new Date(now); periodEnd.setDate(periodEnd.getDate() + 30);
        const lineItem = {
          description: `Add-on: ${row.addonName} (x${row.quantity || 1})`,
          amountCents: cost,
          quantity: row.quantity || 1,
          unitLabel: 'month',
        };
        const invoiceNumber = `INV-ADDON-${row.tenantId.slice(0, 8)}-${Date.now()}`;
        const dueDate = new Date(periodEnd);
        try {
          await db.insert(invoices).values({
            tenantId: row.tenantId,
            subscriptionId: null,
            invoiceNumber,
            periodStart,
            periodEnd,
            baseAmountCents: 0,
            perConsumerCents: 0,
            consumerCount: 0,
            totalAmountCents: cost,
            dueDate,
            status: 'pending',
            lineItems: [lineItem],
          } as any);
          stats.invoiced++;
        } catch (e: any) {
          // Likely a unique-constraint collision for the period — append to most recent invoice for tenant
          const [existing] = await db
            .select({ id: invoices.id, lineItems: invoices.lineItems, totalAmountCents: invoices.totalAmountCents })
            .from(invoices)
            .where(eq(invoices.tenantId, row.tenantId))
            .orderBy(desc(invoices.createdAt))
            .limit(1);
          if (existing) {
            const prev = (existing.lineItems as any[]) || [];
            await db.update(invoices)
              .set({
                lineItems: [...prev, lineItem],
                totalAmountCents: (existing.totalAmountCents || 0) + cost,
              } as any)
              .where(eq(invoices.id, existing.id));
            stats.invoiced++;
          } else {
            throw e;
          }
        }
      }
      // Schedule next charge for the 1st of next month (UTC midnight) so
      // monthly renewals always land on the same day regardless of when the
      // add-on was first activated.
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
      await db
        .update(tenantAddons)
        .set({ lastChargedAt: now, nextChargeAt: next })
        .where(eq(tenantAddons.id, row.id));
    } catch (e: any) {
      console.error(`[addons cron] failed addon ${row.id} (tenant ${row.tenantId}): ${e.message}`);
      stats.failed++;
    }
  }
  return stats;
}
