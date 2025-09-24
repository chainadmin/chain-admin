import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

let db: PostgresJsDatabase | null = null;
let client: ReturnType<typeof postgres> | null = null;
let schemaReady: Promise<void> | null = null;

async function ensureSchema(database: PostgresJsDatabase) {
  // Align arrangement options columns used by the API
  await database.execute(sql`
    ALTER TABLE "arrangement_options"
      ADD COLUMN IF NOT EXISTS "payoff_percentage_basis_points" integer,
      ADD COLUMN IF NOT EXISTS "payoff_due_date" date
  `);

  // Tenant settings fields for SMS throttling and payments configuration
  await database.execute(sql`
    ALTER TABLE "tenant_settings"
      ADD COLUMN IF NOT EXISTS "sms_throttle_limit" bigint,
      ADD COLUMN IF NOT EXISTS "merchant_provider" text,
      ADD COLUMN IF NOT EXISTS "merchant_account_id" text,
      ADD COLUMN IF NOT EXISTS "merchant_api_key" text,
      ADD COLUMN IF NOT EXISTS "merchant_name" text,
      ADD COLUMN IF NOT EXISTS "enable_online_payments" boolean
  `);

  await database.execute(sql`
    ALTER TABLE "tenant_settings"
      ALTER COLUMN "sms_throttle_limit" SET DEFAULT 10,
      ALTER COLUMN "enable_online_payments" SET DEFAULT false
  `);

  await database.execute(sql`
    UPDATE "tenant_settings"
    SET "sms_throttle_limit" = 10
    WHERE "sms_throttle_limit" IS NULL
  `);

  await database.execute(sql`
    UPDATE "tenant_settings"
    SET "enable_online_payments" = false
    WHERE "enable_online_payments" IS NULL
  `);

  // Communication automations metadata required by the dashboard
  await database.execute(sql`
    ALTER TABLE "communication_automations"
      ADD COLUMN IF NOT EXISTS "template_ids" uuid[],
      ADD COLUMN IF NOT EXISTS "template_schedule" jsonb,
      ADD COLUMN IF NOT EXISTS "schedule_day_of_month" text,
      ADD COLUMN IF NOT EXISTS "target_folder_ids" uuid[],
      ADD COLUMN IF NOT EXISTS "target_customer_ids" uuid[],
      ADD COLUMN IF NOT EXISTS "current_template_index" bigint
  `);

  await database.execute(sql`
    ALTER TABLE "communication_automations"
      ALTER COLUMN "current_template_index" SET DEFAULT 0
  `);

  await database.execute(sql`
    UPDATE "communication_automations"
    SET "current_template_index" = 0
    WHERE "current_template_index" IS NULL
  `);
}

export async function getDb(): Promise<PostgresJsDatabase> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Reuse connection in serverless environment
  if (!db) {
    client = postgres(process.env.DATABASE_URL, {
      max: 1,
      ssl: 'require',
      idle_timeout: 20,
      max_lifetime: 60 * 2,
      connect_timeout: 10
    });

    db = drizzle(client);
  }

  if (!schemaReady) {
    schemaReady = ensureSchema(db).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;

  return db;
}