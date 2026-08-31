---
name: Signed legal records
description: Integrity and retention rules for completed consumer e-sign documents.
---

Completed e-sign documents are legal records. Store the finalized self-contained artifact, verify its content hash on every access path, and prevent ordinary account, consumer, or cleanup deletion from cascading into the completed record.

**Why:** Re-rendering from a mutable source can produce content different from what the consumer signed, while normal cascade deletion can silently destroy the only authoritative copy.

**How to apply:** Any signing-state change must be a conditional transaction against the current status and expiration. Consumer and admin downloads must serve the same finalized artifact. New deletion or cleanup paths must explicitly retain completed signed records.