---
name: Tenant removal safety
description: Durable safety rules for deleting, archiving, or deactivating one product on a tenant.
---

Permanent deletion normally applies only to targets with no retained history. Global Admin may explicitly force-purge a test company and all products despite operational history, but finalized signed legal records always block the purge. Converted customers are otherwise archived, while dual-product tenants otherwise lose only the selected product. Every authenticated entry point must carry or intentionally define product context so stale sessions lose the removed product without losing the surviving one.

**Why:** Global Admin needs to remove populated test companies, while legal evidence must remain immutable. Tenant deletion spans database evidence, stateless JWTs, shared product entitlements, and external providers; a database-only delete can erase protected evidence, leave old tokens usable, or disable the wrong product.

**How to apply:** Force purge requires a separate explicit choice, irreversible confirmation phrase, exact target name, reason, and current Global Admin password. Capture a tenant-independent pending audit before the destructive transaction; re-lock the target, preflight fingerprint, and administrator credential version before mutation; keep provider/object work post-commit in retryable tasks whose lease token/version fences stale workers; treat provider operations as idempotent and retain uncertain resources.