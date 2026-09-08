---
name: Chiamo product boundary
description: Product ownership and direct credential delivery decisions for Chiamo versus Chain.
---

Chiamo is exclusively the VoIP product. Email and text messaging belong to Chain;
do not expand Chiamo's onboarding, login requirements, or offerings to messaging
because the underlying infrastructure is shared.

**Why:** The product owner explicitly rejected email/SMS provisioning and email
invitations as prerequisites for Chiamo phone access. A provider failure in
unrelated messaging must not strand a phone customer.

**How to apply:** Keep provider readiness separate from login authorization,
preserve deliberate account and billing restrictions, and preserve historical
messaging resources and invoices. Deliver customer access through a
Global-Admin-generated, one-time temporary password, not a recoverable password
or an emailed invitation.