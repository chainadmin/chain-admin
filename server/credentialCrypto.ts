import crypto from "node:crypto";

const PREFIX = "enc:v1:";

function key(): Buffer {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("Credential encryption is not configured");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptCredential(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptCredential(value: string): string {
  if (!value.startsWith(PREFIX)) return value; // migration compatibility; rotated values become encrypted
  const [iv, tag, encrypted] = value.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}