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
    
    // Add missing tenants table columns for trial and service controls
    console.log('Adding tenants table service control columns...');
    const tenantColumns = [
      { name: 'is_trial_account', type: 'BOOLEAN', default: 'true' },
      { name: 'email_service_enabled', type: 'BOOLEAN', default: 'true' },
      { name: 'sms_service_enabled', type: 'BOOLEAN', default: 'true' },
      { name: 'portal_access_enabled', type: 'BOOLEAN', default: 'true' },
      { name: 'payment_processing_enabled', type: 'BOOLEAN', default: 'true' }
    ];
    
    for (const col of tenantColumns) {
      try {
        const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
        await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${defaultClause}`);
        console.log(`  ✓ ${col.name}`);
      } catch (err) {
        console.log(`  ⚠ ${col.name} (already exists or error)`);
      }
    }
    
    // Fix any tenants with approved subscriptions still in trial mode
    console.log('Fixing trial status for tenants with active subscriptions...');
    try {
      const fixResult = await client.query(`
        UPDATE tenants t
        SET is_trial_account = false
        FROM subscriptions s
        WHERE s.tenant_id = t.id 
          AND s.status = 'active'
          AND t.is_trial_account = true
      `);
      if (fixResult.rowCount && fixResult.rowCount > 0) {
        console.log(`  ✓ Fixed ${fixResult.rowCount} tenant(s) with active subscriptions`);
      } else {
        console.log('  ✓ No tenants needed fixing');
      }
    } catch (err) {
      console.log('  ⚠ Could not fix trial status:', err);
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
