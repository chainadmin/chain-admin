import assert from "node:assert/strict";
import test from "node:test";
import {
  buildArrangementOverride,
  documentTemplateSendSchema,
  mergeArrangementOverride,
} from "../../../../shared/documentSigning";
import { getSafeConsumerReturnPath } from "../../../../shared/utils/consumerReturnPath";
import {
  buildLegacyReferencedSignedArtifact,
  buildLegacySignedArtifact,
  decodeStoredHtml,
} from "../../../../shared/utils/signedDocumentArtifact";

test("accepts valid signature-request arrangement terms", () => {
  const parsed = documentTemplateSendSchema.parse({
    consumerId: "consumer-1",
    accountId: "account-1",
    expiresInDays: 14,
    paymentAmount: "125.50",
    paymentFrequency: "biweekly",
    numberOfPayments: "8",
    arrangementStartDate: "2026-09-15",
  });

  assert.deepEqual(buildArrangementOverride(parsed), {
    monthlyPaymentCents: 12_550,
    frequency: "biweekly",
    numberOfPayments: 8,
    startDate: "2026-09-15",
  });
});

test("rejects unsafe arrangement terms before rendering a document", () => {
  const invalidPayloads = [
    { paymentAmount: "-1" },
    { paymentAmount: "not-a-number" },
    { paymentFrequency: "daily" },
    { numberOfPayments: "2.5" },
    { numberOfPayments: "0" },
    { arrangementStartDate: "2026-02-30" },
  ];

  for (const invalid of invalidPayloads) {
    const result = documentTemplateSendSchema.safeParse({
      consumerId: "consumer-1",
      ...invalid,
    });
    assert.equal(result.success, false, `Expected rejection for ${JSON.stringify(invalid)}`);
  }
});

test("partial overrides preserve existing arrangement terms", () => {
  const existing = {
    monthlyPaymentCents: 10_000,
    frequency: "monthly",
    numberOfPayments: 12,
    startDate: "2026-09-01",
  };

  assert.deepEqual(
    mergeArrangementOverride(existing, { monthlyPaymentCents: 12_500 }),
    {
      monthlyPaymentCents: 12_500,
      frequency: "monthly",
      numberOfPayments: 12,
      startDate: "2026-09-01",
    },
  );
});

test("consumer login only returns to a local UUID signing path", () => {
  const validPath = "/sign/123e4567-e89b-42d3-a456-426614174000";

  assert.equal(getSafeConsumerReturnPath(validPath), validPath);
  assert.equal(getSafeConsumerReturnPath("https://example.com/sign/123"), null);
  assert.equal(getSafeConsumerReturnPath("//example.com"), null);
  assert.equal(getSafeConsumerReturnPath("/consumer-dashboard"), null);
  assert.equal(getSafeConsumerReturnPath("/sign/not-a-uuid"), null);
});

test("legacy signed records are finalized with their stored signature evidence", () => {
  const signature = "data:image/png;base64,c2lnbmF0dXJl";
  const initials = "data:image/png;base64,aW5pdGlhbHM=";
  const artifact = buildLegacySignedArtifact(
    "<html><body><h1>Agreement</h1></body></html>",
    signature,
    initials,
    "2026-08-31T12:00:00.000Z",
  );
  const stored = `data:text/html;charset=utf-8,${encodeURIComponent(artifact)}`;

  assert.match(artifact, /data-chain-legacy-signature-record="true"/);
  assert.match(artifact, new RegExp(signature));
  assert.match(artifact, new RegExp(initials));
  assert.equal(decodeStoredHtml(stored), artifact);
});

test("legacy external and PDF references become immutable signed receipts", () => {
  const signature = "data:image/png;base64,c2lnbmF0dXJl";
  const initials = "data:image/png;base64,aW5pdGlhbHM=";
  const externalUrl = "https://documents.example.test/agreement.pdf";
  const pdfDataUrl = "data:application/pdf;base64,JVBERi0xLjQ=";

  const externalReceipt = buildLegacyReferencedSignedArtifact(
    externalUrl,
    signature,
    initials,
    "2026-08-31T12:00:00.000Z",
  );
  const pdfReceipt = buildLegacyReferencedSignedArtifact(
    pdfDataUrl,
    signature,
    null,
    "2026-08-31T12:00:00.000Z",
  );

  assert.match(externalReceipt, /Legacy Electronic Signature Receipt/);
  assert.match(externalReceipt, new RegExp(externalUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(externalReceipt, new RegExp(signature));
  assert.match(externalReceipt, new RegExp(initials));
  assert.match(pdfReceipt, /data:application\/pdf;base64,JVBERi0xLjQ=/);
  assert.match(pdfReceipt, new RegExp(signature));
});