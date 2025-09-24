// Re-export schema from shared for Vercel serverless functions
// This schema exactly matches the database structure

import { sql } from 'drizzle-orm';

import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  bigint,
  date,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tenants (agencies)
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  brand: jsonb("brand").default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").default(true), // Can be suspended by platform owner
  suspendedAt: timestamp("suspended_at"),
  suspensionReason: text("suspension_reason"),
  // Trial registration fields
  isTrialAccount: boolean("is_trial_account").default(true), // New agencies start as trial
  isPaidAccount: boolean("is_paid_account").default(false), // Upgraded by admin
  ownerFirstName: text("owner_first_name"),
  ownerLastName: text("owner_last_name"),
  ownerDateOfBirth: text("owner_date_of_birth"), // Format: YYYY-MM-DD
  ownerSSN: text("owner_ssn"), // Encrypted/hashed in production
  businessName: text("business_name"),
  phoneNumber: text("phone_number"),
  email: text("email"),
  // Postmark integration
  postmarkServerId: text("postmark_server_id"), // Postmark server ID  
  postmarkServerToken: text("postmark_server_token"), // Postmark server API token for sending emails
  postmarkServerName: text("postmark_server_name"), // Human-readable server name
  // Twilio integration (each agency has their own)
  twilioAccountSid: text("twilio_account_sid"), // Twilio Account SID
  twilioAuthToken: text("twilio_auth_token"), // Twilio Auth Token (encrypted in production)
  twilioPhoneNumber: text("twilio_phone_number"), // Twilio phone number with country code
  twilioBusinessName: text("twilio_business_name"), // Business name registered with campaign
  twilioCampaignId: text("twilio_campaign_id"), // 10DLC Campaign ID if applicable
  notifiedOwners: boolean("notified_owners").default(false), // Track if owners were notified
  notificationSentAt: timestamp("notification_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Agency credentials (for username/password auth)
export const agencyCredentials = pgTable("agency_credentials", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  username: text("username").unique().notNull(),
  passwordHash: text("password_hash").notNull(), // Hashed password using bcrypt
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role", { enum: ['owner', 'manager', 'agent', 'viewer', 'uploader'] }).default('owner').notNull(),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Platform users (agency users)
export const platformUsers = pgTable("platform_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  authId: varchar("auth_id").notNull().references(() => users.id),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  role: text("role", { enum: ['platform_admin', 'owner', 'manager', 'agent', 'viewer', 'uploader'] }).notNull(),
  permissions: jsonb("permissions").default(sql`'{}'::jsonb`), // Store specific permissions
  isActive: boolean("is_active").default(true), // Can be deactivated
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Consumers (end users) - CRITICAL: Fields are nullable to allow partial data and registration
export const consumers = pgTable("consumers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // Nullable to allow independent registration
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  dateOfBirth: text("date_of_birth"), // Format: YYYY-MM-DD
  ssnLast4: text("ssn_last4"), // Last 4 digits only for security
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  isRegistered: boolean("is_registered").default(false), // Self-registered vs imported
  registrationToken: text("registration_token"), // For email verification
  registrationDate: timestamp("registration_date"),
  contactPrefs: jsonb("contact_prefs").default(sql`'{}'::jsonb`),
  additionalData: jsonb("additional_data").default(sql`'{}'::jsonb`), // Store custom CSV columns
  createdAt: timestamp("created_at").defaultNow(),
});

// Folders for organizing accounts
export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#3b82f6"), // Hex color for folder display
  isDefault: boolean("is_default").default(false), // Default folder for uploads
  sortOrder: bigint("sort_order", { mode: "number" }).default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Accounts (debts)
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  accountNumber: text("account_number"),
  creditor: text("creditor").notNull(),
  balanceCents: bigint("balance_cents", { mode: "number" }).notNull(),
  status: text("status").default("active"),
  dueDate: date("due_date"),
  additionalData: jsonb("additional_data").default(sql`'{}'::jsonb`), // Store custom CSV columns
  createdAt: timestamp("created_at").defaultNow(),
});

