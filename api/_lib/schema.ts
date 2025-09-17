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

// Sessions
export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});