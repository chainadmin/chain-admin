import { pool } from './db';

export async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Running database migrations...');
    
    // Add USAePay merchant configuration columns one by one
    console.log('Adding USAePay columns...');
    const usaepayColumns = [
      { name: 'merchant_provider', type: 'TEXT' },
      { name: 'merchant_account_id', type: 'TEXT' },
      { name: 'merchant_api_key', type: 'TEXT' },
      { name: 'merchant_api_pin', type: 'TEXT' },
      { name: 'merchant_name', type: 'TEXT' },
      { name: 'merchant_type', type: 'TEXT' },
      { name: 'use_sandbox', type: 'BOOLEAN', default: 'true' },
      { name: 'enable_online_payments', type: 'BOOLEAN', default: 'false' }
    ];
    
    for (const col of usaepayColumns) {
      try {
        const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
        await client.query(`ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${defaultClause}`);
        console.log(`  ✓ ${col.name}`);
      } catch (err) {
        console.log(`  ⚠ ${col.name} (already exists or error)`);
      }
    }
    
    // Add SMAX integration columns one by one
    console.log('Adding SMAX columns...');
    const smaxColumns = [
      { name: 'smax_enabled', type: 'BOOLEAN', default: 'false' },
      { name: 'smax_api_key', type: 'TEXT' },
      { name: 'smax_pin', type: 'TEXT' },
      { name: 'smax_base_url', type: 'TEXT' }
    ];
    
    for (const col of smaxColumns) {
      try {
        const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
        await client.query(`ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${defaultClause}`);
        console.log(`  ✓ ${col.name}`);
      } catch (err) {
        console.log(`  ⚠ ${col.name} (already exists or error)`);
      }
    }
    
    // Verify columns exist
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'tenant_settings' 
      ORDER BY column_name
    `);
    console.log('\n📋 All tenant_settings columns:', result.rows.map(r => r.column_name).join(', '));
    
    // Check specifically for our new columns
    const newColumns = result.rows.filter(r => 
      ['merchant_api_key', 'merchant_api_pin', 'smax_enabled', 'smax_api_key'].includes(r.column_name)
    );
    console.log('✅ Verified new columns:', newColumns.map(r => r.column_name).join(', '));
    
    console.log('✅ Database migrations completed successfully');
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    // Don't throw - let the app continue even if migrations fail
  } finally {
    client.release();
  }
}
