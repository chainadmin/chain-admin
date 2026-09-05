import assert from "node:assert/strict";
import test from "node:test";
import { buildChiamoLeadEmails, sendChiamoLeadEmails } from "./chiamoLeadEmails";
import { invitationPrerequisites, resolveChiamoBaseUrl, resolveDedicatedPostmarkServer, sanitizeOnboardingError } from "./chiamoOnboarding";
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
  assert.throws(() => resolveChiamoBaseUrl({}), /verified Chiamo base URL/);
  assert.throws(() => resolveChiamoBaseUrl({ CHIAMO_BASE_URL:"https://chainsoftwaregroup.com" }), /invalid/);
  assert.throws(() => resolveChiamoBaseUrl({ CHIAMO_BASE_URL:"http://chiamoconnect.com" }), /invalid/);
});

test("invitation readiness requires tenant email and requested Voice providers", () => {
  assert.deepEqual(invitationPrerequisites({ postmarkStatus:"READY", hasPostmarkCredentials:true, voiceRequested:false, voiceProviderStatus:"NOT_REQUESTED" }), { ready:true });
  assert.equal(invitationPrerequisites({ postmarkStatus:"FAILED", hasPostmarkCredentials:false, voiceRequested:false, voiceProviderStatus:"NOT_REQUESTED" }).reason, "POSTMARK_NOT_READY");
  assert.equal(invitationPrerequisites({ postmarkStatus:"READY", hasPostmarkCredentials:true, voiceRequested:true, voiceProviderStatus:"FAILED" }).reason, "VOICE_NOT_READY");
});

test("provider errors exposed to Chiamo administrators are sanitized", () => {
  const secret = "AC-secret-account-token";
  assert.doesNotMatch(sanitizeOnboardingError("voice", new Error(secret)), new RegExp(secret));
  assert.doesNotMatch(sanitizeOnboardingError("postmark", new Error(secret)), new RegExp(secret));
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
