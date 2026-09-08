import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const customerUi = readFileSync(new URL("../../chiamo/chiamo.tsx", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../chiamo-admin.tsx", import.meta.url), "utf8");

test("Chiamo customer UI exposes only phone services", () => {
  for (const removed of [
    "/messages",
    "Business Texting",
    "textingInterest",
    "chiamoTextingAddon",
    "/api/chiamo/messages",
    "/api/chiamo/texting-request",
  ]) {
    assert.equal(customerUi.includes(removed), false, `customer UI still contains ${removed}`);
  }
  assert.match(customerUi, /export \{ ChiamoLogin \} from "\.\/chiamo-login"/);
});

test("Chiamo conversion payload and admin navigation omit messaging", () => {
  for (const removed of [
    "SMS Services",
    "smsEnabled",
    "smsStatus",
    "smsAllowance",
    "smsOverageMicros",
    "resend-notification",
    "resend-invitation",
    "Postmark",
  ]) {
    assert.equal(adminUi.includes(removed), false, `admin UI still contains ${removed}`);
  }
  assert.match(adminUi, /body:\s*\{\s*voiceEnabled: event\.target\.checked\s*\}/);
});

test("setup queue reports explicit service stages and honors asynchronous retry", () => {
  assert.match(adminUi, /Stage title="Voice provider"/);
  assert.match(adminUi, /Stage title="Billing"/);
  assert.match(adminUi, /Stage title="First login"/);
  assert.match(adminUi, /Stage title="Overall readiness"/);
  assert.match(adminUi, /voiceProviderStatus/);
  assert.match(adminUi, /readinessStatus/);
  assert.match(adminUi, /response\.json\(\)/);
  assert.match(adminUi, /response\.status/);
  assert.match(adminUi, /onSettled:/);
  assert.match(adminUi, /result\?\.message/);
});

test("direct login access is available in both customer admin views", () => {
  assert.match(adminUi, /import \{ ChiamoLoginAccess \}/);
  assert.equal((adminUi.match(/<ChiamoLoginAccess/g) || []).length, 2);
  assert.doesNotMatch(adminUi, /queryClient\.setQueryData[^]*password/i);
});

test("phone queries surface loading and failure states without conditional hooks", () => {
  const pageStart = customerUi.indexOf("function ChiamoPage");
  const firstPageBranch = customerUi.indexOf('if(page===', pageStart);
  const accountQuery = customerUi.indexOf('queryKey:["/api/chiamo/account"]', pageStart);
  assert.ok(accountQuery > pageStart && accountQuery < firstPageBranch);
  assert.match(customerUi, /Loading phone system setup/);
  assert.match(customerUi, /Phone setup is not available yet/);
  assert.match(customerUi, /voiceProviderStatus/);
});