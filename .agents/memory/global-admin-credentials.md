---
name: Global Admin credentials
description: Security invariants for privileged bootstrap credentials, session invalidation, and brute-force controls.
---

Bootstrap credentials must be one-time access only: require strong values at creation, mark them for rotation, and enforce that rotation on the server before permitting any privileged operation.

**Why:** A client-only password-change dialog can be bypassed with direct API calls, and a bootstrap secret may otherwise become a permanent privileged credential.

**How to apply:** Allow a bootstrap-authenticated session to call only the password-change operation until rotation succeeds. Never rely on UI state as an authorization gate.

Privileged credential sessions must carry a credential version that is checked against shared state on every protected request; password changes increment that version atomically.

**Why:** Changing a password without versioning leaves previously issued privileged tokens valid.

**How to apply:** Reject missing, stale, or mismatched versions and use a conditional update so concurrent password changes cannot overwrite one another.

Login throttling for privileged credentials must reserve attempts atomically in shared storage before password verification.

**Why:** Process-local counters reset and diverge across instances, while read-then-increment logic lets concurrent bursts exceed the intended limit.

**How to apply:** Use a shared expiring counter, reserve each attempt in one atomic operation before bcrypt work, and clear it only after successful authentication.