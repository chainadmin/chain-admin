import { sql } from 'drizzle-orm';
import { boolean, date, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './schema';

export const chiamoLeads = pgTable('chiamo_leads', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`), createdAt: timestamp('created_at').defaultNow().notNull(),
  firstName: text('first_name').notNull(), lastName: text('last_name').notNull(), businessName: text('business_name').notNull(), businessEmail: text('business_email').notNull(), businessPhone: text('business_phone').notNull(),
  employeeCount: text('employee_count'), phoneUsersNeeded: integer('phone_users_needed').notNull(), currentPhoneProvider: text('current_phone_provider'), newNumbersNeeded: integer('new_numbers_needed'), existingNumbersToPort: text('existing_numbers_to_port'), featuresNeeded: text('features_needed'),
  planInterest: text('plan_interest').notNull(), textingInterest: boolean('texting_interest').default(false).notNull(), contactPreference: text('contact_preference'), bestContactTime: text('best_contact_time'), additionalInformation: text('additional_information'),
  status: text('status').default('NEW').notNull(), assignedTo: text('assigned_to'), internalNotes: text('internal_notes'), contactHistory: jsonb('contact_history').$type<Array<{at:string;note:string}>>().default(sql`'[]'::jsonb`).notNull(),
});
export const chiamoSubscriptions = pgTable('chiamo_subscriptions', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id), planId: text('plan_id').notNull(), customBasePriceCents: integer('custom_base_price_cents'), includedUsers: integer('included_users'), additionalUserPriceCents: integer('additional_user_price_cents'), additionalNumberPriceCents: integer('additional_number_price_cents').default(0).notNull(), smsAddonEnabled: boolean('sms_addon_enabled').default(false).notNull(), smsAllowance: integer('sms_allowance').default(3500).notNull(), smsOverageMicros: integer('sms_overage_micros').default(0).notNull(), customCharges: jsonb('custom_charges').$type<Array<{name:string;cents:number}>>().default(sql`'[]'::jsonb`).notNull(), discounts: jsonb('discounts').$type<Array<{name:string;cents:number}>>().default(sql`'[]'::jsonb`).notNull(), billingStatus: text('billing_status').default('pending').notNull(), nextBillingDate: date('next_billing_date'), notes: text('notes'), updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const chiamoUsageSettings = pgTable('chiamo_usage_settings', {
  id: integer('id').primaryKey().default(1), elevatedMinutes: integer('elevated_minutes').default(3000).notNull(), highMinutes: integer('high_minutes').default(6000).notNull(), reviewMinutes: integer('review_minutes').default(10000).notNull(), voiceCostPerMinuteMicros: integer('voice_cost_per_minute_micros').default(14000).notNull(), numberCostCents: integer('number_cost_cents').default(115).notNull(), recordingCostPerMinuteMicros: integer('recording_cost_per_minute_micros').default(2500).notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
