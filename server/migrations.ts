import { pool } from './db';

export async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Running database migrations...');
    
    // Add USAePay merchant configuration columns if they don't exist
    console.log('Adding USAePay columns...');
    await client.query(`
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
    console.log('✓ USAePay columns added');
    
    // Add SMAX integration columns if they don't exist
    console.log('Adding SMAX columns...');
    await client.query(`
      ALTER TABLE tenant_settings 
      ADD COLUMN IF NOT EXISTS smax_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS smax_api_key TEXT,
      ADD COLUMN IF NOT EXISTS smax_pin TEXT,
      ADD COLUMN IF NOT EXISTS smax_base_url TEXT
    `);
    console.log('✓ SMAX columns added');
    
    // Verify columns exist
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'tenant_settings' 
      AND column_name IN ('merchant_api_key', 'merchant_api_pin', 'smax_enabled')
    `);
    console.log('Verified columns:', result.rows.map(r => r.column_name));
    
    console.log('✅ Database migrations completed successfully');
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    // Don't throw - let the app continue even if migrations fail
  } finally {
    client.release();
  }
}
