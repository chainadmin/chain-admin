import { pool } from './db';

export async function runMigrations() {
  let client;
  
  try {
    client = await pool.connect();
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
      { name: 'enable_online_payments', type: 'BOOLEAN', default: 'false' },
      { name: 'minimum_monthly_payment', type: 'INTEGER', default: '5000' }
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
    
    // Add business_type column for multi-module architecture
    console.log('Adding business type column...');
    try {
      await client.query(`ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'call_center'`);
      console.log(`  ✓ business_type`);
    } catch (err) {
      console.log(`  ⚠ business_type (already exists or error)`);
    }
    
    // Add enabled_addons column for addon billing
    console.log('Adding enabled_addons column...');
    try {
      await client.query(`ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS enabled_addons TEXT[] DEFAULT ARRAY[]::TEXT[]`);
      console.log(`  ✓ enabled_addons`);
    } catch (err) {
      console.log(`  ⚠ enabled_addons (already exists or error)`);
    }
    
    // Add blocked_account_statuses column for controlling communications and payments
    console.log('Adding blocked_account_statuses column...');
    try {
      await client.query(`ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS blocked_account_statuses TEXT[] DEFAULT ARRAY['inactive', 'recalled', 'closed']::TEXT[]`);
      console.log(`  ✓ blocked_account_statuses`);
    } catch (err) {
      console.log(`  ⚠ blocked_account_statuses (already exists or error)`);
    }
    
    // Add settlement payment terms columns to arrangement_options
    console.log('Adding settlement payment terms columns...');
    try {
      await client.query(`ALTER TABLE arrangement_options ADD COLUMN IF NOT EXISTS settlement_payment_count INTEGER`);
      console.log(`  ✓ settlement_payment_count`);
    } catch (err) {
      console.log(`  ⚠ settlement_payment_count (already exists or error)`);
    }
    
    try {
      await client.query(`ALTER TABLE arrangement_options ADD COLUMN IF NOT EXISTS settlement_payment_frequency TEXT`);
      console.log(`  ✓ settlement_payment_frequency`);
    } catch (err) {
      console.log(`  ⚠ settlement_payment_frequency (already exists or error)`);
    }
    
    try {
      await client.query(`ALTER TABLE arrangement_options ADD COLUMN IF NOT EXISTS settlement_offer_expires_date DATE`);
      console.log(`  ✓ settlement_offer_expires_date`);
    } catch (err) {
      console.log(`  ⚠ settlement_offer_expires_date (already exists or error)`);
    }
    
    // Fix communication_automations table - make trigger_type nullable (legacy column)
    console.log('Fixing communication_automations table...');
    try {
      // Make trigger_type nullable if it exists
      await client.query(`ALTER TABLE communication_automations ALTER COLUMN trigger_type DROP NOT NULL`);
      console.log(`  ✓ trigger_type made nullable`);
    } catch (err) {
      console.log(`  ⚠ trigger_type (column may not exist or already nullable)`);
    }
    
    // Remove other legacy columns if they exist
    const legacyAutomationColumns = [
      'automation_type',
      'trigger_event', 
      'delay_value',
      'delay_unit',
      'recurrence_pattern',
      'recurrence_end_date',
      'sequence_schedule'
    ];
    
    for (const col of legacyAutomationColumns) {
      try {
        await client.query(`ALTER TABLE communication_automations DROP COLUMN IF EXISTS ${col}`);
        console.log(`  ✓ Dropped legacy column: ${col}`);
      } catch (err) {
        // Silently ignore - column may not exist
      }
    }
    
    // Add missing SMS campaigns column
    console.log('Updating SMS campaigns table...');
    try {
      await client.query(`ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS send_to_all_numbers BOOLEAN DEFAULT false`);
      console.log(`  ✓ send_to_all_numbers column added`);
    } catch (err) {
      console.log(`  ⚠ send_to_all_numbers (already exists or error)`);
    }
    
    // Create communication_sequences table if it doesn't exist
    console.log('Creating communication_sequences table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS communication_sequences (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          is_active BOOLEAN DEFAULT true,
          trigger_type TEXT NOT NULL,
          trigger_event TEXT,
          trigger_delay INTEGER,
          target_type TEXT NOT NULL,
          target_folder_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
          target_consumer_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
          total_enrolled INTEGER DEFAULT 0,
          total_completed INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log(`  ✓ communication_sequences table created`);
    } catch (err) {
      console.log(`  ⚠ communication_sequences table (already exists or error)`);
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
    
    // Fix subscriptions table structure to match schema
    console.log('Updating subscriptions table structure...');
    const subscriptionColumns = [
      { name: 'plan_id', type: 'UUID' },
      { name: 'approved_by', type: 'TEXT' },
      { name: 'approved_at', type: 'TIMESTAMP' },
      { name: 'setup_fee_waived', type: 'BOOLEAN', default: 'false' },
      { name: 'setup_fee_paid_at', type: 'TIMESTAMP' },
      { name: 'requested_by', type: 'TEXT' },
      { name: 'requested_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
      { name: 'rejection_reason', type: 'TEXT' },
      { name: 'emails_used_this_period', type: 'INTEGER', default: '0' },
      { name: 'sms_used_this_period', type: 'INTEGER', default: '0' },
      { name: 'current_period_start', type: 'TIMESTAMP' },
      { name: 'current_period_end', type: 'TIMESTAMP' }
    ];
    
    for (const col of subscriptionColumns) {
      try {
        const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
        await client.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${defaultClause}`);
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

    // Update SMS campaigns table for folder filtering and approval workflow
    console.log('Updating SMS campaigns table...');
    try {
      // Add folder_ids array column if it doesn't exist
      await client.query(`
        ALTER TABLE sms_campaigns 
        ADD COLUMN IF NOT EXISTS folder_ids text[] DEFAULT ARRAY[]::text[]
      `);
      console.log('  ✓ folder_ids column added');
    } catch (err) {
      console.log('  ⚠ folder_ids column (already exists or error)');
    }

    try {
      // Update status column default to 'pending_approval'
      await client.query(`
        ALTER TABLE sms_campaigns 
        ALTER COLUMN status SET DEFAULT 'pending_approval'
      `);
      console.log('  ✓ status default changed to pending_approval');
    } catch (err) {
      console.log('  ⚠ status default (already set or error)');
    }

    try {
      // Update existing campaigns with 'pending' status to 'pending_approval'
      const updateResult = await client.query(`
        UPDATE sms_campaigns 
        SET status = 'pending_approval' 
        WHERE status = 'pending' 
          AND (total_sent = 0 OR total_sent IS NULL)
      `);
      if (updateResult.rowCount && updateResult.rowCount > 0) {
        console.log(`  ✓ Updated ${updateResult.rowCount} existing campaign(s) to pending_approval status`);
      } else {
        console.log('  ✓ No existing campaigns needed status update');
      }
    } catch (err) {
      console.log('  ⚠ Could not update existing campaign statuses');
    }

    // Add tenant_id to sms_tracking table for multi-tenant SMS billing
    console.log('Adding tenant_id to sms_tracking table...');
    try {
      await client.query(`
        ALTER TABLE sms_tracking 
        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE
      `);
      console.log('  ✓ tenant_id column added to sms_tracking (nullable for now)');
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        console.log('  ✓ tenant_id column already exists');
      } else {
        console.log('  ⚠ tenant_id column error:', err.message);
      }
    }

    // Add segments column to sms_tracking table for Twilio webhook tracking
    console.log('Adding segments column to sms_tracking table...');
    try {
      await client.query(`
        ALTER TABLE sms_tracking 
        ADD COLUMN IF NOT EXISTS segments INTEGER DEFAULT 1
      `);
      console.log('  ✓ segments column added to sms_tracking');
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        console.log('  ✓ segments column already exists');
      } else {
        console.log('  ⚠ segments column error:', err.message);
      }
    }

    // Update push_devices table to support native FCM/APNS tokens
    console.log('Updating push_devices table for native push notifications...');
    const pushDeviceColumns = [
      { name: 'push_token', type: 'TEXT' },
      { name: 'platform', type: 'TEXT' },
      { name: 'updated_at', type: 'TIMESTAMP', default: 'NOW()' }
    ];
    
    for (const col of pushDeviceColumns) {
      try {
        const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
        await client.query(`ALTER TABLE push_devices ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${defaultClause}`);
        console.log(`  ✓ ${col.name}`);
      } catch (err) {
        console.log(`  ⚠ ${col.name} (already exists or error)`);
      }
    }
    
    // Make expo_token nullable since we now support native tokens
    try {
      await client.query(`ALTER TABLE push_devices ALTER COLUMN expo_token DROP NOT NULL`);
      console.log('  ✓ expo_token made nullable');
    } catch (err) {
      console.log('  ⚠ expo_token nullable (already set or error)');
    }

    // Add SMAX sync tracking to payment_schedules
    console.log('Adding SMAX sync columns to payment_schedules...');
    const paymentScheduleColumns = [
      { name: 'source', type: 'TEXT', default: "'chain'" },
      { name: 'smax_synced', type: 'BOOLEAN', default: 'false' },
      { name: 'processor', type: 'TEXT', default: "'chain'" },
      { name: 'smax_arrangement_id', type: 'TEXT' },
      { name: 'smax_last_sync_at', type: 'TIMESTAMP' },
      { name: 'smax_next_payment_date', type: 'DATE' },
      { name: 'smax_expected_amount_cents', type: 'BIGINT' },
      { name: 'smax_status', type: 'TEXT' },
      { name: 'last_failure_reason', type: 'TEXT' }
    ];
    
    for (const col of paymentScheduleColumns) {
      try {
        const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
        await client.query(`ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${defaultClause}`);
        console.log(`  ✓ ${col.name}`);
      } catch (err) {
        console.log(`  ⚠ ${col.name} (already exists or error)`);
      }
    }
    
    // Create document signing tables
    console.log('Creating document signing tables...');
    
    // Create invoices table if it doesn't exist
    console.log('Creating invoices table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS invoices (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
          invoice_number VARCHAR NOT NULL UNIQUE,
          status VARCHAR DEFAULT 'pending',
          period_start TIMESTAMP NOT NULL,
          period_end TIMESTAMP NOT NULL,
          base_amount_cents BIGINT NOT NULL,
          per_consumer_cents BIGINT NOT NULL,
          consumer_count BIGINT NOT NULL,
          total_amount_cents BIGINT NOT NULL,
          due_date TIMESTAMP NOT NULL,
          paid_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ invoices table');
    } catch (err) {
      console.log('  ⚠ invoices (already exists)');
    }

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS signature_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          consumer_id UUID NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
          document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
          status VARCHAR NOT NULL DEFAULT 'pending',
          expires_at TIMESTAMP NOT NULL,
          message TEXT,
          consent_text TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          signed_at TIMESTAMP
        )
      `);
      console.log('  ✓ signature_requests table');
    } catch (err) {
      console.log('  ⚠ signature_requests (already exists)');
    }
    
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS signed_documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          signature_request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
          consumer_id UUID NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
          signature_data TEXT NOT NULL,
          ip_address VARCHAR,
          user_agent TEXT,
          signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ signed_documents table');
    } catch (err) {
      console.log('  ⚠ signed_documents (already exists)');
    }
    
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS signature_audit_trail (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          signature_request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
          event_type VARCHAR NOT NULL,
          event_data JSONB,
          ip_address VARCHAR,
          user_agent TEXT,
          occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ signature_audit_trail table');
    } catch (err) {
      console.log('  ⚠ signature_audit_trail (already exists)');
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
  } catch (error: any) {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('⚠️  Database not accessible (probably dev environment) - skipping migrations');
    } else {
      console.error('❌ Database migration failed:', error);
    }
    // Don't throw - let the app continue even if migrations fail
  } finally {
    if (client) {
      client.release();
    }
  }
}
