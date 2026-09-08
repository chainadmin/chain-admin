import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export const TEMPORARY_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

export type ChiamoAgencyClaims = {
  userId: string;
  tenantId: string;
  tenantSlug?: string;
  tenantName?: string;
  username?: string;
  email?: string;
  role?: string;
  restrictedServices?: string[];
  product: "chiamo";
  credentialVersion: number;
  passwordChangeOnly?: true;
};

export function generateTemporaryPassword(): string {
  // 18 random bytes provide 144 bits of entropy. base64url is accepted by the
  // password policy and avoids characters which are commonly mangled in chat.
  return `${crypto.randomBytes(18).toString("base64url")}Aa1!`;
}

export function validateAgencyPassword(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (Buffer.byteLength(password, "utf8") > 72) return "Password must be no more than 72 UTF-8 bytes";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must include a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a special character";
  return null;
}

export function createChiamoAgencyToken(
  secret: string,
  claims: ChiamoAgencyClaims,
  expiresIn: "15m" | "7d" = "7d",
): string {
  return jwt.sign(claims, secret, { expiresIn });
}

export function isTemporaryPasswordUsable(credential: {
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: Date | null;
}, now = new Date()): boolean {
  return credential.mustChangePassword === true
    && credential.temporaryPasswordExpiresAt instanceof Date
    && credential.temporaryPasswordExpiresAt.getTime() > now.getTime();
}