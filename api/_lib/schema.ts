// Re-export schema from shared for Vercel serverless functions
// This schema exactly matches the database structure

import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, boolean, jsonb, bigint, decimal, serial, integer, varchar, date } from 'drizzle-orm/pg-core';

// Tenants (agencies/organizations)
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  brand: jsonb("brand").default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").default(true),
  suspendedAt: timestamp("suspended_at"),
  suspensionReason: text("suspension_reason"),
  isTrialAccount: boolean("is_trial_account").default(true),
  isPaidAccount: boolean("is_paid_account").default(false),
  ownerFirstName: text("owner_first_name"),
  ownerLastName: text("owner_last_name"),
  ownerDateOfBirth: text("owner_date_of_birth"),
  ownerSSN: text("owner_ssn"),
  businessName: text("business_name"),
  phoneNumber: text("phone_number"),
  email: text("email"),
  notifiedOwners: boolean("notified_owners").default(false),
  notificationSentAt: timestamp("notification_sent_at"),
  postmarkServerId: text("postmark_server_id"),
  postmarkServerToken: text("postmark_server_token"),
  postmarkServerName: text("postmark_server_name"),
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthToken: text("twilio_auth_token"),
  twilioPhoneNumber: text("twilio_phone_number"),
  twilioBusinessName: text("twilio_business_name"),
  twilioCampaignId: text("twilio_campaign_id"),
});

