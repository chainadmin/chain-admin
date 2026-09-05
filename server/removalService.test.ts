import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyRemoval, effectiveRemovalClassification, makePreflight, retryCleanupTask, sanitizeProviderError,
  FORCE_PERMANENT_DELETE_CONFIRMATION, normalizePreflight,
  protectedLegalRecordCount, validateRemovalConfirmation,
} from "./removalService";
import { tenantOwnedLogoKey } from "./r2Storage";

const empty = { users: 0, consumers: 0, accounts: 0, invoices: 0, payments: 0, signedLegalRecords: 0, calls: 0, messages: 0 };

test("removal policy preserves converted and dual product tenants", () => {
  assert.equal(classifyRemoval({ id:"t", name:"Acme", chainCoreEnabled:true, chiamoConnectEnabled:false }, "CHAIN", empty), "PERMANENT_DELETE");
  assert.equal(classifyRemoval({ id:"t", name:"Acme", chainCoreEnabled:true, chiamoConnectEnabled:false }, "CHAIN", { ...empty, invoices:1 }), "ARCHIVE");
  assert.equal(classifyRemoval({ id:"t", name:"Acme", chainCoreEnabled:true, chiamoConnectEnabled:true }, "CHAIN", empty), "PRODUCT_DEACTIVATE");
  assert.equal(classifyRemoval({ id:"t", name:"Acme", chainCoreEnabled:false, chiamoConnectEnabled:true, convertedTenantId:"t" }, "CHIAMO", empty), "ARCHIVE");
  assert.equal(classifyRemoval({ id:"lead", name:"Lead", chainCoreEnabled:false, chiamoConnectEnabled:false, unconvertedLead:true }, "CHIAMO", empty), "PERMANENT_DELETE");
});

test("preflight fingerprint changes with dependencies", () => {
  const base = { target:{ id:"t", name:"Acme", chainCoreEnabled:true, chiamoConnectEnabled:false }, product:"CHAIN" as const, counts:empty, providerResources:{}, logoReferences:[] };
  assert.notEqual(makePreflight(base).fingerprint, makePreflight({ ...base, counts:{ ...empty, calls:1 } }).fingerprint);
});

test("public preflight follows the admin-removal frontend contract", () => {
  const internal = makePreflight({ target:{ id:"t", name:"Acme", chainCoreEnabled:true, chiamoConnectEnabled:false }, product:"CHAIN", counts:empty, providerResources:{ twilioSubaccountSid:null }, logoReferences:[] });
  const publicResult = normalizePreflight(internal, "TENANT", []);
  assert.deepEqual(publicResult.target, { type:"TENANT", id:"t", name:"Acme" });
  assert.deepEqual(publicResult.products, { chain:true, chiamo:false });
  assert.equal(publicResult.selectedProduct, "CHAIN");
  assert.ok(Array.isArray(publicResult.blockers));
});

test("removal confirmation tolerates surrounding stored whitespace but remains case-sensitive", () => {
  assert.equal(validateRemovalConfirmation("Perimeter ", "Perimeter", "Authorized removal"), null);
  assert.equal(validateRemovalConfirmation("Perimeter ", "perimeter", "Authorized removal"), "The target name must match exactly.");
  assert.equal(validateRemovalConfirmation("   ", "", "Authorized removal"), "The target name must match exactly.");
});

test("signed legal records block a Chain permanent deletion", () => {
  assert.equal(classifyRemoval({ id:"t", name:"Acme", chainCoreEnabled:true, chiamoConnectEnabled:false }, "CHAIN", { ...empty, signedLegalRecords: 1 }), "ARCHIVE");
  assert.equal(protectedLegalRecordCount({ signedLegalRecords: 1, signedDocuments: 2 }), 3);
  assert.equal(FORCE_PERMANENT_DELETE_CONFIRMATION, "PERMANENTLY DELETE");
  assert.equal(effectiveRemovalClassification("ARCHIVE", { ...empty, accounts: 2 }, true), "PERMANENT_DELETE");
  assert.equal(effectiveRemovalClassification("ARCHIVE", { ...empty, signedLegalRecords: 1 }, true), "ARCHIVE");
});

test("all retained operational categories block a Chain permanent deletion", () => {
  for (const category of [
    "arrangements", "approvals", "walletLedger", "campaignHistory",
    "automationHistory", "sequenceHistory", "convertedLeads",
    "billingHistory", "communicationHistory", "voiceProvisioning",
  ]) {
    assert.equal(
      classifyRemoval(
        { id:"t", name:"Acme", chainCoreEnabled:true, chiamoConnectEnabled:false },
        "CHAIN",
        { ...empty, [category]: 1 },
      ),
      "ARCHIVE",
      category,
    );
  }
});

test("logo ownership accepts only direct objects under the tenant prefix", () => {
  const base = "https://logos.example.test";
  assert.equal(tenantOwnedLogoKey(`${base}/logos/a/file.png`, "a", base), "logos/a/file.png");
  assert.equal(tenantOwnedLogoKey(`${base}/logos/b/file.png`, "a", base), null);
  assert.equal(tenantOwnedLogoKey("https://evil.test/logos/a/file.png", "a", base), null);
  assert.equal(tenantOwnedLogoKey(`${base}/logos/a/%2e%2e/file.png`, "a", base), null);
  assert.equal(tenantOwnedLogoKey(`${base}/logos/a/%252e%252e%252ffile.png`, "a", base), null);
});

test("cleanup failure is recorded and can be retried", async () => {
  const task = { id:"1", taskType:"LOGO_DELETE", payload:{}, status:"PENDING" as const, attempts:0 };
  const results: any[] = [];
  const store = { claim: async () => task, finish: async (_id:string, result:any) => { results.push(result); } };
  await retryCleanupTask(store, "1", async () => { throw new Error("token=secret https://provider.test/x"); });
  await retryCleanupTask(store, "1", async () => "SUCCEEDED");
  assert.equal(results[0].status, "FAILED");
  assert.match(results[0].error, /\[redacted\]/);
  assert.equal(results[1].status, "SUCCEEDED");
});

test("provider error sanitization omits endpoint details", () => {
  assert.equal(sanitizeProviderError("POST https://api.example.test/a token=abc"), "POST [url] token=[redacted]");
});