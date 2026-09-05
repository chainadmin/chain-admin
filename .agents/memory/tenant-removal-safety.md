---
name: Tenant removal safety
description: Durable safety rules for deleting, archiving, or deactivating one product on a tenant.
---

Permanent deletion is only for targets with no retained legal, billing, communication, consent, call, provider, or operational history. Converted customers are archived, while dual-product tenants lose only the selected product. Every authenticated entry point must carry or intentionally define product context so stale sessions lose the removed product without losing the surviving one.

**Why:** Tenant deletion spans database evidence, stateless JWTs, shared product entitlements, and external providers. A database-only delete can erase evidence, leave old tokens usable, or disable the wrong product.

**How to apply:** Capture a tenant-independent pending audit before the destructive transaction; re-lock the target, preflight fingerprint, and administrator credential version before mutation; keep provider/object work post-commit in retryable tasks whose lease token/version fences stale workers; treat provider operations as idempotent and retain uncertain resources.