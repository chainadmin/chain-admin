// This script should be run during deployment to ensure schema is up-to-date
// It should NOT be run on every API request

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('Starting database migration...');

  const client = postgres(process.env.DATABASE_URL, {
    max: 1,
    ssl: 'require',
  });

  const db = drizzle(client);

  try {
    // Align arrangement options columns used by the API
    console.log('Updating arrangement_options table...');
    await db.execute(sql`
      ALTER TABLE "arrangement_options"
        ADD COLUMN IF NOT EXISTS "payoff_percentage_basis_points" integer,
        ADD COLUMN IF NOT EXISTS "payoff_due_date" date
    `);

    // Tenant settings fields for SMS throttling and payments configuration
    console.log('Updating tenant_settings table...');
    await db.execute(sql`
      ALTER TABLE "tenant_settings"
        ADD COLUMN IF NOT EXISTS "sms_throttle_limit" bigint,
        ADD COLUMN IF NOT EXISTS "merchant_provider" text,
        ADD COLUMN IF NOT EXISTS "merchant_account_id" text,
        ADD COLUMN IF NOT EXISTS "merchant_api_key" text,
        ADD COLUMN IF NOT EXISTS "merchant_name" text,
        ADD COLUMN IF NOT EXISTS "enable_online_payments" boolean
    `);

    await db.execute(sql`
      ALTER TABLE "tenant_settings"
        ALTER COLUMN "sms_throttle_limit" SET DEFAULT 10,
        ALTER COLUMN "enable_online_payments" SET DEFAULT false
    `);

    await db.execute(sql`
      UPDATE "tenant_settings"
      SET "sms_throttle_limit" = 10
      WHERE "sms_throttle_limit" IS NULL
    `);

    await db.execute(sql`
      UPDATE "tenant_settings"
      SET "enable_online_payments" = false
      WHERE "enable_online_payments" IS NULL
    `);

    // Communication automations metadata required by the dashboard
    console.log('Updating communication_automations table...');
    await db.execute(sql`
      ALTER TABLE "communication_automations"
        ADD COLUMN IF NOT EXISTS "template_ids" uuid[],
        ADD COLUMN IF NOT EXISTS "template_schedule" jsonb,
        ADD COLUMN IF NOT EXISTS "schedule_day_of_month" text,
        ADD COLUMN IF NOT EXISTS "target_folder_ids" uuid[],
        ADD COLUMN IF NOT EXISTS "target_customer_ids" uuid[],
        ADD COLUMN IF NOT EXISTS "current_template_index" bigint
    `);

    await db.execute(sql`
      ALTER TABLE "communication_automations"
        ALTER COLUMN "current_template_index" SET DEFAULT 0
    `);

    await db.execute(sql`
      UPDATE "communication_automations"
      SET "current_template_index" = 0
      WHERE "current_template_index" IS NULL
    `);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run migration if executed directly
if (require.main === module) {
  migrate();
}