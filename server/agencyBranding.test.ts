import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRIMARY_BRAND_COLOR,
  DEFAULT_SECONDARY_BRAND_COLOR,
  getContrastTextColor,
  hasActiveLandingBranding,
  resolvePublicAgencyBranding,
} from "../shared/agencyBranding";

test("public branding includes saved landing fields and normalized company colors", () => {
  const result = resolvePublicAgencyBranding(
    { name: "Acme", slug: "acme", businessType: "law_firm", brand: {} },
    {
      customBranding: {
        primaryColor: "#abcdef",
        secondaryColor: "#123456",
        landingPageHeadline: "Welcome to Acme",
        landingPageSubheadline: "Resolve your account securely.",
        customLandingPageUrl: "https://example.com/portal",
      },
    },
  );

  assert.equal(result.primaryColor, "#ABCDEF");
  assert.equal(result.secondaryColor, "#123456");
  assert.equal(result.landingPageHeadline, "Welcome to Acme");
  assert.equal(result.landingPageSubheadline, "Resolve your account securely.");
  assert.equal(result.customLandingPageUrl, "https://example.com/portal");
});

test("invalid public branding uses safe defaults and rejects unsafe redirects", () => {
  const result = resolvePublicAgencyBranding(
    { name: "Acme", slug: "acme", brand: {} },
    { customBranding: { primaryColor: "blue", secondaryColor: "#123", customLandingPageUrl: "javascript:alert(1)" } },
  );

  assert.equal(result.primaryColor, DEFAULT_PRIMARY_BRAND_COLOR);
  assert.equal(result.secondaryColor, DEFAULT_SECONDARY_BRAND_COLOR);
  assert.equal(result.customLandingPageUrl, null);
});

test("color-only customization is active and contrast text remains readable", () => {
  assert.equal(hasActiveLandingBranding({ primaryColor: "#ffffff" }), true);
  assert.equal(hasActiveLandingBranding({}), false);
  assert.equal(getContrastTextColor("#FFFFFF"), "#000000");
  assert.equal(getContrastTextColor("#111827"), "#FFFFFF");
});