import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createChiamoAgencyToken,
  generateTemporaryPassword,
  isTemporaryPasswordUsable,
  validateAgencyPassword,
} from "./chiamoCredentialAuth";

test("temporary credentials have at least 128 bits of random input and are stored as hashes", async () => {
  const first = generateTemporaryPassword();
  const second = generateTemporaryPassword();
  assert.notEqual(first, second);
  // 18 random bytes encode to 24 base64url characters, before the required
  // character classes are appended.
  assert.ok(first.length >= 28);
  const hash = await bcrypt.hash(first, 4);
  assert.equal(hash.includes(first), false);
  assert.equal(await bcrypt.compare(first, hash), true);
});

test("temporary credential usability enforces both change-only state and expiration", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(isTemporaryPasswordUsable({
    mustChangePassword: true,
    temporaryPasswordExpiresAt: new Date(now.getTime() + 1),
  }, now), true);
  assert.equal(isTemporaryPasswordUsable({
    mustChangePassword: true,
    temporaryPasswordExpiresAt: now,
  }, now), false);
  assert.equal(isTemporaryPasswordUsable({
    mustChangePassword: false,
    temporaryPasswordExpiresAt: new Date(now.getTime() + 1),
  }, now), false);
});

test("restricted tokens carry credential version and cannot be mistaken for normal tokens", () => {
  const token = createChiamoAgencyToken("test-secret", {
    userId: "credential",
    tenantId: "tenant",
    product: "chiamo",
    credentialVersion: 7,
    passwordChangeOnly: true,
  }, "15m");
  const claims = jwt.verify(token, "test-secret") as any;
  assert.equal(claims.product, "chiamo");
  assert.equal(claims.credentialVersion, 7);
  assert.equal(claims.passwordChangeOnly, true);
});

test("password policy prevents bcrypt truncation and weak replacement passwords", () => {
  assert.match(validateAgencyPassword("short") || "", /12/);
  assert.match(validateAgencyPassword(`${"é".repeat(35)}Aa1!`) || "", /72 UTF-8 bytes/);
  assert.equal(validateAgencyPassword("LongEnough-Aa1!"), null);
});