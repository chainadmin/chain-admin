---
name: Provider-retained calls
description: Reliability and isolation rules for live calls redirected to hold or park treatment.
---

Any feature that redirects a live provider call away from its active agent must persist the retained leg in shared, tenant-scoped storage, use an expiry, and atomically claim resume or pickup.

**Why:** Process-local state is lost on restart and diverges across instances, which can leave a real caller hearing looping music with no retrievable record. Non-atomic pickup also lets two agents race for the same call.

**How to apply:** Use this rule for hold, park, queues, transfers, or any future call treatment that keeps the provider leg alive after the initiating request ends. Verify the submitted active leg belongs to the authenticated tenant-bound user before redirecting it.