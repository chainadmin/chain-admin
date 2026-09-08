---
name: Provider-retained calls
description: Reliability and isolation rules for live calls redirected to hold or park treatment.
---

Any feature that redirects a live provider call away from its active agent must persist the retained leg in shared, tenant-scoped storage, use an expiry, and atomically claim resume or pickup.

**Why:** Process-local state is lost on restart and diverges across instances, which can leave a real caller hearing looping music with no retrievable record. Non-atomic pickup also lets two agents race for the same call.

**How to apply:** Use this rule for hold, park, queues, transfers, or any future call treatment that keeps the provider leg alive after the initiating request ends. Verify the submitted active leg belongs to the authenticated tenant-bound user before redirecting it.

Do not cancel a reconnect by redirecting the retained parent back to music while its new agent leg may be answering.

**Why:** A database claim cannot fence an asynchronous Twilio REST update. An answer callback can complete the claim before a previously authorized music redirect takes effect, hiding a live caller on hold. Provider acceptance of a redirect also does not prove that the browser joined.

**How to apply:** Let a bounded Dial attempt and its signed outcome resolve cancellation; an actual answer wins. Interpret Dial action results using the child dial outcome, not the still-running parent's call status.

Treat browser acceptance as asynchronous, and preserve bounded diagnostic context across terminal events.

**Why:** Twilio's browser SDK can emit disconnect before its microphone-acquisition error. Clearing all call context at disconnect loses the actionable error; accepting a call is not the same as receiving its accept event.

**How to apply:** Test both event orders and late cancellation results. Preserve same-call diagnostics without letting an old call's events change a newer call or session.