// Agency credentials for authentication
export const agencyCredentials = pgTable("agency_credentials", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").default("owner").notNull(),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Users
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Platform users (associates users with tenants)
export const platformUsers = pgTable("platform_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  authId: varchar("auth_id").notNull(),
  tenantId: uuid("tenant_id"),
  role: text("role").notNull(),
  permissions: jsonb("permissions").default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Consumers (debtors)
export const consumers = pgTable("consumers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  dateOfBirth: text("date_of_birth"),
  ssnLast4: text("ssn_last4"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  isRegistered: boolean("is_registered").default(false),
  registrationDate: timestamp("registration_date"),
  contactPrefs: jsonb("contact_prefs").default(sql`'{}'::jsonb`),
  additionalData: jsonb("additional_data").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
});

// Folders for organizing accounts
export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#6b7280"),
  isDefault: boolean("is_default").default(false),
  sortOrder: bigint("sort_order", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Accounts (debt accounts)
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  accountNumber: text("account_number").notNull(),
  creditor: text("creditor"),
  balanceCents: bigint("balance_cents", { mode: "number" }),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  dueDate: date("due_date"),
  additionalData: jsonb("additional_data"),
});

// Email templates
export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  category: text("category").default("general"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

// SMS templates
export const smsTemplates = pgTable("sms_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  message: text("message").notNull(),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

// SMS campaigns
export const smsCampaigns = pgTable("sms_campaigns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  templateId: uuid("template_id").references(() => smsTemplates.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  targetGroup: text("target_group").notNull(), // "all", "with-balance", "decline", "recent-upload"
  status: text("status").default("pending"), // "pending", "sending", "completed", "failed"
  totalRecipients: bigint("total_recipients", { mode: "number" }).default(0),
  totalSent: bigint("total_sent", { mode: "number" }).default(0),
  totalDelivered: bigint("total_delivered", { mode: "number" }).default(0),
  totalErrors: bigint("total_errors", { mode: "number" }).default(0),
  totalOptOuts: bigint("total_opt_outs", { mode: "number" }).default(0),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// SMS tracking for individual SMS sends
export const smsTracking = pgTable("sms_tracking", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid("campaign_id").references(() => smsCampaigns.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  phoneNumber: text("phone_number").notNull(),
  status: text("status").notNull(), // "sent", "delivered", "failed", "opted_out"
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  errorMessage: text("error_message"),
  trackingData: jsonb("tracking_data").default(sql`'{}'::jsonb`),
});

// Tenant settings
export const tenantSettings = pgTable("tenant_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull().unique(),
  privacyPolicy: text("privacy_policy"),
  termsOfService: text("terms_of_service"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  showPaymentPlans: boolean("show_payment_plans").default(true),
  showDocuments: boolean("show_documents").default(true),
  allowSettlementRequests: boolean("allow_settlement_requests").default(true),
  customBranding: jsonb("custom_branding").default(sql`'{}'::jsonb`),
  consumerPortalSettings: jsonb("consumer_portal_settings").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  smsThrottleLimit: bigint("sms_throttle_limit", { mode: "number" }).default(10),
  // Payment processor fields
  merchantProvider: text("merchant_provider"),
  merchantAccountId: text("merchant_account_id"),
  merchantApiKey: text("merchant_api_key"),
  merchantName: text("merchant_name"),
  enableOnlinePayments: boolean("enable_online_payments").default(false),
});

// Documents for consumer access
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: text("mime_type"),
  isPublic: boolean("is_public").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payment arrangement options
export const arrangementOptions = pgTable("arrangement_options", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  minBalance: bigint("min_balance", { mode: "number" }).notNull(),
  maxBalance: bigint("max_balance", { mode: "number" }).notNull(),
  monthlyPaymentMin: bigint("monthly_payment_min", { mode: "number" }).notNull(),
  monthlyPaymentMax: bigint("monthly_payment_max", { mode: "number" }).notNull(),
  maxTermMonths: integer("max_term_months").notNull().default(12),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Callback requests
export const callbackRequests = pgTable("callback_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  requestType: text("request_type").notNull(),
  preferredTime: text("preferred_time"),
  phoneNumber: text("phone_number"),
  emailAddress: text("email_address"),
  subject: text("subject"),
  message: text("message"),
  status: text("status").default("pending"),
  priority: text("priority").default("normal"),
  assignedTo: text("assigned_to"),
  adminNotes: text("admin_notes"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Email campaigns
export const emailCampaigns = pgTable("email_campaigns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  templateId: uuid("template_id").references(() => emailTemplates.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  targetGroup: text("target_group").notNull(), // "all", "with-balance", "overdue"
  status: text("status").default("pending"), // "pending", "sending", "completed", "failed"
  totalRecipients: bigint("total_recipients", { mode: "number" }).default(0),
  totalSent: bigint("total_sent", { mode: "number" }).default(0),
  totalDelivered: bigint("total_delivered", { mode: "number" }).default(0),
  totalOpened: bigint("total_opened", { mode: "number" }).default(0),
  totalClicked: bigint("total_clicked", { mode: "number" }).default(0),
  totalErrors: bigint("total_errors", { mode: "number" }).default(0),
  totalOptOuts: bigint("total_opt_outs", { mode: "number" }).default(0),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Email tracking for individual email sends
export const emailTracking = pgTable("email_tracking", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid("campaign_id").references(() => emailCampaigns.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  emailAddress: text("email_address").notNull(),
  status: text("status").notNull(), // "sent", "delivered", "opened", "clicked", "bounced", "failed", "opted_out"
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  errorMessage: text("error_message"),
  trackingData: jsonb("tracking_data").default(sql`'{}'::jsonb`),
});

// Communication Automations
export const communicationAutomations = pgTable("communication_automations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(), // 'email' or 'sms'
  templateId: uuid("template_id"), // For single template (one-time schedules)
  templateIds: uuid("template_ids").array(), // For multiple templates (recurring schedules)
  templateSchedule: jsonb("template_schedule").$type<{ templateId: string; dayOffset: number }[]>(), // For sequence-based schedules
  isActive: boolean("is_active").default(true),
  
  // Trigger conditions
  triggerType: text("trigger_type").notNull(), // 'schedule', 'event', 'manual'
  
  // Schedule settings (for scheduled automations)
  scheduleType: text("schedule_type"), // 'once', 'daily', 'weekly', 'monthly', 'sequence'
  scheduledTime: text("scheduled_time"), // Time of day for recurring schedules
  scheduledDate: timestamp("scheduled_date"), // For one-time schedules
  scheduledDaysOfWeek: text("scheduled_days_of_week").array(), // For weekly schedules
  scheduledDayOfMonth: integer("scheduled_day_of_month"), // For monthly schedules
  
  // Event settings (for event-triggered automations)
  eventType: text("event_type"), // 'account_added', 'payment_received', 'balance_updated'
  eventConditions: jsonb("event_conditions").$type<any>(), // Specific conditions for the event
  
  // Target settings  
  targetType: text("target_type").notNull(), // 'all', 'segment', 'individual'
  targetSegment: text("target_segment"), // 'with-balance', 'overdue', 'new-accounts', etc.
  targetFilters: jsonb("target_filters").$type<any>(), // Advanced filtering conditions
  targetConsumerIds: uuid("target_consumer_ids").array(), // For individual targeting
  
  // Execution settings
  throttleRate: integer("throttle_rate").default(10), // Messages per second
  removeOnPayment: boolean("remove_on_payment").default(false), // Stop if payment received
  respectOptOuts: boolean("respect_opt_outs").default(true), // Skip opted-out consumers
  
  // Tracking
  lastExecutedAt: timestamp("last_executed_at"),
  nextExecutionAt: timestamp("next_execution_at"),
  executionCount: bigint("execution_count", { mode: "number" }).default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Automation Executions  
export const automationExecutions = pgTable("automation_executions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  automationId: uuid("automation_id").references(() => communicationAutomations.id, { onDelete: "cascade" }).notNull(),
  status: text("status").notNull(), // 'pending', 'running', 'completed', 'failed'
  targetCount: bigint("target_count", { mode: "number" }).default(0),
  successCount: bigint("success_count", { mode: "number" }).default(0),
  failureCount: bigint("failure_count", { mode: "number" }).default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorDetails: jsonb("error_details").$type<any>(),
  executionData: jsonb("execution_data").$type<any>(), // Any additional data about the execution
  createdAt: timestamp("created_at").defaultNow(),
});

// Sessions
export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});