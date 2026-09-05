import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildChiamoLeadEmails, sendChiamoLeadEmails } from "./chiamoLeadEmails";
import { invitationPrerequisites, postmarkTokenForRetry, resolveChiamoBaseUrl, resolveDedicatedPostmarkServer, sanitizeOnboardingError, voiceProviderStatusForConversion } from "./chiamoOnboarding";
import { encryptCredential } from "./credentialCrypto";
import { hashPasswordResetToken, isChainActivationReset, passwordResetProduct } from "./passwordResetPolicy";

const lead = {
  businessName: "Acme & Sons",
  firstName: "Jamie",
  lastName: "O'Neil",
  businessEmail: "jamie@example.com",
  businessPhone: "716-555-0100",
  phoneUsersNeeded: 12,
  planInterest: "business" as const,
  textingInterest: true,
};

test("buildChiamoLeadEmails creates an admin registration notification", () => {
  const { admin } = buildChiamoLeadEmails(lead);

  assert.deepEqual(admin.to.split(","), [
    "support@chiamoconnect.com",
    "support@chainsoftwaregroup.com",
  ]);
  assert.equal(admin.from, "support@chiamoconnect.com");
  assert.equal(admin.replyTo, "support@chiamoconnect.com");
  assert.match(admin.subject, /New Chiamo Connect Company Registration/);
  assert.match(admin.html, /Acme &amp; Sons/);
  assert.match(admin.html, /Jamie O&#39;Neil/);
  assert.match(admin.html, /Action Required/);
});

test("buildChiamoLeadEmails creates a branded customer welcome email", () => {
  const { customer } = buildChiamoLeadEmails(lead);

  assert.equal(customer.to, lead.businessEmail);
  assert.equal(customer.from, "support@chiamoconnect.com");
  assert.equal(customer.replyTo, "support@chiamoconnect.com");
  assert.equal(customer.subject, "Thank you for registering with Chiamo Connect");
  assert.match(customer.html, /Our team will reach out soon/);
  assert.match(customer.html, /support@chiamoconnect\.com/);
  assert.doesNotMatch(customer.to, /support@chainsoftwaregroup\.com/);
  assert.equal(customer.tag, "chiamo-welcome-email");
});

test("sendChiamoLeadEmails attempts both messages and reports either failure", async () => {
  const attemptedRecipients: string[] = [];
  const result = await sendChiamoLeadEmails(lead, async email => {
    attemptedRecipients.push(email.to);
    if (email.tag === "chiamo-lead") throw new Error("Internal notification failed");
    return { messageId: "welcome-id", success: true };
  });

  assert.deepEqual(attemptedRecipients, [
    "support@chiamoconnect.com,support@chainsoftwaregroup.com",
    lead.businessEmail,
  ]);
  assert.equal(result.admin.success, false);
  assert.equal(result.admin.error, "Internal notification failed");
  assert.equal(result.customer.success, true);
});

test("Chiamo URL selection fails closed and never emits a Chain origin", () => {
  assert.equal(resolveChiamoBaseUrl({ CHIAMO_BASE_URL:"https://app.chiamoconnect.com/" }), "https://app.chiamoconnect.com");
  assert.equal(resolveChiamoBaseUrl({ CHIAMO_DOMAIN:"portal.chiamoconnect.com" }), "https://portal.chiamoconnect.com");
  assert.equal(resolveChiamoBaseUrl({}, "https://app.chiamoconnect.com"), "https://app.chiamoconnect.com");
  assert.throws(() => resolveChiamoBaseUrl({}), /verified Chiamo base URL/);
  assert.throws(() => resolveChiamoBaseUrl({ CHIAMO_BASE_URL:"https://chainsoftwaregroup.com" }), /invalid/);
  assert.throws(() => resolveChiamoBaseUrl({ CHIAMO_BASE_URL:"https://unrelated.example" }), /invalid/);
  assert.throws(() => resolveChiamoBaseUrl({}, "https://unrelated.example"), /verified Chiamo base URL/);
  assert.throws(() => resolveChiamoBaseUrl({ CHIAMO_BASE_URL:"http://chiamoconnect.com" }), /invalid/);
});

test("invitation readiness requires tenant email and requested Voice providers", () => {
  assert.deepEqual(invitationPrerequisites({ postmarkStatus:"READY", hasPostmarkCredentials:true, voiceRequested:false, voiceProviderStatus:"NOT_REQUESTED" }), { ready:true });
  assert.equal(invitationPrerequisites({ postmarkStatus:"FAILED", hasPostmarkCredentials:false, voiceRequested:false, voiceProviderStatus:"NOT_REQUESTED" }).reason, "POSTMARK_NOT_READY");
  assert.equal(invitationPrerequisites({ postmarkStatus:"READY", hasPostmarkCredentials:true, voiceRequested:true, voiceProviderStatus:"FAILED" }).reason, "VOICE_NOT_READY");
});

test("repeated conversion preserves a ready Voice provider stage", () => {
  assert.equal(voiceProviderStatusForConversion(true, "READY"), "READY");
  assert.equal(voiceProviderStatusForConversion(true, "FAILED"), "NOT_STARTED");
  assert.equal(voiceProviderStatusForConversion(false, "READY"), "NOT_REQUESTED");
});

test("provider errors exposed to Chiamo administrators are sanitized", () => {
  const secret = "AC-secret-account-token";
  assert.doesNotMatch(sanitizeOnboardingError("voice", new Error(secret)), new RegExp(secret));
  assert.doesNotMatch(sanitizeOnboardingError("postmark", new Error(secret)), new RegExp(secret));
});

test("Postmark retries migrate plaintext but discard malformed encrypted tokens", () => {
  process.env.JWT_SECRET ||= "synthetic-test-encryption-key";
  const encrypted = encryptCredential("synthetic-postmark-token");
  assert.equal(postmarkTokenForRetry("legacy-plaintext-token"), "legacy-plaintext-token");
  assert.equal(postmarkTokenForRetry(encrypted), encrypted);
  assert.equal(postmarkTokenForRetry("enc:v1:corrupt"), null);
});

test("password recovery derives product from tenant and cannot activate Chain with a Chiamo token", () => {
  assert.equal(passwordResetProduct({ chiamoConnectEnabled:true, chainCoreEnabled:false }), "chiamo");
  assert.equal(passwordResetProduct({ chiamoConnectEnabled:true, chainCoreEnabled:true }), "chain");
  assert.equal(isChainActivationReset("a".repeat(64)), false);
  assert.equal(isChainActivationReset(`chain-activation-${"a".repeat(64)}`), true);
  assert.equal(isChainActivationReset("chain-activation-chiamo-invitation"), false);
  const raw = "a".repeat(64);
  const stored = hashPasswordResetToken(raw);
  assert.notEqual(stored, raw);
  assert.equal(stored, hashPasswordResetToken(raw));
  assert.match(stored, /^sha256:[a-f0-9]{64}$/);
});

test("password reset queries accept only hashed tokens", () => {
  const storageSource = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.doesNotMatch(storageSource, /OR \(token = \$\{token\}/);
  assert.doesNotMatch(routesSource, /OR \(token = \$\{token\}/);
});

test("dedicated Postmark resolution reuses a matching server and creates only when absent", async () => {
  const existing = { ID:7, Name:"tenant-server", ApiTokens:["token"] } as any;
  let creates = 0;
  const reused = await resolveDedicatedPostmarkServer("tenant-server", {
    findServerByName:async () => ({ success:true, server:existing }),
    createServer:async () => { creates++; return { success:true, server:existing }; },
  });
  assert.equal(reused.ID, 7);
  assert.equal(creates, 0);

  const created = await resolveDedicatedPostmarkServer("new-server", {
    findServerByName:async () => ({ success:true }),
    createServer:async config => {
      creates++;
      return { success:true, server:{ ...existing, ID:8, Name:config.name } };
    },
  });
  assert.equal(created.Name, "new-server");
  assert.equal(creates, 1);
});
