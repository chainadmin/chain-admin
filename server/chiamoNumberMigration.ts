import { sql } from "drizzle-orm";
import { db } from "./db";

/** Called by startup integration; kept separate so this feature owns its durable state. */
export async function migrateChiamoNumberPurchases() {
  await db.execute(sql`
    create table if not exists chiamo_number_purchase_claims (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      idempotency_key text not null,
      phone_number text not null,
      number_type text not null,
      status text not null default 'CLAIMED',
      claim_token uuid not null default gen_random_uuid(),
      twilio_phone_sid text,
      result_number_id uuid,
      error_message text,
      created_at timestamp not null default now(),
      updated_at timestamp not null default now(),
      unique (tenant_id, idempotency_key)
    )
  `);
  await db.execute(sql`alter table chiamo_number_purchase_claims add column if not exists claim_token uuid not null default gen_random_uuid()`);
  await db.execute(sql`create index if not exists chiamo_number_purchase_claims_tenant_idx on chiamo_number_purchase_claims (tenant_id, updated_at desc)`);
  await db.execute(sql`create unique index if not exists chiamo_number_purchase_claims_tenant_number_idx on chiamo_number_purchase_claims (tenant_id, phone_number)`);
}