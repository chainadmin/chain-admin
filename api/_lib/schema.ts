// Re-export schema from shared for Vercel serverless functions
// This is a workaround for Vercel's isolated function environment

import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, boolean, jsonb, bigint, decimal, serial, integer } from 'drizzle-orm/pg-core';

// Tenants (agencies/organizations)
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  domain: text("domain").unique(),
  brand: jsonb("brand").default(sql`'{}'::jsonb`),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique().notNull(),
  name: text("name"),
  replitId: text("replit_id").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Platform users (associates users with tenants)
export const platformUsers = pgTable("platform_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  role: text("role").default("member"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Consumers (debtors)
export const consumers = pgTable("consumers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  dateOfBirth: text("date_of_birth"),
  ssn: text("ssn"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Folders for organizing accounts
export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  color: text("color").default("#6b7280"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Accounts (debt accounts)
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  accountNumber: text("account_number").notNull(),
  originalCreditor: text("original_creditor"),
  currentBalance: decimal("current_balance", { precision: 10, scale: 2 }).notNull(),
  originalBalance: decimal("original_balance", { precision: 10, scale: 2 }),
  status: text("status").default("active"),
  dateOpened: timestamp("date_opened"),
  dateCharged: timestamp("date_charged"),
  lastPaymentDate: timestamp("last_payment_date"),
  lastPaymentAmount: decimal("last_payment_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email templates
export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  category: text("category").default("general"),
  variables: jsonb("variables").default(sql`'[]'::jsonb`),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// SMS templates
export const smsTemplates = pgTable("sms_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  category: text("category").default("general"),
  variables: jsonb("variables").default(sql`'[]'::jsonb`),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  smsThrottleLimit: bigint("sms_throttle_limit", { mode: "number" }).default(10),
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

// Sessions
export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});