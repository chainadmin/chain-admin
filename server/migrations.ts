import { pool } from './db';

export async function runMigrations() {
  let client;
  
  try {
    client = await pool.connect();
    console.log('🔄 Running database migrations...');
    
    // Add payment processor columns (USAePay, Authorize.net, and NMI)
    console.log('Adding payment processor columns...');
    const paymentProcessorColumns = [
      { name: 'merchant_provider', type: 'TEXT' },
      { name: 'merchant_account_id', type: 'TEXT' },
      { name: 'merchant_api_key', type: 'TEXT' },
      { name: 'merchant_api_pin', type: 'TEXT' },
      { name: 'merchant_name', type: 'TEXT' },
      { name: 'merchant_type', type: 'TEXT' },
      { name: 'authnet_api_login_id', type: 'TEXT' },
      { name: 'authnet_transaction_key', type: 'TEXT' },
      { name: 'authnet_public_client_key', type: 'TEXT' },
      { name: 'nmi_security_key', type: 'TEXT' },
      { name: 'use_sandbox', type: 'BOOLEAN', default: 'true' },
      { name: 'enable_online_payments', type: 'BOOLEAN', default: 'false' },
      { name: 'minimum_monthly_payment', type: 'INTEGER', default: '5000' }
    ];
    
    for (const col of paymentProcessorColumns) {
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
      await client.query(`ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS blocked_account_statuses TEXT[] DEFAULT ARRAY[]::TEXT[]`);
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
    
    // Migrate settlement_payment_count to settlement_payment_counts array
    console.log('Migrating settlement_payment_count to settlement_payment_counts array...');
    try {
      // First, add the new array column
      await client.query(`ALTER TABLE arrangement_options ADD COLUMN IF NOT EXISTS settlement_payment_counts INTEGER[]`);
      
      // Migrate existing data: convert single values to arrays
      await client.query(`
        UPDATE arrangement_options 
        SET settlement_payment_counts = ARRAY[settlement_payment_count]
        WHERE settlement_payment_count IS NOT NULL 
          AND (settlement_payment_counts IS NULL OR settlement_payment_counts = '{}')
      `);
      
      // Drop the old column
      await client.query(`ALTER TABLE arrangement_options DROP COLUMN IF EXISTS settlement_payment_count`);
      
      console.log(`  ✓ settlement_payment_counts (migrated from settlement_payment_count)`);
    } catch (err) {
      console.log(`  ⚠ settlement_payment_counts migration (error):`, err);
    }
    
    // Add balance_tier column to arrangement_options for tier-based payment plans
    console.log('Adding balance_tier column to arrangement_options...');
    try {
      await client.query(`ALTER TABLE arrangement_options ADD COLUMN IF NOT EXISTS balance_tier TEXT`);
      console.log(`  ✓ balance_tier`);
    } catch (err) {
      console.log(`  ⚠ balance_tier (already exists or error)`);
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
    
    // Add phones_to_send column to SMS campaigns (1, 2, 3, or all)
    console.log('Adding phones_to_send to SMS campaigns...');
    try {
      await client.query(`ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS phones_to_send TEXT DEFAULT '1'`);
      console.log(`  ✓ phones_to_send column added to sms_campaigns`);
    } catch (err) {
      console.log(`  ⚠ phones_to_send (already exists or error)`);
    }
    
    // Add phones_to_send column to communication_automations (1, 2, 3, or all)
    console.log('Adding phones_to_send to communication_automations...');
    try {
      await client.query(`ALTER TABLE communication_automations ADD COLUMN IF NOT EXISTS phones_to_send TEXT DEFAULT '1'`);
      console.log(`  ✓ phones_to_send column added to communication_automations`);
    } catch (err) {
      console.log(`  ⚠ phones_to_send (already exists or error)`);
    }
    
    // Add next_execution column to communication_automations (used by automation processor)
    console.log('Adding next_execution to communication_automations...');
    try {
      await client.query(`ALTER TABLE communication_automations ADD COLUMN IF NOT EXISTS next_execution TIMESTAMP`);
      console.log(`  ✓ next_execution column added to communication_automations`);
    } catch (err) {
      console.log(`  ⚠ next_execution (already exists or error)`);
    }
    
    // Backfill next_execution from scheduled_date for existing automations
    console.log('Backfilling next_execution for existing automations...');
    try {
      const result = await client.query(`
        UPDATE communication_automations 
        SET next_execution = scheduled_date 
        WHERE next_execution IS NULL AND scheduled_date IS NOT NULL AND is_active = true
      `);
      console.log(`  ✓ Backfilled next_execution for ${result.rowCount || 0} automations`);
    } catch (err) {
      console.log(`  ⚠ next_execution backfill (error or no data)`);
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
    
    // Add plan_id column to communication_sequences for plan-based sequence organization
    console.log('Adding plan_id to communication_sequences...');
    try {
      await client.query(`ALTER TABLE communication_sequences ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT 'launch'`);
      console.log(`  ✓ plan_id column added to communication_sequences`);
    } catch (err) {
      console.log(`  ⚠ plan_id (already exists or error)`);
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

    // Add last_sent_index column to sms_campaigns for resume functionality
    console.log('Adding last_sent_index column to sms_campaigns...');
    try {
      await client.query(`
        ALTER TABLE sms_campaigns 
        ADD COLUMN IF NOT EXISTS last_sent_index BIGINT DEFAULT 0
      `);
      console.log('  ✓ last_sent_index column added to sms_campaigns');
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        console.log('  ✓ last_sent_index column already exists');
      } else {
        console.log('  ⚠ last_sent_index column error:', err.message);
      }
    }

    // Add SMS opt-out tracking to consumers table
    console.log('Adding SMS opt-out columns to consumers table...');
    try {
      await client.query(`
        ALTER TABLE consumers 
        ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN DEFAULT false
      `);
      console.log('  ✓ sms_opted_out column added to consumers');
    } catch (err: any) {
      console.log('  ⚠ sms_opted_out column error:', err.message);
    }
    try {
      await client.query(`
        ALTER TABLE consumers 
        ADD COLUMN IF NOT EXISTS sms_opted_out_at TIMESTAMP
      `);
      console.log('  ✓ sms_opted_out_at column added to consumers');
    } catch (err: any) {
      console.log('  ⚠ sms_opted_out_at column error:', err.message);
    }

    // Create SMS blocked numbers table for undeliverable tracking
    console.log('Creating sms_blocked_numbers table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sms_blocked_numbers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          phone_number TEXT NOT NULL,
          reason TEXT NOT NULL,
          error_code TEXT,
          error_message TEXT,
          failure_count INTEGER DEFAULT 1,
          first_failed_at TIMESTAMP DEFAULT NOW(),
          last_failed_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(tenant_id, phone_number)
        )
      `);
      console.log('  ✓ sms_blocked_numbers table created');
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        console.log('  ✓ sms_blocked_numbers table already exists');
      } else {
        console.log('  ⚠ sms_blocked_numbers table error:', err.message);
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
    
    // Add unique constraint to prevent duplicate invoices per billing period
    console.log('Adding unique constraint to invoices...');
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_subscription_period
        ON invoices(subscription_id, period_start, period_end)
        WHERE subscription_id IS NOT NULL
      `);
      console.log('  ✓ invoices unique constraint (subscription_id, period_start, period_end)');
    } catch (err) {
      console.log('  ⚠ invoices unique constraint (already exists)');
    }

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS document_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          description TEXT,
          signature_placement TEXT DEFAULT 'bottom',
          legal_disclaimer TEXT,
          consent_text TEXT DEFAULT 'I agree to the terms and conditions outlined in this document.',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ document_templates table');
    } catch (err) {
      console.log('  ⚠ document_templates (already exists)');
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
    
    // Add missing columns to signature_requests to match schema
    console.log('Adding missing columns to signature_requests...');
    const signatureRequestColumns = [
      { name: 'title', type: 'TEXT', notNull: true, default: "''" },
      { name: 'description', type: 'TEXT' },
      { name: 'declined_at', type: 'TIMESTAMP' },
      { name: 'decline_reason', type: 'TEXT' },
      { name: 'viewed_at', type: 'TIMESTAMP' },
      { name: 'signature_data', type: 'TEXT' },
      { name: 'initials_data', type: 'TEXT' },
      { name: 'ip_address', type: 'TEXT' },
      { name: 'user_agent', type: 'TEXT' },
      { name: 'legal_consent', type: 'BOOLEAN', default: 'false' },
      { name: 'updated_at', type: 'TIMESTAMP', default: 'NOW()' }
    ];
    
    for (const col of signatureRequestColumns) {
      try {
        let sql = `ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`;
        if (col.default) {
          sql += ` DEFAULT ${col.default}`;
        }
        if (col.notNull) {
          sql += ` NOT NULL`;
        }
        await client.query(sql);
        console.log(`  ✓ ${col.name}`);
      } catch (err) {
        console.log(`  ⚠ ${col.name} (already exists or error)`);
      }
    }
    
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS signed_documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          signature_request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
          consumer_id UUID NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
          signature_data TEXT NOT NULL,
          initials_data TEXT,
          ip_address VARCHAR,
          user_agent TEXT,
          signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ signed_documents table');
    } catch (err) {
      console.log('  ⚠ signed_documents (already exists)');
    }
    
    // Add initials_data column to signed_documents if it doesn't exist
    console.log('Adding initials_data to signed_documents...');
    try {
      await client.query(`ALTER TABLE signed_documents ADD COLUMN IF NOT EXISTS initials_data TEXT`);
      console.log('  ✓ initials_data');
    } catch (err) {
      console.log('  ⚠ initials_data (already exists or error)');
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
    
    // Create global document templates table for system-wide onboarding documents
    console.log('Creating global_document_templates table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS global_document_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          slug TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          description TEXT,
          version INTEGER DEFAULT 1,
          required_tenant_fields TEXT[],
          available_variables TEXT[],
          signature_placement TEXT DEFAULT 'bottom',
          legal_disclaimer TEXT,
          consent_text TEXT DEFAULT 'I agree to the terms and conditions outlined in this document.',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ global_document_templates table');
    } catch (err) {
      console.log('  ⚠ global_document_templates (already exists)');
    }
    
    // Create signature request fields table for collecting sensitive data during signing
    console.log('Creating signature_request_fields table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS signature_request_fields (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          signature_request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
          field_key TEXT NOT NULL,
          field_type TEXT NOT NULL CHECK (field_type IN ('text', 'sensitive', 'checkbox', 'date', 'tokenized')),
          display_value TEXT,
          encrypted_value TEXT,
          tokenized_value TEXT,
          is_sensitive BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ signature_request_fields table');
    } catch (err) {
      console.log('  ⚠ signature_request_fields (already exists)');
    }
    
    // Create tenant agreements table for global admin agreement requests
    console.log('Creating tenant_agreements table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS tenant_agreements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          global_document_id UUID NOT NULL REFERENCES global_document_templates(id) ON DELETE CASCADE,
          agreement_type TEXT NOT NULL,
          agreement_metadata JSONB NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'agreed', 'declined')),
          viewed_at TIMESTAMP,
          agreed_at TIMESTAMP,
          declined_at TIMESTAMP,
          decline_reason TEXT,
          ip_address TEXT,
          user_agent TEXT,
          admin_notified BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ tenant_agreements table');
    } catch (err) {
      console.log('  ⚠ tenant_agreements (already exists)');
    }
    
    // Add status CHECK constraint to existing tenant_agreements tables
    console.log('Adding status constraint to tenant_agreements...');
    try {
      await client.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'tenant_agreements_status_check'
          ) THEN
            ALTER TABLE tenant_agreements 
            ADD CONSTRAINT tenant_agreements_status_check 
            CHECK (status IN ('pending', 'viewed', 'agreed', 'declined'));
          END IF;
        END $$;
      `);
      console.log('  ✓ status CHECK constraint');
    } catch (err) {
      console.log('  ⚠ status CHECK constraint (already exists)');
    }
    
    // Add indexes for tenant agreements
    console.log('Creating tenant_agreements indexes...');
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS tenant_agreements_tenant_status_idx 
          ON tenant_agreements(tenant_id, status)
      `);
      console.log('  ✓ tenant_status index');
    } catch (err) {
      console.log('  ⚠ tenant_status index (already exists)');
    }
    
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS tenant_agreements_doc_idx 
          ON tenant_agreements(global_document_id)
      `);
      console.log('  ✓ global_document_id index');
    } catch (err) {
      console.log('  ⚠ global_document_id index (already exists)');
    }

    // Add document_content column to tenant_agreements
    console.log('Adding document_content column to tenant_agreements...');
    try {
      await client.query(`
        ALTER TABLE tenant_agreements 
        ADD COLUMN IF NOT EXISTS document_content TEXT
      `);
      console.log('  ✓ document_content column added');
    } catch (err) {
      console.log('  ⚠ document_content column (already exists)');
    }
    
    // Create service activation requests table for à la carte service approvals
    console.log('Creating service_activation_requests table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS service_activation_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          service_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          requested_by TEXT,
          requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          approved_by TEXT,
          approved_at TIMESTAMP,
          rejection_reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ service_activation_requests table');
    } catch (err) {
      console.log('  ⚠ service_activation_requests (already exists)');
    }
    
    // Backfill tenant_settings for any existing tenants without settings
    console.log('Backfilling tenant_settings for existing tenants...');
    try {
      const backfillResult = await client.query(`
        INSERT INTO tenant_settings (
          tenant_id,
          show_payment_plans,
          show_documents,
          allow_settlement_requests,
          sms_throttle_limit,
          custom_branding,
          consumer_portal_settings
        )
        SELECT 
          t.id,
          true,
          true,
          true,
          10,
          '{}'::jsonb,
          '{}'::jsonb
        FROM tenants t
        LEFT JOIN tenant_settings ts ON t.id = ts.tenant_id
        WHERE ts.id IS NULL
        ON CONFLICT (tenant_id) DO NOTHING
      `);
      if (backfillResult.rowCount && backfillResult.rowCount > 0) {
        console.log(`  ✓ Created tenant_settings for ${backfillResult.rowCount} existing tenant(s)`);
      } else {
        console.log('  ✓ All tenants already have settings');
      }
    } catch (err) {
      console.log('  ⚠ Could not backfill tenant_settings:', err);
    }
    
    // Create unique index to prevent duplicate pending requests
    console.log('Creating service activation request indexes...');
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS service_activation_requests_unique_pending_idx 
          ON service_activation_requests(tenant_id, service_type) 
          WHERE status = 'pending'
      `);
      console.log('  ✓ unique pending index');
    } catch (err) {
      console.log('  ⚠ unique pending index (already exists)');
    }
    
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS service_activation_requests_tenant_status_idx 
          ON service_activation_requests(tenant_id, status)
      `);
      console.log('  ✓ tenant status index');
    } catch (err) {
      console.log('  ⚠ tenant status index (already exists)');
    }
    
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS service_activation_requests_status_idx 
          ON service_activation_requests(status)
      `);
      console.log('  ✓ status index');
    } catch (err) {
      console.log('  ⚠ status index (already exists)');
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
    
    // FIX: Enable services for all tenants with active subscriptions
    console.log('🔧 Enabling services for subscribed tenants...');
    try {
      const fixResult = await client.query(`
        UPDATE tenants
        SET 
          is_trial_account = false,
          is_paid_account = true,
          email_service_enabled = true,
          sms_service_enabled = true,
          payment_processing_enabled = true,
          portal_access_enabled = true
        FROM subscriptions
        WHERE subscriptions.tenant_id = tenants.id
          AND subscriptions.status = 'active'
      `);
      console.log(`  ✅ Enabled services for ${fixResult.rowCount} subscribed tenants`);
    } catch (err) {
      console.log('  ⚠ Could not enable services for subscribed tenants:', err);
    }
    
    // Add interactive_fields column to global_document_templates
    console.log('Adding interactive_fields column to global_document_templates...');
    try {
      await client.query(`
        ALTER TABLE global_document_templates
        ADD COLUMN IF NOT EXISTS interactive_fields JSONB
      `);
      console.log('  ✓ interactive_fields column added');
    } catch (err) {
      console.log('  ⚠ interactive_fields column (already exists or error):', err);
    }
    
    // Seed global document templates for global admin agreements
    console.log('Seeding global document templates...');
    try {
      // Full Agency SaaS Agreement with Terms of Service and Pricing Addendum
      const softwareProposalHtml = `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 30px; color: #333;">
  <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #2563eb;">
    <h1 style="color: #1e40af; margin: 0; font-size: 28px;">Chain Software Group</h1>
    <p style="color: #64748b; margin: 5px 0 0;">Agency SaaS Agreement</p>
  </div>
  
  <div style="background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%); padding: 20px; border-radius: 10px; margin-bottom: 25px; border-left: 4px solid #2563eb;">
    <h3 style="margin: 0 0 10px; color: #1e40af;">Your Subscription Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #64748b;">Company:</td><td style="padding: 8px 0; font-weight: 600;">{{companyName}}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Plan:</td><td style="padding: 8px 0; font-weight: 600;">{{pricingTier}}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Base Monthly Rate:</td><td style="padding: 8px 0; font-weight: 600;">{{monthlyPrice}}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Add-ons:</td><td style="padding: 8px 0;">{{addonsList}}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;"><strong>Total Monthly:</strong></td><td style="padding: 8px 0; font-weight: 700; color: #059669;">{{totalMonthlyPrice}}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Billing Start:</td><td style="padding: 8px 0;">{{billingStartDate}}</td></tr>
    </table>
    <p style="font-size: 12px; color: #f59e0b; margin: 15px 0 0; font-style: italic;">* Amount subject to change based on overage usage</p>
  </div>

  <h2 style="color: #1e40af; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Agency SaaS Agreement</h2>
  <p><strong>Parties:</strong> Chain Software Group ("Provider") and the subscribing agency ("Customer").</p>
  <p><strong>Scope:</strong> Access to the multi-tenant platform for uploading account data, communicating with consumers, and optional payment facilitation via third parties.</p>

  <h3 style="color: #334155;">Key Terms</h3>
  <ul style="line-height: 1.8;">
    <li><strong>Subscription & Fees:</strong> Customer pays the fees set in the Order (e.g., per-seat, per-account, messaging usage). Invoices due net 15. Late amounts may accrue interest at the lesser of 1.5%/mo or the maximum allowed by law.</li>
    <li><strong>Term & Renewal:</strong> Initial term 12 months; auto-renews for 12-month periods unless either party gives 30 days' notice.</li>
    <li><strong>Customer Data:</strong> Customer is the controller of its Consumer Data. Chain processes it solely to provide the Service, under the Data Processing Addendum (DPA).</li>
    <li><strong>Acceptable Use & Compliance:</strong> Customer agrees to comply with applicable law (e.g., FDCPA/Reg F, TCPA, state laws) and to only send lawful, consented communications via the Service. Customer is responsible for A2P 10DLC brand/campaign registration where required.</li>
    <li><strong>Security:</strong> Chain implements administrative, technical, and physical safeguards appropriate to the risk. Customer must secure its credentials and restrict access to authorized personnel.</li>
    <li><strong>Messaging & Payments:</strong> Messaging is provided via third-party carriers/providers; delivery is not guaranteed. Payments are processed via third-party processors under their terms. Chain is not a debt collector and does not decide settlement terms or lawful contact windows.</li>
    <li><strong>Confidentiality; IP:</strong> Each party will protect the other's Confidential Information. Chain retains all rights to the Service and underlying IP.</li>
    <li><strong>Warranties; Disclaimers:</strong> The Service is provided "AS IS." Chain disclaims implied warranties. No legal, compliance, or collection advice is provided.</li>
    <li><strong>Indemnity:</strong> Customer will indemnify Chain for claims arising from Customer's data, instructions, or unlawful communications. Chain will indemnify Customer for third-party IP claims alleging the Service infringes IP rights.</li>
    <li><strong>Liability Cap:</strong> Each party's aggregate liability is capped at the fees paid in the 12 months preceding the claim; no indirect or consequential damages.</li>
    <li><strong>Termination:</strong> Either party may terminate for material breach uncured within 30 days. Upon termination, Customer may export its data for 30 days.</li>
    <li><strong>Governing Law; Venue:</strong> New York law; exclusive venue Erie County, NY.</li>
  </ul>

  <h3 style="color: #334155;">Data Processing Addendum (Summary)</h3>
  <ul style="line-height: 1.8;">
    <li><strong>Roles:</strong> Customer = Controller; Chain = Processor/Service Provider.</li>
    <li><strong>Instructions:</strong> Process Consumer Data only per Customer's documented instructions and the Agreement.</li>
    <li><strong>Sub-processors:</strong> Chain may use vetted sub-processors (hosting, messaging, analytics, payment); list available upon request.</li>
    <li><strong>Security:</strong> Appropriate technical/organizational measures (encryption in transit, access controls, logging, backups).</li>
    <li><strong>Breach Notice:</strong> Notify Customer without undue delay of a confirmed personal data breach.</li>
    <li><strong>Deletion/Return:</strong> On termination, delete or return Consumer Data after the export window, unless retention is required by law.</li>
  </ul>

  <h2 style="color: #1e40af; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-top: 30px;">Pricing & Messaging Addendum</h2>
  
  <h3 style="color: #334155;">A. Onboarding & First-Month Charges</h3>
  <p>Upon selecting a plan, Agency will pay: (a) the first monthly Service Fee for the chosen tier in advance, plus (b) a one-time $100 startup fee (non-refundable once onboarding begins).</p>

  <h3 style="color: #334155;">B. SMS Program Requirements</h3>
  <ul style="line-height: 1.8;">
    <li>Agency must collect, store, and produce proof of consent for each recipient upon request.</li>
    <li>Service is subject to Agency's messaging brand and campaign approval by the carrier ecosystem (e.g., A2P 10DLC).</li>
    <li>Agency is responsible for content compliance with FDCPA/Reg F, TCPA, and state laws.</li>
  </ul>

  <h3 style="color: #334155;">C. Plans & Monthly Service Fees</h3>
  <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
    <thead>
      <tr style="background: #f1f5f9;">
        <th style="padding: 12px; text-align: left; border: 1px solid #e2e8f0;">Tier</th>
        <th style="padding: 12px; text-align: left; border: 1px solid #e2e8f0;">Monthly Fee</th>
        <th style="padding: 12px; text-align: left; border: 1px solid #e2e8f0;">Emails/mo</th>
        <th style="padding: 12px; text-align: left; border: 1px solid #e2e8f0;">SMS/mo</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding: 10px; border: 1px solid #e2e8f0;">Launch</td><td style="padding: 10px; border: 1px solid #e2e8f0;">$325</td><td style="padding: 10px; border: 1px solid #e2e8f0;">10,000</td><td style="padding: 10px; border: 1px solid #e2e8f0;">1,000</td></tr>
      <tr><td style="padding: 10px; border: 1px solid #e2e8f0;">Growth</td><td style="padding: 10px; border: 1px solid #e2e8f0;">$500</td><td style="padding: 10px; border: 1px solid #e2e8f0;">25,000</td><td style="padding: 10px; border: 1px solid #e2e8f0;">2,500</td></tr>
      <tr><td style="padding: 10px; border: 1px solid #e2e8f0;">Pro</td><td style="padding: 10px; border: 1px solid #e2e8f0;">$950</td><td style="padding: 10px; border: 1px solid #e2e8f0;">100,000</td><td style="padding: 10px; border: 1px solid #e2e8f0;">10,000</td></tr>
      <tr><td style="padding: 10px; border: 1px solid #e2e8f0;">Scale</td><td style="padding: 10px; border: 1px solid #e2e8f0;">$1,800</td><td style="padding: 10px; border: 1px solid #e2e8f0;">250,000</td><td style="padding: 10px; border: 1px solid #e2e8f0;">25,000</td></tr>
    </tbody>
  </table>
  <p><strong>Overages:</strong> Email: $2.50 per 1,000 beyond allotment. SMS: $0.02 per segment beyond allotment.</p>

  <h3 style="color: #334155;">D. Billing & Invoices</h3>
  <p>Monthly in advance for Service Fee; overages billed in arrears. Invoices due net 15 days. Late balances may accrue interest at 1.5%/mo and may trigger suspension.</p>

  <h3 style="color: #334155;">E. Compliance & Indemnity</h3>
  <p>Agency will comply with FDCPA/Reg F, TCPA, state telemarketing/messaging laws, carrier policies, and applicable email anti-spam laws. Agency will indemnify Chain for claims arising from Agency's messaging content or unlawful contact practices.</p>

  <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
    <p style="margin: 0; font-size: 13px;"><strong>Contact Information:</strong><br>
    Email: {{contactEmail}}<br>
    Phone: {{contactPhone}}</p>
  </div>

  <div style="text-align: center; margin-top: 30px; padding: 20px; background: #f8fafc; border-radius: 10px;">
    <p style="margin: 0 0 15px; color: #64748b;">By clicking "I Agree" below, you acknowledge that you have read and agree to the terms of this Agreement.</p>
  </div>
</div>`;
      
      const softwareProposalVars = ['companyName', 'moduleName', 'moduleDescription', 'pricingTier', 'monthlyPrice', 'totalMonthlyPrice', 'addonsTotal', 'addonsList', 'billingStartDate', 'contactEmail', 'contactPhone', 'agreementLink'];
      
      await client.query(
        `INSERT INTO global_document_templates (slug, name, title, content, description, available_variables, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         ON CONFLICT (slug) DO UPDATE SET content = EXCLUDED.content, available_variables = EXCLUDED.available_variables`,
        ['software_proposal', 'Agency SaaS Agreement', 'Chain Software Group - Agency Agreement', softwareProposalHtml, 'Full Agency SaaS Agreement with Terms of Service and Pricing Addendum', softwareProposalVars, true]
      );
      
      // Updated Payment Authorization Form
      const paymentAuthHtml = `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 30px; color: #333;">
  <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #2563eb;">
    <h1 style="color: #1e40af; margin: 0; font-size: 24px;">Chain Software Group</h1>
    <p style="color: #64748b; margin: 5px 0 0;">Payment Authorization Form</p>
  </div>
  
  <p>Dear {{companyName}},</p>
  
  <p>Please complete this form to authorize payment for your subscription. You are selecting your preferred payment method for ongoing billing.</p>
  
  <div style="background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%); padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #2563eb;">
    <h3 style="margin: 0 0 15px; color: #1e40af;">Billing Summary</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #64748b;">Plan:</td><td style="padding: 8px 0; font-weight: 600;">{{pricingTier}}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Base Monthly:</td><td style="padding: 8px 0;">{{monthlyPrice}}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Add-ons:</td><td style="padding: 8px 0;">{{addonsList}}</td></tr>
      <tr style="border-top: 1px solid #cbd5e1;"><td style="padding: 12px 0; color: #1e40af; font-weight: 600;">Total Monthly:</td><td style="padding: 12px 0; font-weight: 700; font-size: 18px; color: #059669;">{{totalMonthlyPrice}}</td></tr>
    </table>
    <p style="font-size: 12px; color: #f59e0b; margin: 15px 0 0; font-style: italic;">* This amount is subject to change based on overage usage (email/SMS beyond plan limits).</p>
  </div>

  <div style="background: #fef2f2; padding: 20px; border-radius: 10px; margin: 25px 0; border: 1px solid #fecaca;">
    <h3 style="margin: 0 0 15px; color: #b91c1c;">Payment Authorization Terms</h3>
    <p style="font-size: 14px; line-height: 1.7; margin: 0;">
      I authorize Chain Software Group and its payment processor to debit the account/card I provide for the amounts and schedule I selected. I understand I can cancel a future payment by contacting Chain Software Group at least 3 business days before the scheduled debit.
    </p>
    <ul style="font-size: 14px; line-height: 1.7; margin: 15px 0 0; padding-left: 20px;">
      <li>Any declined ACH transactions are subject to a <strong>$50 returned check fee</strong>.</li>
      <li>Non-payment will result in termination of services until payment is made.</li>
      <li>I attest I am an authorized user of the payment method.</li>
    </ul>
    <p style="font-size: 12px; color: #64748b; margin: 15px 0 0;">
      <strong>Disclosures:</strong> Payments are processed by third-party processors. Returned payments may incur fees allowed by law.
    </p>
  </div>

  <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #bbf7d0;">
    <p style="margin: 0; font-size: 14px; color: #166534;">
      <strong>Note:</strong> After you complete this authorization, our team will contact you to securely collect your full payment information.
    </p>
  </div>

  <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
    <p style="margin: 0; font-size: 13px;"><strong>Contact:</strong> {{contactEmail}} | {{contactPhone}}</p>
  </div>
</div>`;
      
      const paymentAuthVars = ['companyName', 'pricingTier', 'monthlyPrice', 'totalMonthlyPrice', 'addonsList', 'contactEmail', 'contactPhone', 'agreementLink'];
      
      // Updated interactive fields - removed merchantProvider, added last4 and paymentMethod
      const paymentAuthFields = [
        {
          name: 'paymentMethod',
          type: 'select',
          label: 'Preferred Payment Method',
          required: true,
          options: ['Credit Card', 'Debit Card', 'ACH/Bank Account']
        },
        {
          name: 'last4Digits',
          type: 'text',
          label: 'Last 4 Digits of Card/Account',
          required: true,
          placeholder: 'Enter last 4 digits'
        },
        {
          name: 'paymentFrequency',
          type: 'select',
          label: 'Payment Frequency',
          required: true,
          options: ['Monthly']
        }
      ];
      
      await client.query(
        `INSERT INTO global_document_templates (slug, name, title, content, description, available_variables, interactive_fields, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         ON CONFLICT (slug) DO UPDATE SET content = EXCLUDED.content, available_variables = EXCLUDED.available_variables, interactive_fields = EXCLUDED.interactive_fields`,
        ['payment_authorization', 'Payment Authorization Form', 'Chain Software Group - Payment Authorization', paymentAuthHtml, 'Payment authorization with terms, last 4 digits collection, and contact notice', paymentAuthVars, JSON.stringify(paymentAuthFields), true]
      );
      
      console.log('  ✓ Global document templates seeded');
    } catch (err) {
      console.log('  ⚠ Could not seed templates (may already exist):', err);
    }
    
    // Create auto-response configuration tables
    console.log('Creating auto-response tables...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS auto_response_config (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          enabled BOOLEAN DEFAULT false,
          test_mode BOOLEAN DEFAULT true,
          openai_api_key TEXT,
          model TEXT DEFAULT 'gpt-5-nano',
          response_tone TEXT DEFAULT 'professional',
          custom_instructions TEXT,
          enable_email_auto_response BOOLEAN DEFAULT true,
          enable_sms_auto_response BOOLEAN DEFAULT true,
          max_response_length INTEGER DEFAULT 500,
          included_responses_per_month INTEGER DEFAULT 1000,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('  ✓ auto_response_config table created');
    } catch (err) {
      console.log('  ⚠ auto_response_config table (already exists or error)');
    }
    
    // Add business_response_template column to auto_response_config
    console.log('Adding business_response_template column...');
    try {
      await client.query(`ALTER TABLE auto_response_config ADD COLUMN IF NOT EXISTS business_response_template TEXT`);
      console.log('  ✓ business_response_template');
    } catch (err) {
      console.log('  ⚠ business_response_template (already exists or error)');
    }
    
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS auto_response_usage (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          message_type TEXT NOT NULL,
          inbound_message_id UUID,
          consumer_id UUID REFERENCES consumers(id) ON DELETE SET NULL,
          account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
          prompt TEXT NOT NULL,
          response TEXT NOT NULL,
          tokens_used INTEGER DEFAULT 0,
          model TEXT NOT NULL,
          response_sent BOOLEAN DEFAULT false,
          test_mode BOOLEAN DEFAULT false,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('  ✓ auto_response_usage table created');
    } catch (err) {
      console.log('  ⚠ auto_response_usage table (already exists or error)');
    }
    
    // Add messageBody column to sms_tracking for conversation history
    console.log('Adding messageBody column to sms_tracking...');
    try {
      await client.query(`ALTER TABLE sms_tracking ADD COLUMN IF NOT EXISTS message_body TEXT`);
      console.log('  ✓ message_body');
    } catch (err) {
      console.log('  ⚠ message_body (already exists or error)');
    }
    
    // Add consumer_id column to email_logs for conversation tracking
    console.log('Adding consumer_id column to email_logs...');
    try {
      await client.query(`ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS consumer_id UUID REFERENCES consumers(id) ON DELETE SET NULL`);
      console.log('  ✓ consumer_id');
    } catch (err) {
      console.log('  ⚠ consumer_id (already exists or error)');
    }
    
    // Add index for payment duplicate detection (for idempotency checks)
    console.log('Creating index for payment duplicate detection...');
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_payments_duplicate_check 
        ON payments (consumer_id, account_id, amount_cents, created_at DESC)
      `);
      console.log('  ✓ idx_payments_duplicate_check');
    } catch (err) {
      console.log('  ⚠ idx_payments_duplicate_check (already exists or error)');
    }
    
    // Add force_arrangement column to tenant_settings
    console.log('Adding force_arrangement column to tenant_settings...');
    try {
      await client.query(`ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS force_arrangement BOOLEAN DEFAULT false`);
      console.log('  ✓ force_arrangement');
    } catch (err) {
      console.log('  ⚠ force_arrangement (already exists or error)');
    }
    
    // Add source tracking columns to sms_campaigns for automation/sequence campaigns
    console.log('Adding source tracking columns to sms_campaigns...');
    try {
      await client.query(`ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`);
      console.log('  ✓ source');
    } catch (err) {
      console.log('  ⚠ source (already exists or error)');
    }
    try {
      await client.query(`ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS automation_id UUID`);
      console.log('  ✓ automation_id');
    } catch (err) {
      console.log('  ⚠ automation_id (already exists or error)');
    }
    try {
      await client.query(`ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS sequence_id UUID`);
      console.log('  ✓ sequence_id');
    } catch (err) {
      console.log('  ⚠ sequence_id (already exists or error)');
    }
    try {
      await client.query(`ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS sequence_step_id UUID`);
      console.log('  ✓ sequence_step_id');
    } catch (err) {
      console.log('  ⚠ sequence_step_id (already exists or error)');
    }
    
    // Create email_replies table for inbound email tracking
    console.log('Creating email_replies table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS email_replies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          consumer_id UUID REFERENCES consumers(id) ON DELETE SET NULL,
          from_email TEXT NOT NULL,
          to_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          text_body TEXT,
          html_body TEXT,
          message_id TEXT,
          in_reply_to_message_id TEXT,
          is_read BOOLEAN DEFAULT false,
          read_at TIMESTAMP,
          read_by TEXT,
          notes TEXT,
          received_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('  ✓ email_replies table');
    } catch (err) {
      console.log('  ⚠ email_replies (already exists)');
    }
    
    // Create sms_replies table for inbound SMS tracking
    console.log('Creating sms_replies table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sms_replies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          consumer_id UUID REFERENCES consumers(id) ON DELETE SET NULL,
          from_phone TEXT NOT NULL,
          to_phone TEXT NOT NULL,
          message_body TEXT NOT NULL,
          message_sid TEXT,
          num_media BIGINT DEFAULT 0,
          media_urls TEXT[],
          is_read BOOLEAN DEFAULT false,
          read_at TIMESTAMP,
          read_by TEXT,
          notes TEXT,
          received_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('  ✓ sms_replies table');
    } catch (err) {
      console.log('  ⚠ sms_replies (already exists)');
    }
    
    // Create automation_executions table for tracking automation runs
    console.log('Creating automation_executions table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS automation_executions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          automation_id UUID NOT NULL REFERENCES communication_automations(id) ON DELETE CASCADE,
          executed_at TIMESTAMP DEFAULT NOW(),
          status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
          total_sent BIGINT DEFAULT 0,
          total_failed BIGINT DEFAULT 0,
          error_message TEXT,
          execution_details JSONB
        )
      `);
      console.log('  ✓ automation_executions table');
    } catch (err) {
      console.log('  ⚠ automation_executions (already exists)');
    }
    
    // Create messaging_usage_events table for usage tracking
    console.log('Creating messaging_usage_events table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS messaging_usage_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          message_type TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          external_message_id TEXT NOT NULL,
          occurred_at TIMESTAMP DEFAULT NOW(),
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('  ✓ messaging_usage_events table');
      
      // Create indexes for messaging_usage_events
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS messaging_usage_events_external_idx 
        ON messaging_usage_events(external_message_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS messaging_usage_events_tenant_period_idx 
        ON messaging_usage_events(tenant_id, occurred_at)
      `);
      console.log('  ✓ messaging_usage_events indexes');
    } catch (err) {
      console.log('  ⚠ messaging_usage_events (already exists)');
    }
    
    // Create communication_sequence_steps table
    console.log('Creating communication_sequence_steps table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS communication_sequence_steps (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sequence_id UUID NOT NULL REFERENCES communication_sequences(id) ON DELETE CASCADE,
          step_type TEXT NOT NULL CHECK (step_type IN ('email', 'sms', 'signature_request')),
          template_id UUID,
          step_order BIGINT NOT NULL,
          delay_days BIGINT DEFAULT 0,
          delay_hours BIGINT DEFAULT 0,
          conditions JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('  ✓ communication_sequence_steps table');
    } catch (err) {
      console.log('  ⚠ communication_sequence_steps (already exists)');
    }
    
    // Create communication_sequence_enrollments table
    console.log('Creating communication_sequence_enrollments table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS communication_sequence_enrollments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sequence_id UUID NOT NULL REFERENCES communication_sequences(id) ON DELETE CASCADE,
          consumer_id UUID NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
          current_step_id UUID REFERENCES communication_sequence_steps(id),
          current_step_order BIGINT DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
          enrolled_at TIMESTAMP DEFAULT NOW(),
          next_message_at TIMESTAMP,
          completed_at TIMESTAMP,
          last_message_sent_at TIMESTAMP,
          messages_sent BIGINT DEFAULT 0,
          messages_opened BIGINT DEFAULT 0,
          messages_clicked BIGINT DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('  ✓ communication_sequence_enrollments table');
    } catch (err) {
      console.log('  ⚠ communication_sequence_enrollments (already exists)');
    }
    
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
