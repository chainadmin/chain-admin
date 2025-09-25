import { sql } from "drizzle-orm";

type DrizzleDatabase = {
  execute: (query: any) => Promise<any>;
};

let arrangementOptionsSchemaPromise: Promise<void> | null = null;
let documentsSchemaPromise: Promise<void> | null = null;
let tenantSettingsSchemaPromise: Promise<void> | null = null;

const runWithRetryReset = (fn: () => Promise<void>, assign: (value: Promise<void> | null) => void) => {
  return fn().catch(error => {
    assign(null);
    throw error;
  });
};

export function ensureArrangementOptionsSchema(db: DrizzleDatabase): Promise<void> {
  if (!arrangementOptionsSchemaPromise) {
    arrangementOptionsSchemaPromise = runWithRetryReset(async () => {
      await db.execute(sql`
        ALTER TABLE arrangement_options
        ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'range'
      `);

      await db.execute(sql`
        UPDATE arrangement_options
        SET plan_type = 'range'
        WHERE plan_type IS NULL
      `);

      await db.execute(sql`
        ALTER TABLE arrangement_options
        ALTER COLUMN plan_type SET DEFAULT 'range'
      `);

      await db.execute(sql`
        ALTER TABLE arrangement_options
        ALTER COLUMN plan_type SET NOT NULL
      `);

      await db.execute(sql`
        ALTER TABLE arrangement_options
        ADD COLUMN IF NOT EXISTS fixed_monthly_payment bigint
      `);

      await db.execute(sql`
        ALTER TABLE arrangement_options
        ADD COLUMN IF NOT EXISTS pay_in_full_amount bigint
      `);

      await db.execute(sql`
        ALTER TABLE arrangement_options
        ADD COLUMN IF NOT EXISTS payoff_text text
      `);

      await db.execute(sql`
        ALTER TABLE arrangement_options
        ADD COLUMN IF NOT EXISTS custom_terms_text text
      `);

      await db.execute(sql`
        ALTER TABLE arrangement_options
        ADD COLUMN IF NOT EXISTS payoff_percentage_basis_points integer
      `);

      await db.execute(sql`
        ALTER TABLE arrangement_options
        ADD COLUMN IF NOT EXISTS payoff_due_date date
      `);

      await db.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE arrangement_options ALTER COLUMN monthly_payment_min DROP NOT NULL;
        EXCEPTION
          WHEN undefined_column THEN NULL;
        END $$
      `);

      await db.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE arrangement_options ALTER COLUMN monthly_payment_max DROP NOT NULL;
        EXCEPTION
          WHEN undefined_column THEN NULL;
        END $$
      `);

      await db.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE arrangement_options ALTER COLUMN max_term_months DROP NOT NULL;
        EXCEPTION
          WHEN undefined_column THEN NULL;
        END $$
      `);
    }, value => {
      arrangementOptionsSchemaPromise = value;
    });
  }

  return arrangementOptionsSchemaPromise;
}

export function ensureDocumentsSchema(db: DrizzleDatabase): Promise<void> {
  if (!documentsSchemaPromise) {
    documentsSchemaPromise = runWithRetryReset(async () => {
      await db.execute(sql`
        ALTER TABLE documents
        ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE
      `);
    }, value => {
      documentsSchemaPromise = value;
    });
  }

  return documentsSchemaPromise;
}

export function ensureTenantSettingsSchema(db: DrizzleDatabase): Promise<void> {
  if (!tenantSettingsSchemaPromise) {
    tenantSettingsSchemaPromise = runWithRetryReset(async () => {
      await db.execute(sql`
        ALTER TABLE tenant_settings
        ADD COLUMN IF NOT EXISTS sms_throttle_limit bigint DEFAULT 10
      `);

      await db.execute(sql`
        UPDATE tenant_settings
        SET sms_throttle_limit = 10
        WHERE sms_throttle_limit IS NULL
      `);

      await db.execute(sql`
        ALTER TABLE tenant_settings
        ALTER COLUMN sms_throttle_limit SET DEFAULT 10
      `);
    }, value => {
      tenantSettingsSchemaPromise = value;
    });
  }

  return tenantSettingsSchemaPromise;
}

export async function ensureCoreSchema(db: DrizzleDatabase): Promise<void> {
  await ensureTenantSettingsSchema(db);
  await ensureDocumentsSchema(db);
  await ensureArrangementOptionsSchema(db);
}
