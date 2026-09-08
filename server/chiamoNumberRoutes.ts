import type { Express, RequestHandler } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { authenticateUser, requireOwner } from "./authMiddleware";
import { db } from "./db";
import { desc, eq, sql } from "drizzle-orm";
import { voipPhoneNumbers } from "@shared/schema";
import { getChiamoNumberReadiness, liveChiamoNumberProvider, persistChiamoNumberPurchase, reconcileOrPurchaseChiamoNumber, type ChiamoNumberProvider } from "./chiamoNumberService";

export const chiamoNumberSearchInput = z.object({ type: z.enum(["local", "toll_free"]), areaCode: z.string().regex(/^\d{3}$/).optional() });
export const chiamoNumberPurchaseInput = z.object({ phoneNumber: z.string().regex(/^\+1\d{10}$/), numberType: z.enum(["local", "toll_free"]), idempotencyKey: z.string().uuid(), confirmed: z.literal(true) });
const route = (fn: any) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
function sendError(res: any, error: any) { return res.status(error?.status || 500).json({ code: error?.code || "NUMBER_REQUEST_FAILED", message: error?.message || "Number request failed. Please try again." }); }

export function decideChiamoNumberClaim(existing: any, idempotencyKey: string, phoneNumber: string, now = Date.now()) {
  if (!existing) return "CREATE" as const;
  if (existing.idempotency_key === idempotencyKey && existing.phone_number !== phoneNumber) return "CONFLICT" as const;
  if (existing.status === "COMPLETED") return "REPLAY" as const;
  if (existing.status === "UNKNOWN" && new Date(existing.updated_at).getTime() > now - 30 * 60 * 1000) return "PENDING" as const;
  if (existing.status === "CLAIMED" && new Date(existing.updated_at).getTime() > now - 10 * 60 * 1000) return "PENDING" as const;
  return "RECLAIM" as const;
}

export type ChiamoNumberRouteTestOverrides = {
  authenticate?: RequestHandler;
  loadInventory?: (tenantId: string) => Promise<{ numbers: any[]; readiness: any }>;
};

