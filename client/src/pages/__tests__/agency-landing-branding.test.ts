import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../agency-landing.tsx", import.meta.url),
  "utf8",
);

test("agency landing applies resolved company branding to prominent elements", () => {
  assert.match(source, /resolveBrandColor\(resolvedBranding\.primaryColor/);
  assert.match(source, /resolveBrandColor\(resolvedBranding\.secondaryColor/);
  assert.match(source, /style=\{primaryAction\}/);
  assert.match(source, /style=\{secondaryAction\}/);
  assert.match(source, /backgroundImage: "none"/);
  assert.match(source, /style=\{accentGradient\}/);
  assert.match(source, /resolvedBranding\.landingPageHeadline/);
  assert.match(source, /resolvedBranding\.landingPageSubheadline/);
  assert.match(source, /resolveSafeLandingPageUrl\(agencyData\?\.customLandingPageUrl\)/);
});

test("saving settings invalidates cached public branding", () => {
  const settingsSource = readFileSync(
    new URL("../settings.tsx", import.meta.url),
    "utf8",
  );
  assert.match(settingsSource, /startsWith\("\/api\/public\/agency-branding\?slug="/);
});

test("agency landing no longer hardcodes blue or indigo after branding loads", () => {
  const loadedPage = source.slice(source.indexOf("const accentColor"));
  assert.doesNotMatch(loadedPage, /(?:bg|text|border)-(?:blue|indigo)-/);
});