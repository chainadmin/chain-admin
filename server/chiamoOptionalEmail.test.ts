import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { agencyCredentials, insertAgencyCredentialsSchema } from "../shared/schema";
import { agencyCredentials as apiCredentials } from "../api/_lib/schema";

test("both credential tables allow a real null email, without changing Chain validation", () => {
  assert.equal(agencyCredentials.email.notNull, false);
  assert.equal(apiCredentials.email.notNull, false);
  const input = { tenantId: "11111111-1111-4111-8111-111111111111", username: "chain-user", passwordHash: "hashed-password" };
  for (const email of [undefined, null, "", " ", "not-an-email"]) {
    assert.equal(insertAgencyCredentialsSchema.safeParse({ ...input, email }).success, false);
  }
  assert.equal(insertAgencyCredentialsSchema.safeParse({ ...input, email: "user@example.test" }).success, true);
});

test("optional-email migration only relaxes the credential column, without deleting records", () => {
  const migrations = readFileSync(new URL("./migrations.ts", import.meta.url), "utf8");
  assert.match(migrations, /ALTER TABLE agency_credentials ALTER COLUMN email DROP NOT NULL/);
  assert.doesNotMatch(migrations, /ALTER TABLE consumers ALTER COLUMN email DROP NOT NULL/);
});