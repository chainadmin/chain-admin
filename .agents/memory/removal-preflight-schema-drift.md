---
name: Removal preflight schema drift
description: Compatibility and error-boundary rules for tenant removal dependency counts.
---

Removal preflight dependency counts must never reference an optional history relation until its existence has been confirmed. Request handlers around these counts must catch transaction failures and return safe JSON stating that no changes were made.

**Why:** The externally managed production database can legitimately omit an optional history table. An unconditional count in an Express async handler rejected before a response was sent, surfacing as a gateway error and temporarily affecting unrelated public flows.

**How to apply:** Whenever a removal dependency category is added, verify its production relation and columns, use a presence probe for optional schema, retain conservative blocking for evidence that does exist, and regression-test both present and absent relation cases.