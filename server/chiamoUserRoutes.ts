import type { Express, RequestHandler } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { authenticateUser } from "./authMiddleware";
import { agencyCredentials, chiamoAdminReauthAttempts, tenants } from "@shared/schema";
import { chiamoSubscriptions } from "@shared/chiamo-schema";
import { calculateChiamoVoipMonthlyService } from "@shared/chiamo";
import { canActivateUser } from "@shared/enterpriseCapacity";
import { validateAgencyPassword } from "./chiamoCredentialAuth";

const userRoles = ["manager", "agent", "viewer", "uploader"] as const;
const uuid = z.string().uuid();
const createInput = z.object({
  username: z.string().trim().min(3).max(50),
  email: z.preprocess(value => typeof value === "string" && value.trim() === "" ? null : value, z.string().trim().email().max(254).nullable().optional()),
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  role: z.enum(userRoles).default("agent"),
  voipAccess: z.boolean().default(true),
  password: z.string(),
  passwordConfirmation: z.string(),
  ownerPassword: z.string().min(1),
  confirmSeatPriceImpact: z.literal(true).optional(),
}).superRefine((value, context) => {
  if (value.password !== value.passwordConfirmation) context.addIssue({ code: z.ZodIssueCode.custom, path: ["passwordConfirmation"], message: "Passwords do not match" });
  const error = validateAgencyPassword(value.password);
  if (error) context.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: error });
});
const updateInput = z.object({
  email: z.preprocess(value => typeof value === "string" && value.trim() === "" ? null : value, z.string().trim().email().max(254).nullable().optional()),
  firstName: z.string().trim().max(100).nullable().optional(),
  lastName: z.string().trim().max(100).nullable().optional(),
  role: z.enum(userRoles).optional(),
  voipAccess: z.boolean().optional(),
  isActive: z.boolean().optional(),
  confirmSeatPriceImpact: z.literal(true).optional(),
});
const passwordInput = z.object({
  password: z.string(),
  passwordConfirmation: z.string(),
  ownerPassword: z.string().min(1),
}).superRefine((value, context) => {
  if (value.password !== value.passwordConfirmation) context.addIssue({ code: z.ZodIssueCode.custom, path: ["passwordConfirmation"], message: "Passwords do not match" });
  const error = validateAgencyPassword(value.password);
  if (error) context.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: error });
});

export type ChiamoUserRoutesDependencies = {
  database?: any;
  authenticate?: RequestHandler;
  now?: () => Date;
  reauthLimiter?: ChiamoUserReauthLimiterContract;
};

export interface ChiamoUserReauthLimiterContract {
  attempt(key:string, now:Date): Promise<{allowed:boolean;retryAfter:number}> | {allowed:boolean;retryAfter:number};
  clear(key:string): Promise<void> | void;
}

export class ChiamoUserReauthLimiter implements ChiamoUserReauthLimiterContract {
  private attempts = new Map<string, { failures: number; resetAt: number }>();
  constructor(private readonly maxFailures = 5, private readonly windowMs = 15 * 60 * 1000) {}
  attempt(key: string, now: Date) {
    const value = this.attempts.get(key);
    const next=!value || value.resetAt <= now.getTime()
      ? { failures: 1, resetAt: now.getTime() + this.windowMs }
      : { ...value, failures: value.failures + 1 };
    this.attempts.set(key,next);
    return { allowed: next.failures <= this.maxFailures, retryAfter: Math.max(1, Math.ceil((next.resetAt - now.getTime()) / 1000)) };
  }
  clear(key: string) { this.attempts.delete(key); }
}