// Push device tokens
export const pushDevices = pgTable("push_devices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  expoToken: text("expo_token").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Email templates (per tenant)
export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  status: text("status").default("draft"),
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

// SMS templates (per tenant)
export const smsTemplates = pgTable("sms_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  message: text("message").notNull(), // SMS message content (160 char limit recommended)
  status: text("status").default("draft"),
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

// Sender identities (per tenant)
export const senderIdentities = pgTable("sender_identities", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  fromName: text("from_name"),
  fromEmail: text("from_email"),
  domain: text("domain"),
  provider: text("provider").default("postmark"),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Document uploads (per tenant) - for consumer access
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  mimeType: text("mime_type").notNull(),
  isPublic: boolean("is_public").default(true), // Whether consumers can see this document
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Arrangement/Settlement options (per tenant)
export const arrangementPlanTypes = [
  "range",
  "fixed_monthly",
  "pay_in_full",
  "custom_terms",
] as const;

export type ArrangementPlanType = (typeof arrangementPlanTypes)[number];

export const arrangementOptions = pgTable("arrangement_options", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(), // e.g., "Standard Payment Plan"
  description: text("description"),
  minBalance: bigint("min_balance", { mode: "number" }).notNull(), // In cents
  maxBalance: bigint("max_balance", { mode: "number" }).notNull(), // In cents
  planType: text("plan_type", { enum: arrangementPlanTypes }).default("range").notNull(),
  monthlyPaymentMin: bigint("monthly_payment_min", { mode: "number" }), // In cents
  monthlyPaymentMax: bigint("monthly_payment_max", { mode: "number" }), // In cents
  fixedMonthlyPayment: bigint("fixed_monthly_payment", { mode: "number" }), // In cents
  payInFullAmount: bigint("pay_in_full_amount", { mode: "number" }), // In cents
  payoffText: text("payoff_text"),
  customTermsText: text("custom_terms_text"),
  maxTermMonths: bigint("max_term_months", { mode: "number" }).default(12),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tenant privacy and display settings
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
  smsThrottleLimit: bigint("sms_throttle_limit", { mode: "number" }).default(10), // SMS per minute limit
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Payment processor fields
  merchantProvider: text("merchant_provider"),
  merchantAccountId: text("merchant_account_id"),
  merchantApiKey: text("merchant_api_key"),
  merchantName: text("merchant_name"),
  enableOnlinePayments: boolean("enable_online_payments").default(false),
});

// Consumer notifications (when accounts are added)
export const consumerNotifications = pgTable("consumer_notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "account_added", "payment_due", "settlement_available", etc.
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
});


// Consumer callback requests 
export const callbackRequests = pgTable("callback_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  requestType: text("request_type").notNull(), // "callback", "email", "information"
  preferredTime: text("preferred_time"), // "morning", "afternoon", "evening", "anytime"
  phoneNumber: text("phone_number"),
  emailAddress: text("email_address"),
  subject: text("subject"),
  message: text("message"),
  status: text("status").default("pending"), // "pending", "in_progress", "completed", "cancelled"
  priority: text("priority").default("normal"), // "low", "normal", "high", "urgent"
  assignedTo: text("assigned_to"), // Admin user who took the request
  adminNotes: text("admin_notes"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Payment transactions
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  paymentMethod: text("payment_method").notNull(), // "credit_card", "debit_card", "ach", "check", "cash", etc.
  status: text("status").default("pending"), // "pending", "processing", "completed", "failed", "refunded"
  transactionId: text("transaction_id"), // External payment processor transaction ID
  processorResponse: text("processor_response"), // Response from payment processor
  notes: text("notes"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tenant subscriptions (for billing agencies)
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull().unique(),
  plan: text("plan").notNull(), // "starter", "professional", "enterprise"
  status: text("status").default("active"), // "active", "cancelled", "suspended", "past_due"
  pricePerConsumerCents: bigint("price_per_consumer_cents", { mode: "number" }).notNull(),
  monthlyBaseCents: bigint("monthly_base_cents", { mode: "number" }).notNull(),
  billingEmail: text("billing_email"),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tenant invoices (for billing agencies)
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "cascade" }).notNull(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  status: text("status").default("pending"), // "pending", "paid", "overdue", "cancelled"
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  baseAmountCents: bigint("base_amount_cents", { mode: "number" }).notNull(),
  perConsumerCents: bigint("per_consumer_cents", { mode: "number" }).notNull(),
  consumerCount: bigint("consumer_count", { mode: "number" }).notNull(),
  totalAmountCents: bigint("total_amount_cents", { mode: "number" }).notNull(),
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Communication automations
export const communicationAutomations = pgTable("communication_automations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "email" or "sms"
  templateId: uuid("template_id"), // References either emailTemplates or smsTemplates
  trigger: text("trigger").notNull(), // "scheduled", "account_added", "payment_received", etc.
  targetGroup: text("target_group"), // "all", "with-balance", "overdue", etc.
  isActive: boolean("is_active").default(true),
  scheduleType: text("schedule_type"), // "one-time", "recurring"
  scheduledTime: timestamp("scheduled_time"), // For one-time scheduled automations
  scheduledDaysOfWeek: jsonb("scheduled_days_of_week").default(sql`'[]'::jsonb`), // For recurring: ["monday", "wednesday", "friday"]
  scheduledTimeOfDay: text("scheduled_time_of_day"), // For recurring: "09:00"
  removeOnPayment: boolean("remove_on_payment").default(false),
  lastRunAt: timestamp("last_run_at"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

