# Chain Campus development plan

## Reuse map

| Campus requirement | Existing Chain capability | Approach |
| --- | --- | --- |
| Students and student accounts | Consumers and accounts | Apply module terminology; keep IDs, imports, search, history and APIs. |
| Departments | Account creditor plus tenant scoping | Introduce configurable department directory first; normalize only when department-level authorization requires it. |
| Payment plans and AutoPay | Arrangement options, schedules and recurring processing | Relabel for Campus; do not fork payment logic. |
| Portal, documents, receipts and payment methods | Consumer portal, document service, payments and wallet | Reuse the existing portal and processor abstractions. |
| Staff, roles and logs | Platform users, restricted services and event service | Add authorized-payer and department scopes through the existing permission model. |
| Email and SMS | Template/campaign engines | Seed seven Campus templates rather than introduce a second notification service. |
| Dashboards and reports | Admin dashboard, stats, payments and reporting | Compose Campus and department views from existing tenant-filtered data. |
| Branding | Tenant custom branding and logo upload | Add Campus title and configurable university identity; retain the Chain logo. |

## Gaps and increments

1. **Module foundation (this increment):** register Higher Education terminology and proposal metadata; add tenant-scoped Campus configuration, the Campus workspace, department defaults, notification inventory, and integration interface hooks.
2. **Department authorization:** normalize departments and memberships when row-level department access is implemented; retain university tenant boundaries.
3. **Authorized payer:** add invitations, consented per-student grants, expiration/revocation, and audit events on top of portal authentication and saved payment methods.
4. **Cashiering:** extend manual payments with shifts, receipt/reference metadata, reconciliation/deposit reports, and printable receipts.
5. **Refund center:** add state transitions (pending through completed), approver policy, processor adapters, audit events and notifications.
6. **Portal composition:** expose department charge grouping, statements, payer management and Campus labels through the existing responsive/mobile portal.
7. **Integration adapters:** implement provider adapters behind the settings hooks. Secrets must use the platform secret mechanism and adapters must remain optional.

Each increment must preserve tenant filters, role checks, event logging, notification preferences, processor idempotency, and existing API compatibility.
