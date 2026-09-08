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
messaging resources and invoices. Phone-user access must not depend on an emailed
invitation or a fabricated email address.

Company-created phone users use company-selected passwords and optional email.
Owners may explicitly replace their non-owner users' passwords. Do not generate
temporary passwords for these company-managed actions or force a first-login
password change on a company-selected password.

**Why:** The product owner explicitly superseded automatic generated credentials
for company-managed users on 2026-09-08, while retaining Global Admin recovery and
the existing initial company-owner onboarding policy.

**How to apply:** Keep Global Admin's temporary-password recovery available, with
its required password-change restriction. Never mass-reset existing users or
remove their deliberate calling restrictions when changing credential policy.

Legacy disabled-login flags are ambiguous: they represented both unfinished
invitation delivery and deliberate administrator restrictions. Preserve them
until a Global Admin explicitly reviews and enables login.

**Why:** Treating every legacy false value as a provider-only block can silently
reopen an account that an administrator intentionally restricted.

**How to apply:** Preserve the restriction during migration, provide an explicit
review/enable action, and make reconciliation one-time so later startups do not
undo the administrator's decision.