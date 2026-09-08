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

Any browser feature that queues inbound calls while another call is active must explicitly enable the provider SDK's busy-device incoming-call option.

**Why:** Twilio Voice SDK defaults to dropping incoming invites before the application receives an event whenever the Device already has an active call. A correct application queue is otherwise unreachable in production.

**How to apply:** Keep the busy-device option enabled in shared Device configuration and cover it at the Device-options boundary, in addition to testing the application lifecycle with fake calls.

Synchronize per-call media state whenever a replacement provider leg becomes active; UI state alone is not authoritative across call objects.

**Why:** A newly accepted Twilio Call starts unmuted even when the prior Call and the softphone UI were muted, creating a privacy-sensitive mismatch during end-and-answer handoffs.

**How to apply:** Apply the displayed mute state directly to every newly active Call before presenting it as connected. Defer ended-call UI cleanup while a replacement leg is accepting, and test both slow success and failure.

Do not expose a cancel action during provider acceptance unless it terminates and fences the exact accepting leg.

**Why:** Merely returning the UI to idle leaves the provider leg alive; a late accept can connect after the user thinks it was canceled and can race a new outbound call.

**How to apply:** Either implement exact-leg cancellation with late-event fencing, or show a non-cancelable connecting state and block outbound initiation until acceptance resolves.