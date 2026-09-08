import type { VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { agencyCredentials } from "../../shared/schema";
import { getDb } from "../_lib/db";
import { type AuthenticatedRequest, withAuth } from "../_lib/auth";

function passwordError(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (Buffer.byteLength(password, "utf8") > 72) return "Password must be no more than 72 UTF-8 bytes";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must include a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a special character";
  return null;
}

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.authClaims?.product !== "chiamo" || req.authClaims?.passwordChangeOnly !== true) {
    return res.status(403).json({ code: "PASSWORD_CHANGE_SESSION_REQUIRED", error: "A password-change session is required" });
  }
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return res.status(400).json({ error: "currentPassword and newPassword are required" });
  }
  const validationError = passwordError(newPassword);
  if (validationError) return res.status(400).json({ error: validationError });
  if (currentPassword === newPassword) return res.status(400).json({ error: "New password must be different" });

  const credential = req.user;
  if (
    !credential?.mustChangePassword
    || !(await bcrypt.compare(currentPassword, credential.passwordHash))
  ) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }
  const db = await getDb();
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx.update(agencyCredentials).set({
      passwordHash,
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      credentialVersion: sql`${agencyCredentials.credentialVersion} + 1`,
      updatedAt: new Date(),
    }).where(and(
      eq(agencyCredentials.id, credential.id),
      eq(agencyCredentials.tenantId, credential.tenantId),
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
  if (!updated) return res.status(409).json({ error: "Credential changed elsewhere. Sign in again." });
  return res.status(200).json({ success: true });
}

export default withAuth(async (req, res) => {
  await handler(req, res);
});