export function registerChiamoNumberRoutes(app: Express, provider: ChiamoNumberProvider = liveChiamoNumberProvider, overrides: ChiamoNumberRouteTestOverrides = {}) {
  const auth = overrides.authenticate || authenticateUser;
  app.get("/api/chiamo/numbers", auth, requireOwner, route(async (req: any, res: any) => {
    const loaded = overrides.loadInventory ? await overrides.loadInventory(req.user.tenantId) : {
      readiness: await getChiamoNumberReadiness(req.user.tenantId),
      numbers: await db.select().from(voipPhoneNumbers).where(eq(voipPhoneNumbers.tenantId, req.user.tenantId)).orderBy(desc(voipPhoneNumbers.createdAt)),
    };
    res.json(loaded);
  }));
  app.get("/api/chiamo/numbers/search", auth, requireOwner, route(async (req: any, res: any) => {
    const parsed = chiamoNumberSearchInput.safeParse(req.query); if (!parsed.success || (parsed.data.type === "local" && !parsed.data.areaCode)) return res.status(400).json({ message: "Select toll-free or enter a three-digit local area code." });
    const readiness = await getChiamoNumberReadiness(req.user.tenantId);
    if (!readiness.allowed) return res.status(409).json({ code: "NUMBER_PURCHASE_NOT_READY", message: readiness.reason, readiness });
    const numbers = parsed.data.type === "local" ? await provider.searchLocal(req.user.tenantId, parsed.data.areaCode!, 10) : await provider.searchTollFree(req.user.tenantId, 10);
    res.json({ numbers: numbers.filter(number => number.capabilities.voice).map(number => ({ ...number, capabilities: { voice: true, sms: false, mms: false } })), readiness });
  }));
  app.post("/api/chiamo/numbers/purchase", auth, requireOwner, route(async (req: any, res: any) => {
    const parsed = chiamoNumberPurchaseInput.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: "A confirmed valid number selection and idempotency key are required." });
    const { phoneNumber, numberType, idempotencyKey } = parsed.data, tenantId = req.user.tenantId;
    let claim: any;
    try {
      const claimed = await db.transaction(async tx => {
        const readiness = await getChiamoNumberReadiness(tenantId, tx);
        if (!readiness.allowed) throw Object.assign(new Error(readiness.reason), { status: 409, code: "NUMBER_PURCHASE_NOT_READY" });
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`chiamo-number:${tenantId}:${phoneNumber}`}))`);
        const rows = await tx.execute(sql`select * from chiamo_number_purchase_claims where tenant_id = ${tenantId} and (idempotency_key = ${idempotencyKey} or phone_number = ${phoneNumber}) order by (idempotency_key = ${idempotencyKey}) desc limit 1 for update`);
        const existing: any = rows.rows[0];
        const decision = decideChiamoNumberClaim(existing, idempotencyKey, phoneNumber);
        if (decision === "REPLAY") return { claim: existing, acquired: false };
        if (decision === "CONFLICT") throw Object.assign(new Error("This purchase key belongs to a different number."), { status: 409 });
        // A second tab must not make a second provider create. A stale worker can
        // be reclaimed after ten minutes; the provider reconciliation below then
        // discovers a number created just before a worker crash.
        if (decision === "PENDING") return { claim: existing, acquired: false };
        const claimToken = crypto.randomUUID();
        if (existing) {
          const reclaimed = await tx.execute(sql`update chiamo_number_purchase_claims set status = 'CLAIMED', claim_token = ${claimToken}, error_message = null, updated_at = now() where id = ${existing.id} returning *`);
          return { claim: reclaimed.rows[0] as any, acquired: true };
        }
        const inserted = await tx.execute(sql`insert into chiamo_number_purchase_claims (tenant_id, idempotency_key, phone_number, number_type, claim_token) values (${tenantId}, ${idempotencyKey}, ${phoneNumber}, ${numberType}, ${claimToken}) returning *`);
        return { claim: inserted.rows[0] as any, acquired: true };
      });
      claim = claimed.claim;
      if (claim.status === "COMPLETED" && claim.result_number_id) {
        const [number] = await db.select().from(voipPhoneNumbers).where(eq(voipPhoneNumbers.id, claim.result_number_id)).limit(1);
        if (number) return res.json({ number, replayed: true });
      }
      if (!claimed.acquired) return res.status(202).json({ message: "This number purchase is already being processed. Refresh inventory shortly.", pending: true });
      // The only bounded provider work is outside the transaction. An owned number
      // is reconciled before create, making a timeout/retry safe.
      const providerNumber = await reconcileOrPurchaseChiamoNumber(provider, tenantId, phoneNumber, async () => {
        const current = await getChiamoNumberReadiness(tenantId);
        if (!current.allowed) throw Object.assign(new Error(current.reason), { status: 409, code: "NUMBER_PURCHASE_NOT_READY" });
        const fence = await db.execute(sql`select 1 from chiamo_number_purchase_claims where id = ${claim.id} and claim_token = ${claim.claim_token} and status = 'CLAIMED'`);
        if (!fence.rows.length) throw Object.assign(new Error("This purchase attempt was superseded."), { status: 409, code: "NUMBER_PURCHASE_CLAIM_LOST" });
      });
      const number = await persistChiamoNumberPurchase(tenantId, claim.id, claim.claim_token, providerNumber);
      res.status(201).json({ number });
    } catch (error: any) {
      if (claim?.id) await db.execute(sql`update chiamo_number_purchase_claims set status = ${error?.ambiguous ? "UNKNOWN" : "FAILED"}, error_message = ${error?.code || "NUMBER_REQUEST_FAILED"}, updated_at = now() where id = ${claim.id} and claim_token = ${claim.claim_token} and status <> 'COMPLETED'`);
      sendError(res, error);
    }
  }));
}