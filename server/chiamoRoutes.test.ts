import assert from "node:assert/strict";
import test from "node:test";
import { buildChiamoLeadEmails, sendChiamoLeadEmails } from "./chiamoLeadEmails";

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
