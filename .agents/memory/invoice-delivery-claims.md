---
name: Invoice delivery claims
description: Reliability boundary for retryable invoice email delivery through providers without idempotency keys.
---

Atomically move an invoice from pending or failed into an in-progress delivery state before calling the email provider. Only the worker that wins that conditional update may send. Sent invoices must never be eligible for another claim, while abandoned in-progress claims need conservative stale recovery.

**Why:** A read-then-send flow allows concurrent schedulers to email the same invoice. Postmark does not provide an idempotency key, so there is still an unavoidable crash window after provider acceptance and before the database records success; stale recovery balances that rare duplicate risk against permanently stranded delivery.

**How to apply:** Use this pattern for any new invoice issuer or retry job. Keep the recipient and issuer on the invoice snapshot, use a generous stale threshold, and never treat provider delivery plus the database status update as an exactly-once transaction.