class DatabaseChiamoUserReauthLimiter implements ChiamoUserReauthLimiterContract {
  constructor(private readonly database:any, private readonly maxFailures=5, private readonly windowMs=15*60*1000) {}
  async attempt(key:string, now:Date) {
    const hash=crypto.createHash("sha256").update(`chiamo-owner-user-issuance:${key}`).digest("hex");
    const resetAt=new Date(now.getTime()+this.windowMs);
    const result=await this.database.execute(sql`
      INSERT INTO chiamo_admin_reauth_attempts (client_key_hash, failures, reset_at, updated_at)
      VALUES (${hash}, 1, ${resetAt}, ${now})
      ON CONFLICT (client_key_hash) DO UPDATE SET
        failures = CASE WHEN ${chiamoAdminReauthAttempts.resetAt} <= ${now} THEN 1 ELSE ${chiamoAdminReauthAttempts.failures} + 1 END,
        reset_at = CASE WHEN ${chiamoAdminReauthAttempts.resetAt} <= ${now} THEN ${resetAt} ELSE ${chiamoAdminReauthAttempts.resetAt} END,
        updated_at = ${now}
      RETURNING failures, reset_at
    `);
    const row=result.rows[0] as {failures:number;reset_at:Date};
    return {allowed:Number(row.failures)<=this.maxFailures,retryAfter:Math.max(1,Math.ceil((new Date(row.reset_at).getTime()-now.getTime())/1000))};
  }
  async clear(key:string) {
    const hash=crypto.createHash("sha256").update(`chiamo-owner-user-issuance:${key}`).digest("hex");
    await this.database.delete(chiamoAdminReauthAttempts).where(eq(chiamoAdminReauthAttempts.clientKeyHash,hash));
  }
}

function noStore(res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function safeMember(member: any) {
  return {
    id: member.id, username: member.username, email: member.email,
    firstName: member.firstName, lastName: member.lastName, role: member.role,
    isActive: member.isActive !== false, voipAccess: member.voipAccess === true,
    mustChangePassword: member.mustChangePassword === true,
    temporaryPasswordExpiresAt: member.temporaryPasswordExpiresAt,
    createdAt: member.createdAt, updatedAt: member.updatedAt, lastLoginAt: member.lastLoginAt,
  };
}

function normalized(value: string) {
  return value.trim().toLowerCase();
}

export function chiamoUserPriceImpact(subscription: any, activeUsers: number) {
  const calculation = subscription
    ? calculateChiamoVoipMonthlyService(subscription.planId, activeUsers, subscription)
    : null;
  return {
    activeUsers,
    includedUsers: calculation?.includedUsers ?? null,
    monthlyAdditionalUserChargeCents: calculation?.additionalUserChargeCents ?? null,
    monthlyTotalCents: calculation?.totalCents ?? null,
  };
}

export function chiamoUserManagementAllowed(user: any) {
  return Boolean(user?.tenantId) && user?.role === "owner" && user?.product === "chiamo";
}

export function chiamoUserSeatImpactRequiresConfirmation(before: { monthlyAdditionalUserChargeCents: number | null }, after: { monthlyAdditionalUserChargeCents: number | null }) {
  return before.monthlyAdditionalUserChargeCents !== after.monthlyAdditionalUserChargeCents;
}

function route(handler: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid user details", issues: error.flatten().fieldErrors });
      // Do not echo database constraint details, which may include user input.
      if (!res.headersSent) return res.status(500).json({ message: "Unable to manage Chiamo users" });
    }
  };
}

/**
 * Customer-only Chiamo user administration.  This intentionally does not share
 * the legacy /api/team-members routes: all target queries are tenant-scoped and
 * its transaction locks the tenant row before checking capacity or billing.
 */
