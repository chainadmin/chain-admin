import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePolicyContent } from "../agency-policy-utils";

test("uses agency-provided policy text when available", () => {
  const result = resolvePolicyContent({
    primary: {
      termsOfService: "Agency Terms",
      privacyPolicy: "Agency Privacy",
    },
  });

  assert.equal(result.termsContent, "Agency Terms");
  assert.equal(result.privacyContent, "Agency Privacy");
  assert.equal(result.hasTermsContent, true);
  assert.equal(result.hasPrivacyContent, true);
});

test("falls back to agency defaults when policies are missing", () => {
  const result = resolvePolicyContent({
    primary: {
      termsOfService: null,
      privacyPolicy: undefined,
    },
    fallback: {
      termsOfService: "Fallback Terms",
      privacyPolicy: "Fallback Privacy",
    },
  });

  assert.equal(result.termsContent, "Fallback Terms");
  assert.equal(result.privacyContent, "Fallback Privacy");
  assert.equal(result.hasTermsContent, true);
  assert.equal(result.hasPrivacyContent, true);
});

test("treats whitespace-only policy text as empty for display controls", () => {
  const result = resolvePolicyContent({
    primary: {
      termsOfService: "   ",
      privacyPolicy: "\n\t",
    },
  });

  assert.equal(result.termsContent, "   ");
  assert.equal(result.privacyContent, "\n\t");
  assert.equal(result.hasTermsContent, false);
  assert.equal(result.hasPrivacyContent, false);
});
