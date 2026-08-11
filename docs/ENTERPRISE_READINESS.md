# Enterprise readiness: 500,000 contacts, tenant seats, and Postmark

## Contact access and campaigns

`GET /api/consumers` is database-paginated. It accepts `limit` (maximum 500), `cursor`, `search`, `folderId`, `registration`, and `format=page`. Page responses contain `items`, `nextCursor`, and `total`; compatibility array responses also expose `X-Total-Count` and `X-Next-Cursor`.

Email campaign approval returns HTTP 202 after billing reservation. The worker selects at most 500 eligible consumers, selects accounts only for those consumer IDs, builds and submits that Postmark batch, persists progress, and advances by the consumer UUID cursor. It never constructs the complete campaign audience or email payload array.

### Reproducible 500,000-row database check

Run against a disposable PostgreSQL database after migrations:

```bash
DATABASE_URL=postgresql://... npm run load-test:500k -- --seed
DATABASE_URL=postgresql://... npm run load-test:500k
```

The seed command creates a dedicated load-test tenant and 500,000 synthetic contacts with `generate_series`. The check performs indexed first-page, cursor-page, folder-filter, and case-insensitive email-search queries; prints `EXPLAIN (ANALYZE, BUFFERS)` output and timings; and fails if a page exceeds 500 rows. Remove the tenant with `--cleanup`.

Run the in-process bounded-memory campaign simulation with `npm test`; it processes 500,000 IDs and asserts that the largest resident campaign batch is 500.

## Tenant user capacity

`tenants.max_active_users` is the total number of concurrently active owner and non-owner credentials. The default of 2 preserves the previous owner-plus-one-team-member behavior. A platform administrator can raise a tenant to 66 or above:

```http
PATCH /api/admin/tenants/{tenantId}/enterprise-config
Content-Type: application/json

{"maxActiveUsers":100}
```

Only active users consume seats. Creation and reactivation enforce the configured value. Existing roles, service restrictions, owner-only management, authentication, and tenant-ID checks remain unchanged.

## Postmark configuration map

* `POSTMARK_ACCOUNT_TOKEN`: account-level administrative token used only by `server/postmarkServerService.ts` to list/create Postmark servers.
* `POSTMARK_SERVER_TOKEN`: global fallback sending token validated during server startup.
* `tenants.postmark_server_id`, `postmark_server_name`, and `postmark_server_token`: tenant-specific Postmark server identity and write-only sending credential.
* `tenants.postmark_transactional_stream` and `postmark_broadcast_stream`: tenant-specific stream IDs, falling back to `POSTMARK_TRANSACTIONAL_STREAM`/`POSTMARK_BROADCAST_STREAM`, then `outbound`/`broadcast`.
* `tenants.custom_sender_email`: tenant From address. It must already be covered by a verified Postmark sender signature or authenticated sending domain.
* `tenants.postmark_inbound_address`: tenant Reply-To/inbound address, falling back to `POSTMARK_INBOUND_EMAIL` and then the legacy Chain inbound address.

The enterprise-config endpoint can set these fields. It returns only `hasPostmarkServerToken`, never the token itself. Single and bulk sends select the tenant token and streams, so assigning a separate Postmark server (and a provider-managed dedicated IP) to one municipal tenant does not route other tenants through it.

Chain does **not** provision or claim dedicated IPs. A Postmark administrator must provision/assign the IP to the tenant's Postmark server, verify the sender domain/signature, configure DNS (DKIM and return-path), configure streams/inbound processing, and conduct provider-recommended IP warming and reputation monitoring.

## Operational risks

The current background campaign runner is in-process. Cursor batching bounds memory, but production should use a durable queue/worker so a deployment or crash cannot interrupt work. Postmark throughput and billing limits, PostgreSQL sizing, connection-pool sizing, backup/restore time, import throughput, and municipal retention/security requirements must be validated in the target environment.
