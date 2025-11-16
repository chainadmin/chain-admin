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
      const softwareProposalHtml = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><h1 style="color: #333;">Chain Software Group</h1><h2 style="color: #666;">Software Service Proposal & Agreement</h2><p>Dear {{companyName}},</p><p>This proposal outlines the software services to be provided:</p><div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;"><p><strong>Module:</strong> {{moduleName}}</p><p><strong>Description:</strong> {{moduleDescription}}</p><p><strong>Pricing Tier:</strong> {{pricingTier}}</p><p><strong>Monthly Rate:</strong> {{monthlyPrice}}</p><p><strong>Billing Start Date:</strong> {{billingStartDate}}</p></div><p><strong>Contact Information:</strong></p><p>Email: {{contactEmail}}<br>Phone: {{contactPhone}}</p><p style="margin-top: 30px;">By clicking "I Agree" below, you acknowledge that you have read and agree to the terms of this proposal.</p><div style="text-align: center; margin: 30px 0;"><a href="{{agreementLink}}" style="background: #22BC66; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View & Agree to Proposal</a></div></div>';
      
      const softwareProposalVars = ['companyName', 'moduleName', 'moduleDescription', 'pricingTier', 'monthlyPrice', 'billingStartDate', 'contactEmail', 'contactPhone', 'agreementLink'];
      
      await client.query(
        `INSERT INTO global_document_templates (slug, name, title, content, description, available_variables, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (slug) DO NOTHING`,
        ['software_proposal', 'Software Service Proposal & Agreement', 'Chain Software Group - Software Proposal', softwareProposalHtml, 'Global admin template for sending software proposal agreements to tenants', softwareProposalVars, true]
      );
      
      const paymentAuthHtml = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><h1 style="color: #333;">Chain Software Group</h1><h2 style="color: #666;">Payment Authorization Form</h2><p>Dear {{companyName}},</p><p>This form authorizes payment processing for your account:</p><div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;"><p><strong>Payment Amount:</strong> {{paymentAmount}}</p><p><strong>Payment Frequency:</strong> {{paymentFrequency}}</p><p><strong>Merchant Provider:</strong> {{merchantProvider}}</p><p><strong>Payment Method:</strong> {{paymentMethod}}</p></div><p style="margin-top: 30px;">By clicking "I Agree" below, you authorize Chain Software Group to charge the specified payment method according to the terms outlined above.</p><div style="text-align: center; margin: 30px 0;"><a href="{{agreementLink}}" style="background: #22BC66; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View & Authorize Payment</a></div></div>';
      
      const paymentAuthVars = ['companyName', 'paymentAmount', 'paymentFrequency', 'merchantProvider', 'paymentMethod', 'agreementLink'];
      
      // Define interactive fields for payment authorization form
      const paymentAuthFields = [
        {
          name: 'paymentAmount',
          type: 'number',
          label: 'Payment Amount ($)',
          required: true,
          min: 1,
          placeholder: 'Enter amount'
        },
        {
          name: 'paymentFrequency',
          type: 'select',
          label: 'Payment Frequency',
          required: true,
          options: ['Monthly', 'Weekly', 'Bi-Weekly', 'Quarterly', 'Annually']
        },
        {
          name: 'merchantProvider',
          type: 'select',
          label: 'Merchant Provider',
          required: true,
          options: ['USAePay', 'Authorize.net', 'NMI', 'Stripe']
        },
        {
          name: 'paymentMethod',
          type: 'select',
          label: 'Payment Method',
          required: true,
          options: ['Credit Card', 'Debit Card', 'ACH/Bank Account']
        }
      ];
      
      await client.query(
        `INSERT INTO global_document_templates (slug, name, title, content, description, available_variables, interactive_fields, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         ON CONFLICT (slug) DO UPDATE SET interactive_fields = EXCLUDED.interactive_fields`,
        ['payment_authorization', 'Payment Authorization Form', 'Chain Software Group - Payment Authorization', paymentAuthHtml, 'Global admin template for sending payment authorization agreements to tenants', paymentAuthVars, JSON.stringify(paymentAuthFields), true]
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
