---
name: Provider onboarding retries
description: Reliability rules for onboarding that creates tenant-owned resources in external providers.
---

External-provider onboarding must claim work durably, make provider calls outside database transactions, reconcile by deterministic tenant-scoped identity, and persist each secret-bearing resource before creating the next one. A retry must preserve working customer access and repair incomplete `READY` state rather than trusting a label alone.

**Why:** External APIs and database commits cannot share one atomic transaction. A process can stop after the provider accepts creation but before local persistence, and some providers reveal credentials only once. Naive retries can create duplicates, lose unrecoverable secrets, or disable an already-working customer after a failed resend.

**How to apply:** Use stale-recoverable stage claims, provider-side lookup before creation, incremental encrypted persistence, and explicit verification of stored identifiers. Replace one-time-secret resources when their secret is missing, and never clear prior login enablement merely because a retry or resend fails.