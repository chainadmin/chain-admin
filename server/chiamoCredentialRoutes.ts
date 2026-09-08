import type { Express, RequestHandler } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  agencyCredentials,
  chiamoAdminReauthAttempts,
  chiamoCredentialAudits,
  globalAdminCredentials,
  tenants,
} from "@shared/schema";
import { chiamoServiceConfigurations } from "@shared/chiamo-schema";
import { authenticateUser } from "./authMiddleware";
import {
  generateTemporaryPassword,
  TEMPORARY_PASSWORD_TTL_MS,
  validateAgencyPassword,
} from "./chiamoCredentialAuth";

const REAUTH_WINDOW_MS = 15 * 60 * 1000;
const REAUTH_MAX_FAILURES = 5;
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKxGhuQ5XxXxXxXxXxXxXxXxXxXxXxXxXx";
const uuidSchema = z.string().uuid();

const safe = (handler: any): RequestHandler => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    console.error("Chiamo credential access request failed", {
      path: req.path,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    if (!res.headersSent) res.status(500).json({ message: "Credential access request failed" });
  }
};

function noStore(res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

async function audit(database: any, input: {
  tenantId?: string;
  credentialId?: string;
  actorId: string;
  outcome: string;
  metadata?: Record<string, unknown>;
}) {
  await database.insert(chiamoCredentialAudits).values({
    tenantId: input.tenantId,
    credentialId: input.credentialId,
    actorId: input.actorId,
    action: "CHIAMO_TEMPORARY_PASSWORD_REPLACED",
    outcome: input.outcome,
    metadata: input.metadata || {},
  });
}

export function registerChiamoCredentialRoutes(
  app: Express,
  isPlatformAdmin: RequestHandler,
  dependencies: { database?: any; authenticate?: RequestHandler } = {},
) {
  const database = dependencies.database || db;
  const authenticate = dependencies.authenticate || authenticateUser;
  app.get("/api/admin/chiamo/customers/:tenantId/login-access", safe(isPlatformAdmin), safe(async (req: any, res: any) => {
    noStore(res);
    if (!uuidSchema.safeParse(req.params.tenantId).success) {
      return res.status(400).json({ message: "Invalid tenantId" });
    }
    const [tenant] = await database.select({
      id: tenants.id,
      isActive: tenants.isActive,
      chiamoConnectEnabled: tenants.chiamoConnectEnabled,
    }).from(tenants).where(eq(tenants.id, req.params.tenantId)).limit(1);
    if (!tenant || tenant.chiamoConnectEnabled !== true) {
      return res.status(404).json({ message: "Chiamo customer not found" });
    }
    const [service] = await database.select({
      accountActive: chiamoServiceConfigurations.accountActive,
      customerLoginEnabled: chiamoServiceConfigurations.customerLoginEnabled,
      explicitLoginDisabled: chiamoServiceConfigurations.explicitLoginDisabled,
    }).from(chiamoServiceConfigurations)
      .where(eq(chiamoServiceConfigurations.tenantId, tenant.id)).limit(1);
    const credentials = await database.select({
      id: agencyCredentials.id,
      username: agencyCredentials.username,
      role: agencyCredentials.role,
      isActive: agencyCredentials.isActive,
      mustChangePassword: agencyCredentials.mustChangePassword,
      temporaryPasswordExpiresAt: agencyCredentials.temporaryPasswordExpiresAt,
    }).from(agencyCredentials).where(eq(agencyCredentials.tenantId, tenant.id));
    return res.json({
      users: credentials,
      status: {
        tenantActive: tenant.isActive === true,
        chiamoEnabled: true,
        loginExplicitlyDisabled: service?.accountActive === false
          || service?.explicitLoginDisabled === true,
      },
    });
  }));

  app.post("/api/admin/chiamo/customers/:tenantId/temporary-password", safe(isPlatformAdmin), safe(async (req: any, res: any) => {
    noStore(res);
    const body = req.body || {};
    if (!uuidSchema.safeParse(req.params.tenantId).success || !uuidSchema.safeParse(body.credentialId).success || typeof body.adminPassword !== "string" || body.confirmReplace !== true) {
      await audit(database, { actorId: "primary", outcome: "INVALID_REQUEST" });
      return res.status(400).json({ message: "credentialId, adminPassword, and confirmReplace:true are required" });
    }
    const now = new Date();
    const actorId = "primary";
    const key = crypto.createHash("sha256")
      .update(`${actorId}:${req.ip || req.socket.remoteAddress || "unknown"}`)
      .digest("hex");
    const resetAt = new Date(now.getTime() + REAUTH_WINDOW_MS);
    const attemptResult = await database.execute(sql`
      INSERT INTO chiamo_admin_reauth_attempts (client_key_hash, failures, reset_at, updated_at)
      VALUES (${key}, 1, ${resetAt}, ${now})
      ON CONFLICT (client_key_hash) DO UPDATE SET
        failures = CASE WHEN chiamo_admin_reauth_attempts.reset_at <= ${now} THEN 1
                        ELSE chiamo_admin_reauth_attempts.failures + 1 END,
        reset_at = CASE WHEN chiamo_admin_reauth_attempts.reset_at <= ${now} THEN ${resetAt}
                        ELSE chiamo_admin_reauth_attempts.reset_at END,
        updated_at = ${now}
      RETURNING failures, reset_at
    `);
    const attempt = attemptResult.rows[0] as { failures: number; reset_at: Date };
    if (attempt.failures > REAUTH_MAX_FAILURES) {
      const retryAfter = Math.max(1, Math.ceil((new Date(attempt.reset_at).getTime() - now.getTime()) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      await audit(database, { actorId, outcome: "RATE_LIMITED" });
      return res.status(429).json({ message: "Too many reauthentication attempts. Please try again later." });
    }
    const [admin] = await database.select().from(globalAdminCredentials)
      .where(eq(globalAdminCredentials.id, actorId)).limit(1);
    const passwordMatches = await bcrypt.compare(body.adminPassword, admin?.passwordHash || DUMMY_HASH)
      .catch(() => false);
    if (!admin || admin.mustChangePassword || !passwordMatches) {
      await audit(database, {
        actorId,
        outcome: "REAUTH_FAILED",
        metadata: { requestedTenantId: req.params.tenantId, requestedCredentialId: body.credentialId },
      });
      return res.status(401).json({ message: "Global Admin password is incorrect" });
    }
    await database.delete(chiamoAdminReauthAttempts).where(eq(chiamoAdminReauthAttempts.clientKeyHash, key));

    const [target] = await database.select({
      id: agencyCredentials.id,
      username: agencyCredentials.username,
      tenantId: agencyCredentials.tenantId,
      tenantActive: tenants.isActive,
      chiamoEnabled: tenants.chiamoConnectEnabled,
      credentialActive: agencyCredentials.isActive,
    }).from(agencyCredentials)
      .innerJoin(tenants, eq(tenants.id, agencyCredentials.tenantId))
      .where(and(
        eq(agencyCredentials.id, body.credentialId),
        eq(agencyCredentials.tenantId, req.params.tenantId),
      )).limit(1);
    if (!target || target.chiamoEnabled !== true || target.credentialActive !== true) {
      await audit(database, {
        actorId,
        outcome: "TARGET_REJECTED",
        metadata: { requestedTenantId: req.params.tenantId, requestedCredentialId: body.credentialId },
      });
      return res.status(404).json({ message: "Chiamo credential not found for this customer" });
    }
    if (target.tenantActive !== true) {
      await audit(database, { tenantId: target.tenantId, credentialId: target.id, actorId, outcome: "TARGET_DISABLED" });
      return res.status(409).json({ message: "The Chiamo customer is disabled" });
    }

    const temporaryPassword = generateTemporaryPassword();
    const expiresAt = new Date(now.getTime() + TEMPORARY_PASSWORD_TTL_MS);
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const committed = await database.transaction(async (tx: any) => {
      const [eligible] = await tx.select({
        id: agencyCredentials.id,
        tenantActive: tenants.isActive,
        chiamoEnabled: tenants.chiamoConnectEnabled,
        credentialActive: agencyCredentials.isActive,
      }).from(agencyCredentials)
        .innerJoin(tenants, eq(tenants.id, agencyCredentials.tenantId))
        .where(and(
          eq(agencyCredentials.id, target.id),
          eq(agencyCredentials.tenantId, target.tenantId),
        )).limit(1).for("update");
      if (!eligible || !eligible.tenantActive || !eligible.chiamoEnabled || !eligible.credentialActive) {
        return false;
      }
      const [updated] = await tx.update(agencyCredentials).set({
        passwordHash,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: expiresAt,
        credentialVersion: sql`${agencyCredentials.credentialVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(agencyCredentials.id, target.id),
        eq(agencyCredentials.tenantId, target.tenantId),
      )).returning({ id: agencyCredentials.id });
      if (!updated) return false;
      await tx.execute(sql`
        UPDATE password_reset_tokens
        SET used_at = ${now}
        WHERE credential_id = ${target.id} AND used_at IS NULL
      `);
      await tx.insert(chiamoCredentialAudits).values({
        tenantId: target.tenantId,
        credentialId: target.id,
        actorId,
        action: "CHIAMO_TEMPORARY_PASSWORD_REPLACED",
        outcome: "SUCCEEDED",
        metadata: { expiresAt: expiresAt.toISOString() },
      });
      return true;
    });
    if (!committed) {
      await audit(database, { actorId, outcome: "ELIGIBILITY_CHANGED" });
      return res.status(409).json({ message: "Credential eligibility changed. Refresh and try again." });
    }
    return res.json({ username: target.username, temporaryPassword, expiresAt: expiresAt.toISOString() });
  }));

  app.post("/api/chiamo/change-password", safe(authenticate), safe(async (req: any, res: any) => {
    noStore(res);
    if (req.user?.product !== "chiamo" || req.user?.passwordChangeOnly !== true) {
      return res.status(403).json({ code: "PASSWORD_CHANGE_SESSION_REQUIRED", message: "A password-change session is required" });
    }
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ message: "currentPassword and newPassword are required" });
    }
    const passwordError = validateAgencyPassword(newPassword);
    if (passwordError) return res.status(400).json({ message: passwordError });
    if (currentPassword === newPassword) return res.status(400).json({ message: "New password must be different" });
    const [credential] = await database.select().from(agencyCredentials).where(and(
      eq(agencyCredentials.id, req.user.id),
      eq(agencyCredentials.tenantId, req.user.tenantId),
    )).limit(1);
    if (!credential || !(await bcrypt.compare(currentPassword, credential.passwordHash))) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const [updated] = await database.transaction(async (tx: any) => {
      const rows = await tx.update(agencyCredentials).set({
        passwordHash,
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        credentialVersion: sql`${agencyCredentials.credentialVersion} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(agencyCredentials.id, credential.id),
        eq(agencyCredentials.credentialVersion, credential.credentialVersion),
        eq(agencyCredentials.mustChangePassword, true),
        eq(agencyCredentials.isActive, true),
      )).returning({ id: agencyCredentials.id });
      if (!rows[0]) return [];
      await tx.execute(sql`
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE credential_id = ${credential.id} AND used_at IS NULL
      `);
      return rows;
    });
    if (!updated) return res.status(409).json({ message: "Credential changed elsewhere. Sign in again." });
    return res.json({ success: true });
  }));
}