import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCanonicalTenantCandidates,
  companyIdentityLockKeys,
  normalizeCompanyEmail,
  normalizeCompanyName,
} from "./phoneProductIdentity";

const candidate = (id: string, email: string, businessName: string) => ({
  id,
  email,
  businessName,
  name: businessName,
});

test("company identity normalization is case and whitespace insensitive", () => {
  assert.equal(normalizeCompanyEmail("  OWNER@Example.COM "), "owner@example.com");
  assert.equal(normalizeCompanyName("  Acme   Recovery LLC "), "acme recovery llc");
});

test("canonical company matching requires one exact email and name match", () => {
  const result = classifyCanonicalTenantCandidates(
    [candidate("tenant-1", "owner@example.com", "Acme Recovery LLC")],
    " OWNER@example.com ",
    "acme   recovery llc",
  );
  assert.equal(result.tenant?.id, "tenant-1");
  assert.equal(result.reason, undefined);
});

test("company records with partial or duplicate matches require manual review", () => {
  const mismatch = classifyCanonicalTenantCandidates(
    [candidate("tenant-1", "owner@example.com", "Different Company")],
    "owner@example.com",
    "Acme Recovery LLC",
  );
  assert.equal(mismatch.reason, "MISMATCH");

  const ambiguous = classifyCanonicalTenantCandidates(
    [
      candidate("tenant-1", "owner@example.com", "Acme Recovery LLC"),
      candidate("tenant-2", "OWNER@example.com", " acme recovery llc "),
    ],
    "owner@example.com",
    "Acme Recovery LLC",
  );
  assert.equal(ambiguous.reason, "AMBIGUOUS");
});

test("conflicting concurrent registrations share at least one identity lock", () => {
  const sameEmailA = companyIdentityLockKeys("owner@example.com", "Acme One");
  const sameEmailB = companyIdentityLockKeys("OWNER@example.com", "Acme Two");
  assert.equal(sameEmailA.some(key => sameEmailB.includes(key)), true);

  const sameNameA = companyIdentityLockKeys("one@example.com", "Acme Recovery");
  const sameNameB = companyIdentityLockKeys("two@example.com", " acme   recovery ");
  assert.equal(sameNameA.some(key => sameNameB.includes(key)), true);
});

test("Chain-first and Chiamo-first matching converge on the same tenant", () => {
  const initial = classifyCanonicalTenantCandidates([], "owner@example.com", "Acme Recovery");
  assert.equal(initial.tenant, undefined);
  assert.equal(initial.reason, undefined);

  const created = candidate("canonical-tenant", "owner@example.com", "Acme Recovery");
  const chainAfterChiamo = classifyCanonicalTenantCandidates([created], "OWNER@example.com", "acme recovery");
  const chiamoAfterChain = classifyCanonicalTenantCandidates([created], " owner@example.com ", " Acme Recovery ");
  assert.equal(chainAfterChiamo.tenant?.id, "canonical-tenant");
  assert.equal(chiamoAfterChain.tenant?.id, "canonical-tenant");
});