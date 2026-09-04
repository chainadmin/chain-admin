---
name: Cross-product account linking
description: Security rules for attaching another product to an existing company and shared login.
---

Public signup may identify an existing company through normalized business name and email, but that match must never authorize credential creation, replacement, or product activation.

**Why:** Company names and business email addresses are often public. Treating a match as proof of ownership creates an account-takeover path, especially when products share a tenant and owner credential.

**How to apply:** Serialize identity matching to prevent duplicate tenants, then require control of the existing owner account or a high-entropy, expiring, single-use verification sent to the stored owner address. Apply credential changes and product activation atomically only after verification.