export function registerChiamoUserRoutes(app: Express, dependencies: ChiamoUserRoutesDependencies = {}) {
  const database = dependencies.database || db;
  const authenticate = dependencies.authenticate || authenticateUser;
  const now = dependencies.now || (() => new Date());
  const reauthLimiter = dependencies.reauthLimiter || new DatabaseChiamoUserReauthLimiter(database);

  const requireOwner = (req: any, res: any) => {
    if (!req.user?.tenantId) { res.status(403).json({ message: "No tenant access" }); return false; }
    if (!chiamoUserManagementAllowed(req.user)) {
      res.status(403).json({ message: "Only Chiamo account owners can manage users" }); return false;
    }
    return true;
  };
  const tenantForUpdate = async (tx: any, tenantId: string) => {
    const [tenant] = await tx.select({
      id: tenants.id, isActive: tenants.isActive, chiamoConnectEnabled: tenants.chiamoConnectEnabled, chainCoreEnabled: tenants.chainCoreEnabled,
      maxActiveUsers: tenants.maxActiveUsers, businessType: tenants.businessType,
    }).from(tenants).where(eq(tenants.id, tenantId)).limit(1).for("update");
    return tenant;
  };
  const requireChiamoTenant = (tenant: any) => tenant?.isActive === true && tenant?.chiamoConnectEnabled === true && tenant?.chainCoreEnabled === false;
  const actorForUpdate = async (tx: any, req: any, tenantId: string) => {
    const [actor] = await tx.select().from(agencyCredentials).where(and(
      eq(agencyCredentials.id, req.user.id),
      eq(agencyCredentials.tenantId, tenantId),
      eq(agencyCredentials.role, "owner"),
      eq(agencyCredentials.isActive, true),
      eq(agencyCredentials.credentialVersion, req.user.credentialVersion),
    )).limit(1).for("update");
    return actor;
  };

  app.get("/api/chiamo/team-members", authenticate, route(async (req, res) => {
    noStore(res);
    if (!requireOwner(req, res)) return;
    const [tenantRows, members, subscription] = await Promise.all([
      database.select({ id: tenants.id, isActive: tenants.isActive, chiamoConnectEnabled: tenants.chiamoConnectEnabled, chainCoreEnabled: tenants.chainCoreEnabled, maxActiveUsers: tenants.maxActiveUsers, businessType: tenants.businessType }).from(tenants).where(eq(tenants.id, req.user.tenantId)).limit(1),
      database.select().from(agencyCredentials).where(eq(agencyCredentials.tenantId, req.user.tenantId)).orderBy(asc(agencyCredentials.createdAt)),
      database.select().from(chiamoSubscriptions).where(eq(chiamoSubscriptions.tenantId, req.user.tenantId)).limit(1),
    ]);
    const tenant = tenantRows[0];
    if (!requireChiamoTenant(tenant)) return res.status(404).json({ message: "Chiamo customer not found" });
    const seat = canActivateUser(members, tenant.maxActiveUsers, tenant.businessType);
    return res.json({
      members: members.map(safeMember),
      permissions: { canManageUsers: true },
      seats: {
        ...seat,
        ...chiamoUserPriceImpact(subscription[0], seat.activeUsers),
        nextSeat: seat.allowed ? chiamoUserPriceImpact(subscription[0], seat.activeUsers + 1) : null,
      },
    });
  }));

  app.post("/api/chiamo/team-members", authenticate, route(async (req, res) => {
    noStore(res);
    if (!requireOwner(req, res)) return;
    const input = createInput.parse(req.body);
    const reauthKey = `${req.user.tenantId}:${req.user.id}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    const admission = await reauthLimiter.attempt(reauthKey, now());
    if (!admission.allowed) {
      res.setHeader("Retry-After", String(admission.retryAfter));
      return res.status(429).json({ message: "Too many owner password attempts. Please try again later." });
    }
    const created = await database.transaction(async (tx: any) => {
      const tenant = await tenantForUpdate(tx, req.user.tenantId);
      if (!requireChiamoTenant(tenant)) return { status: 404, body: { message: "Chiamo customer not found" } };
       const actor = await actorForUpdate(tx, req, tenant.id);
      if (!actor || !(await bcrypt.compare(input.ownerPassword, actor.passwordHash).catch(() => false))) return { status: 401, body: { message: "Owner password verification failed" } };
      await reauthLimiter.clear(reauthKey);
      const members = await tx.select().from(agencyCredentials).where(eq(agencyCredentials.tenantId, tenant.id)).for("update");
      const seat = canActivateUser(members, tenant.maxActiveUsers, tenant.businessType);
      if (!seat.allowed) return { status: 409, body: { message: `Active user limit reached (${seat.activeUsers}/${seat.maxActiveUsers})`, code: "ACTIVE_USER_LIMIT_REACHED", seats: seat } };
      const [subscription] = await tx.select().from(chiamoSubscriptions).where(eq(chiamoSubscriptions.tenantId, tenant.id)).limit(1);
      if (!subscription || subscription.billingStatus !== "ACTIVE") return { status: 409, body: { message: "An active Chiamo subscription is required before adding users", code: "ACTIVE_SUBSCRIPTION_REQUIRED" } };
      const before = chiamoUserPriceImpact(subscription, seat.activeUsers);
      const after = chiamoUserPriceImpact(subscription, seat.activeUsers + 1);
      if (chiamoUserSeatImpactRequiresConfirmation(before, after) && input.confirmSeatPriceImpact !== true) {
        return { status: 409, body: { message: "Confirm the displayed seat and monthly price impact before adding this user", code: "SEAT_PRICE_CONFIRMATION_REQUIRED", before, after } };
      }
       const normalizedEmail = input.email ? normalized(input.email) : null;
       const duplicate = await tx.select({ id: agencyCredentials.id }).from(agencyCredentials)
         .where(normalizedEmail
           ? sql`lower(trim(${agencyCredentials.username})) = ${normalized(input.username)} OR lower(trim(${agencyCredentials.email})) = ${normalizedEmail}`
           : sql`lower(trim(${agencyCredentials.username})) = ${normalized(input.username)}`).limit(1).for("update");
      if (duplicate[0]) return { status: 409, body: { message: "That username or email is already in use", code: "DUPLICATE_CREDENTIAL" } };
      const [member] = await tx.insert(agencyCredentials).values({
         tenantId: tenant.id, username: normalized(input.username), email: normalizedEmail,
        firstName: input.firstName || null, lastName: input.lastName || null, role: input.role,
        voipAccess: input.voipAccess, isActive: true, restrictedServices: ["billing"],
         passwordHash: await bcrypt.hash(input.password, 12), mustChangePassword: false,
         temporaryPasswordExpiresAt: null, credentialVersion: 1, updatedAt: now(),
      }).returning();
       return { status: 201, body: { member: safeMember(member), seats: { ...seat, ...chiamoUserPriceImpact(subscription, seat.activeUsers + 1) } } };
    });
    return res.status(created.status).json(created.body);
  }));

  app.patch("/api/chiamo/team-members/:id", authenticate, route(async (req, res) => {
    noStore(res);
    if (!requireOwner(req, res)) return;
    if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ message: "Invalid user id" });
    const input = updateInput.parse(req.body);
    if (!Object.keys(input).some(key => key !== "confirmSeatPriceImpact")) return res.status(400).json({ message: "No user changes supplied" });
    const result = await database.transaction(async (tx: any) => {
      const tenant = await tenantForUpdate(tx, req.user.tenantId);
      if (!requireChiamoTenant(tenant)) return { status: 404, body: { message: "Chiamo customer not found" } };
       if (!await actorForUpdate(tx, req, tenant.id)) return { status: 403, body: { message: "Owner authorization is no longer valid" } };
      const [member] = await tx.select().from(agencyCredentials).where(and(eq(agencyCredentials.id, req.params.id), eq(agencyCredentials.tenantId, tenant.id))).limit(1).for("update");
      if (!member) return { status: 404, body: { message: "User not found" } };
      if (member.role === "owner") return { status: 403, body: { message: "Owner accounts cannot be modified or deactivated" } };
      const members = await tx.select().from(agencyCredentials).where(eq(agencyCredentials.tenantId, tenant.id)).for("update");
      const seat = canActivateUser(members, tenant.maxActiveUsers, tenant.businessType);
      const activating = input.isActive === true && member.isActive === false;
      if (activating && !seat.allowed) return { status: 409, body: { message: `Active user limit reached (${seat.activeUsers}/${seat.maxActiveUsers})`, code: "ACTIVE_USER_LIMIT_REACHED", seats: seat } };
      const [subscription] = await tx.select().from(chiamoSubscriptions).where(eq(chiamoSubscriptions.tenantId, tenant.id)).limit(1);
      if (activating && (!subscription || subscription.billingStatus !== "ACTIVE")) return { status: 409, body: { message: "An active Chiamo subscription is required before activating users", code: "ACTIVE_SUBSCRIPTION_REQUIRED" } };
      const before = chiamoUserPriceImpact(subscription, seat.activeUsers);
      const after = chiamoUserPriceImpact(subscription, seat.activeUsers + (activating ? 1 : input.isActive === false && member.isActive !== false ? -1 : 0));
      if (activating && chiamoUserSeatImpactRequiresConfirmation(before, after) && input.confirmSeatPriceImpact !== true) return { status: 409, body: { message: "Confirm the displayed seat and monthly price impact before activating this user", code: "SEAT_PRICE_CONFIRMATION_REQUIRED", before, after } };
      // Every management change invalidates older tokens through the exact
      // credentialVersion check already enforced by authenticateUser.
      const changes: any = { updatedAt: now(), credentialVersion: sql`${agencyCredentials.credentialVersion} + 1` };
       for (const key of ["email", "firstName", "lastName", "role", "voipAccess", "isActive"] as const) if (input[key] !== undefined) changes[key] = key === "email" ? (input[key] ? normalized(input[key] as string) : null) : input[key];
      if (changes.email) {
        const duplicate = await tx.select({ id: agencyCredentials.id }).from(agencyCredentials).where(and(sql`lower(trim(${agencyCredentials.email})) = ${changes.email}`, sql`${agencyCredentials.id} <> ${member.id}`)).limit(1).for("update");
        if (duplicate[0]) return { status: 409, body: { message: "That email is already in use", code: "DUPLICATE_CREDENTIAL" } };
      }
      const [updated] = await tx.update(agencyCredentials).set(changes).where(and(eq(agencyCredentials.id, member.id), eq(agencyCredentials.tenantId, tenant.id))).returning();
      return { status: 200, body: { member: safeMember(updated), seats: { ...seat, ...after } } };
    });
    return res.status(result.status).json(result.body);
  }));

  app.put("/api/chiamo/team-members/:id/password", authenticate, route(async (req, res) => {
    noStore(res);
    if (!requireOwner(req, res)) return;
    if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ message: "Invalid user id" });
    const input = passwordInput.parse(req.body);
    const reauthKey = `${req.user.tenantId}:${req.user.id}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    const admission = await reauthLimiter.attempt(reauthKey, now());
    if (!admission.allowed) {
      res.setHeader("Retry-After", String(admission.retryAfter));
      return res.status(429).json({ message: "Too many owner password attempts. Please try again later." });
    }
    const result = await database.transaction(async (tx: any) => {
      const tenant = await tenantForUpdate(tx, req.user.tenantId);
      if (!requireChiamoTenant(tenant)) return { status: 404, body: { message: "Chiamo customer not found" } };
      const actor = await actorForUpdate(tx, req, tenant.id);
      if (!actor || !(await bcrypt.compare(input.ownerPassword, actor.passwordHash).catch(() => false))) return { status: 401, body: { message: "Owner password verification failed" } };
      await reauthLimiter.clear(reauthKey);
      const [member] = await tx.select().from(agencyCredentials).where(and(eq(agencyCredentials.id, req.params.id), eq(agencyCredentials.tenantId, tenant.id))).limit(1).for("update");
      if (!member) return { status: 404, body: { message: "User not found" } };
      if (member.role === "owner") return { status: 403, body: { message: "Owner passwords cannot be replaced here" } };
      const [updated] = await tx.update(agencyCredentials).set({
        passwordHash: await bcrypt.hash(input.password, 12),
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        credentialVersion: sql`${agencyCredentials.credentialVersion} + 1`,
        updatedAt: now(),
      }).where(and(eq(agencyCredentials.id, member.id), eq(agencyCredentials.tenantId, tenant.id), eq(agencyCredentials.credentialVersion, member.credentialVersion))).returning();
      if (!updated) return { status: 409, body: { message: "Credential changed elsewhere. Refresh and try again." } };
      await tx.execute(sql`
        UPDATE password_reset_tokens SET used_at = ${now()}
        WHERE credential_id = ${member.id} AND used_at IS NULL
      `);
      return { status: 200, body: { member: safeMember(updated) } };
    });
    return res.status(result.status).json(result.body);
  }));
}