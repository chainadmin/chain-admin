import { db } from './db';
import { sql } from 'drizzle-orm';

export async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');
    
    // Add USAePay merchant configuration columns if they don't exist
    await db.execute(sql`
      ALTER TABLE tenant_settings 
      ADD COLUMN IF NOT EXISTS merchant_provider TEXT,
      ADD COLUMN IF NOT EXISTS merchant_account_id TEXT,
      ADD COLUMN IF NOT EXISTS merchant_api_key TEXT,
      ADD COLUMN IF NOT EXISTS merchant_api_pin TEXT,
      ADD COLUMN IF NOT EXISTS merchant_name TEXT,
      ADD COLUMN IF NOT EXISTS merchant_type TEXT,
      ADD COLUMN IF NOT EXISTS use_sandbox BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS enable_online_payments BOOLEAN DEFAULT false
    `);
    
    // Add SMAX integration columns if they don't exist
    await db.execute(sql`
      ALTER TABLE tenant_settings 
      ADD COLUMN IF NOT EXISTS smax_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS smax_api_key TEXT,
      ADD COLUMN IF NOT EXISTS smax_pin TEXT,
      ADD COLUMN IF NOT EXISTS smax_base_url TEXT
    `);
    
    console.log('✅ Database migrations completed successfully');
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    // Don't throw - let the app continue even if migrations fail
  }
}
