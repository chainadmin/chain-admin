import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  bigint,
  date,
  boolean,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

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

// Consumers (end users)
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

// Messaging usage events (for billing usage tracking)
export const messagingUsageEvents = pgTable(
  "messaging_usage_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    provider: text("provider").notNull(),
    messageType: text("message_type").notNull(),
    quantity: integer("quantity").notNull().default(1),
    externalMessageId: text("external_message_id").notNull(),
    occurredAt: timestamp("occurred_at").defaultNow(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    uniqueExternalMessage: uniqueIndex("messaging_usage_events_external_idx").on(table.externalMessageId),
    tenantPeriodIdx: index("messaging_usage_events_tenant_period_idx").on(table.tenantId, table.occurredAt),
  })
);

// Relations
export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  platformUsers: many(platformUsers),
  agencyCredentials: many(agencyCredentials),
  consumers: many(consumers),
  accounts: many(accounts),
  folders: many(folders),
  emailTemplates: many(emailTemplates),
  emailCampaigns: many(emailCampaigns),
  smsTemplates: many(smsTemplates),
  smsCampaigns: many(smsCampaigns),
  senderIdentities: many(senderIdentities),
  documents: many(documents),
  arrangementOptions: many(arrangementOptions),
  settings: one(tenantSettings, {
    fields: [tenants.id],
    references: [tenantSettings.tenantId],
  }),
  subscription: one(subscriptions, {
    fields: [tenants.id],
    references: [subscriptions.tenantId],
  }),
  invoices: many(invoices),
}));

export const agencyCredentialsRelations = relations(agencyCredentials, ({ one }) => ({
  tenant: one(tenants, {
    fields: [agencyCredentials.tenantId],
    references: [tenants.id],
  }),
}));

export const platformUsersRelations = relations(platformUsers, ({ one }) => ({
  tenant: one(tenants, {
    fields: [platformUsers.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [platformUsers.authId],
    references: [users.id],
  }),
}));

export const consumersRelations = relations(consumers, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [consumers.tenantId],
    references: [tenants.id],
  }),
  folder: one(folders, {
    fields: [consumers.folderId],
    references: [folders.id],
  }),
  accounts: many(accounts),
  notifications: many(consumerNotifications),
  callbackRequests: many(callbackRequests),
  payments: many(payments),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  tenant: one(tenants, {
    fields: [accounts.tenantId],
    references: [tenants.id],
  }),
  consumer: one(consumers, {
    fields: [accounts.consumerId],
    references: [consumers.id],
  }),
  folder: one(folders, {
    fields: [accounts.folderId],
    references: [folders.id],
  }),
}));

// Relations for new tables
export const documentsRelations = relations(documents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [documents.tenantId],
    references: [tenants.id],
  }),
}));

export const arrangementOptionsRelations = relations(arrangementOptions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [arrangementOptions.tenantId],
    references: [tenants.id],
  }),
}));

export const tenantSettingsRelations = relations(tenantSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantSettings.tenantId],
    references: [tenants.id],
  }),
}));

export const emailCampaignsRelations = relations(emailCampaigns, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [emailCampaigns.tenantId],
    references: [tenants.id],
  }),
  template: one(emailTemplates, {
    fields: [emailCampaigns.templateId],
    references: [emailTemplates.id],
  }),
  trackings: many(emailTracking),
}));

export const emailTrackingRelations = relations(emailTracking, ({ one }) => ({
  campaign: one(emailCampaigns, {
    fields: [emailTracking.campaignId],
    references: [emailCampaigns.id],
  }),
  consumer: one(consumers, {
    fields: [emailTracking.consumerId],
    references: [consumers.id],
  }),
}));

export const consumerNotificationsRelations = relations(consumerNotifications, ({ one }) => ({
  tenant: one(tenants, {
    fields: [consumerNotifications.tenantId],
    references: [tenants.id],
  }),
  consumer: one(consumers, {
    fields: [consumerNotifications.consumerId],
    references: [consumers.id],
  }),
  account: one(accounts, {
    fields: [consumerNotifications.accountId],
    references: [accounts.id],
  }),
}));

export const callbackRequestsRelations = relations(callbackRequests, ({ one }) => ({
  tenant: one(tenants, {
    fields: [callbackRequests.tenantId],
    references: [tenants.id],
  }),
  consumer: one(consumers, {
    fields: [callbackRequests.consumerId],
    references: [consumers.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [payments.tenantId],
    references: [tenants.id],
  }),
  consumer: one(consumers, {
    fields: [payments.consumerId],
    references: [consumers.id],
  }),
  account: one(accounts, {
    fields: [payments.accountId],
    references: [accounts.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [subscriptions.tenantId],
    references: [tenants.id],
  }),
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  tenant: one(tenants, {
    fields: [invoices.tenantId],
    references: [tenants.id],
  }),
  subscription: one(subscriptions, {
    fields: [invoices.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [folders.tenantId],
    references: [tenants.id],
  }),
  consumers: many(consumers),
  accounts: many(accounts),
}));

export const smsTemplatesRelations = relations(smsTemplates, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [smsTemplates.tenantId],
    references: [tenants.id],
  }),
  campaigns: many(smsCampaigns),
}));

export const smsCampaignsRelations = relations(smsCampaigns, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [smsCampaigns.tenantId],
    references: [tenants.id],
  }),
  template: one(smsTemplates, {
    fields: [smsCampaigns.templateId],
    references: [smsTemplates.id],
  }),
  trackings: many(smsTracking),
}));

export const smsTrackingRelations = relations(smsTracking, ({ one }) => ({
  campaign: one(smsCampaigns, {
    fields: [smsTracking.campaignId],
    references: [smsCampaigns.id],
  }),
  consumer: one(consumers, {
    fields: [smsTracking.consumerId],
    references: [consumers.id],
  }),
}));

// Communication Automations
export const communicationAutomations = pgTable("communication_automations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type", { enum: ['email', 'sms'] }).notNull(),
  templateId: uuid("template_id"), // For single template (one-time schedules)
  templateIds: uuid("template_ids").array(), // For multiple templates (recurring schedules)
  templateSchedule: jsonb("template_schedule").$type<{ templateId: string; dayOffset: number }[]>(), // For sequence-based schedules
  isActive: boolean("is_active").default(true),
  
  // Trigger conditions
  triggerType: text("trigger_type", { enum: ['schedule', 'event', 'manual'] }).notNull(),
  
  // Schedule settings (for scheduled automations)
  scheduleType: text("schedule_type", { enum: ['once', 'daily', 'weekly', 'monthly', 'sequence'] }),
  scheduledDate: timestamp("scheduled_date"),
  scheduleTime: text("schedule_time"), // Format: "HH:MM"
  scheduleWeekdays: text("schedule_weekdays").array(), // ['monday', 'tuesday', etc.]
  scheduleDayOfMonth: text("schedule_day_of_month"), // For monthly schedules
  
  // Event-based settings (for event-triggered automations)
  eventType: text("event_type", { enum: ['account_created', 'payment_overdue', 'custom'] }),
  eventDelay: text("event_delay"), // Format: "7d", "1h", "30m"
  
  // Target audience settings
  targetType: text("target_type", { enum: ['all', 'folder', 'custom'] }).notNull(),
  targetFolderIds: uuid("target_folder_ids").array(),
  targetCustomerIds: uuid("target_customer_ids").array(),
  
  // Execution tracking
  lastExecuted: timestamp("last_executed"),
  nextExecution: timestamp("next_execution"),
  totalSent: bigint("total_sent", { mode: "number" }).default(0),
  currentTemplateIndex: bigint("current_template_index", { mode: "number" }).default(0), // For template rotation
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Automation execution logs
export const automationExecutions = pgTable("automation_executions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  automationId: uuid("automation_id").references(() => communicationAutomations.id, { onDelete: "cascade" }).notNull(),
  executedAt: timestamp("executed_at").defaultNow(),
  status: text("status", { enum: ['success', 'failed', 'partial'] }).notNull(),
  totalSent: bigint("total_sent", { mode: "number" }).default(0),
  totalFailed: bigint("total_failed", { mode: "number" }).default(0),
  errorMessage: text("error_message"),
  executionDetails: jsonb("execution_details"),
});

// Email sequences for multi-day automation
export const emailSequences = pgTable("email_sequences", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  
  // Trigger settings
  triggerType: text("trigger_type", { enum: ['immediate', 'scheduled', 'event'] }).notNull().default('immediate'),
  triggerEvent: text("trigger_event", { enum: ['account_created', 'payment_overdue', 'manual'] }),
  
  // Target audience
  targetType: text("target_type", { enum: ['all', 'folder', 'custom'] }).notNull(),
  targetFolderIds: uuid("target_folder_ids").array(),
  targetConsumerIds: uuid("target_consumer_ids").array(),
  
  // Tracking
  totalEnrolled: bigint("total_enrolled", { mode: "number" }).default(0),
  totalCompleted: bigint("total_completed", { mode: "number" }).default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Individual steps in an email sequence
export const emailSequenceSteps = pgTable("email_sequence_steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: uuid("sequence_id").references(() => emailSequences.id, { onDelete: "cascade" }).notNull(),
  templateId: uuid("template_id").references(() => emailTemplates.id, { onDelete: "cascade" }).notNull(),
  
  stepOrder: bigint("step_order", { mode: "number" }).notNull(), // 1, 2, 3, etc.
  delayDays: bigint("delay_days", { mode: "number" }).default(0), // Days to wait before sending
  delayHours: bigint("delay_hours", { mode: "number" }).default(0), // Additional hours to wait
  
  // Step conditions (optional)
  conditions: jsonb("conditions"), // JSON for advanced conditions
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Track individual consumer progress through sequences
export const emailSequenceEnrollments = pgTable("email_sequence_enrollments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: uuid("sequence_id").references(() => emailSequences.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  
  // Progress tracking
  currentStepId: uuid("current_step_id").references(() => emailSequenceSteps.id),
  currentStepOrder: bigint("current_step_order", { mode: "number" }).default(1),
  status: text("status", { enum: ['active', 'completed', 'paused', 'cancelled'] }).notNull().default('active'),
  
  // Timing
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  nextEmailAt: timestamp("next_email_at"), // When the next email should be sent
  completedAt: timestamp("completed_at"),
  lastEmailSentAt: timestamp("last_email_sent_at"),
  
  // Tracking
  emailsSent: bigint("emails_sent", { mode: "number" }).default(0),
  emailsOpened: bigint("emails_opened", { mode: "number" }).default(0),
  emailsClicked: bigint("emails_clicked", { mode: "number" }).default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations for automations
export const communicationAutomationsRelations = relations(communicationAutomations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [communicationAutomations.tenantId],
    references: [tenants.id],
  }),
  executions: many(automationExecutions),
}));

export const automationExecutionsRelations = relations(automationExecutions, ({ one }) => ({
  automation: one(communicationAutomations, {
    fields: [automationExecutions.automationId],
    references: [communicationAutomations.id],
  }),
}));

// Email sequence relations
export const emailSequencesRelations = relations(emailSequences, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [emailSequences.tenantId],
    references: [tenants.id],
  }),
  steps: many(emailSequenceSteps),
  enrollments: many(emailSequenceEnrollments),
}));

export const emailSequenceStepsRelations = relations(emailSequenceSteps, ({ one }) => ({
  sequence: one(emailSequences, {
    fields: [emailSequenceSteps.sequenceId],
    references: [emailSequences.id],
  }),
  template: one(emailTemplates, {
    fields: [emailSequenceSteps.templateId],
    references: [emailTemplates.id],
  }),
}));

export const emailSequenceEnrollmentsRelations = relations(emailSequenceEnrollments, ({ one }) => ({
  sequence: one(emailSequences, {
    fields: [emailSequenceEnrollments.sequenceId],
    references: [emailSequences.id],
  }),
  consumer: one(consumers, {
    fields: [emailSequenceEnrollments.consumerId],
    references: [consumers.id],
  }),
  currentStep: one(emailSequenceSteps, {
    fields: [emailSequenceEnrollments.currentStepId],
    references: [emailSequenceSteps.id],
  }),
}));

// Insert schemas
export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true });
export const insertAgencyCredentialsSchema = createInsertSchema(agencyCredentials).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  lastLoginAt: true 
});
export const agencyTrialRegistrationSchema = createInsertSchema(tenants).pick({
  ownerFirstName: true,
  ownerLastName: true,
  ownerDateOfBirth: true,
  ownerSSN: true,
  businessName: true,
  phoneNumber: true,
  email: true,
}).extend({
  ownerFirstName: z.string().min(1, "First name is required"),
  ownerLastName: z.string().min(1, "Last name is required"),
  ownerDateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  ownerSSN: z.string().regex(/^\d{9}$/, "SSN must be 9 digits"),
  businessName: z.string().min(1, "Business name is required"),
  phoneNumber: z.string().regex(/^\d{10}$/, "Phone number must be 10 digits"),
  email: z.string().email("Valid email is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export const insertPlatformUserSchema = createInsertSchema(platformUsers).omit({ id: true, createdAt: true });
export const insertConsumerSchema = createInsertSchema(consumers).omit({ id: true, createdAt: true });
export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, createdAt: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertArrangementOptionSchema = createInsertSchema(arrangementOptions)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .superRefine((data, ctx) => {
    if (data.minBalance == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minBalance"],
        message: "Minimum balance is required",
      });
    }

    if (data.maxBalance == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxBalance"],
        message: "Maximum balance is required",
      });
    }

    if (data.minBalance != null && data.maxBalance != null && data.minBalance > data.maxBalance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxBalance"],
        message: "Maximum balance must be greater than or equal to minimum balance",
      });
    }

    switch (data.planType) {
      case "range": {
        if (data.monthlyPaymentMin == null || data.monthlyPaymentMax == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["monthlyPaymentMin"],
            message: "Monthly payment range is required",
          });
        }

        if (
          data.monthlyPaymentMin != null &&
          data.monthlyPaymentMax != null &&
          data.monthlyPaymentMin > data.monthlyPaymentMax
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["monthlyPaymentMax"],
            message: "Maximum monthly payment must be greater than or equal to the minimum",
          });
        }
        break;
      }
      case "fixed_monthly": {
        if (data.fixedMonthlyPayment == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fixedMonthlyPayment"],
            message: "Monthly payment amount is required",
          });
        }
        break;
      }
      case "pay_in_full": {
        if (data.payInFullAmount == null && !data.payoffText) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["payInFullAmount"],
            message: "Provide a payoff amount or custom payoff text",
          });
        }
        break;
      }
      case "custom_terms": {
        if (!data.customTermsText) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["customTermsText"],
            message: "Custom terms copy is required",
          });
        }
        break;
      }
      default: {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["planType"],
          message: "Unsupported plan type",
        });
      }
    }

    if (data.maxTermMonths != null && data.maxTermMonths < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxTermMonths"],
        message: "Max term must be positive",
      });
    }
  });
export const insertTenantSettingsSchema = createInsertSchema(tenantSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmailCampaignSchema = createInsertSchema(emailCampaigns).omit({ id: true, createdAt: true, completedAt: true });
export const insertEmailTrackingSchema = createInsertSchema(emailTracking).omit({ id: true });
export const insertConsumerNotificationSchema = createInsertSchema(consumerNotifications).omit({ id: true, createdAt: true });
export const insertCallbackRequestSchema = createInsertSchema(callbackRequests).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertMessagingUsageEventSchema = createInsertSchema(messagingUsageEvents).omit({ id: true, createdAt: true });
export const insertFolderSchema = createInsertSchema(folders).omit({ id: true, createdAt: true });
export const insertSmsTemplateSchema = createInsertSchema(smsTemplates).omit({ id: true, createdAt: true });
export const insertSmsCampaignSchema = createInsertSchema(smsCampaigns).omit({ id: true, createdAt: true, completedAt: true });
export const insertSmsTrackingSchema = createInsertSchema(smsTracking).omit({ id: true });
export const insertCommunicationAutomationSchema = createInsertSchema(communicationAutomations).omit({ id: true, createdAt: true, updatedAt: true, lastExecuted: true, nextExecution: true, totalSent: true, currentTemplateIndex: true });
export const insertAutomationExecutionSchema = createInsertSchema(automationExecutions).omit({ id: true, executedAt: true });
export const insertEmailSequenceSchema = createInsertSchema(emailSequences).omit({ id: true, createdAt: true, updatedAt: true, totalEnrolled: true, totalCompleted: true });
export const insertEmailSequenceStepSchema = createInsertSchema(emailSequenceSteps).omit({ id: true, createdAt: true });
export const insertEmailSequenceEnrollmentSchema = createInsertSchema(emailSequenceEnrollments).omit({ id: true, createdAt: true, updatedAt: true, emailsSent: true, emailsOpened: true, emailsClicked: true });

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type AgencyTrialRegistration = z.infer<typeof agencyTrialRegistrationSchema>;
export type SelectAgencyCredentials = typeof agencyCredentials.$inferSelect;
export type InsertAgencyCredentials = typeof agencyCredentials.$inferInsert;
export type PlatformUser = typeof platformUsers.$inferSelect;
export type InsertPlatformUser = z.infer<typeof insertPlatformUserSchema>;
export type Consumer = typeof consumers.$inferSelect;
export type InsertConsumer = z.infer<typeof insertConsumerSchema>;
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type ArrangementOption = typeof arrangementOptions.$inferSelect;
export type InsertArrangementOption = z.infer<typeof insertArrangementOptionSchema>;
export type TenantSettings = typeof tenantSettings.$inferSelect;
export type InsertTenantSettings = z.infer<typeof insertTenantSettingsSchema>;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type EmailTracking = typeof emailTracking.$inferSelect;
export type InsertEmailTracking = z.infer<typeof insertEmailTrackingSchema>;
export type ConsumerNotification = typeof consumerNotifications.$inferSelect;
export type InsertConsumerNotification = z.infer<typeof insertConsumerNotificationSchema>;
export type CallbackRequest = typeof callbackRequests.$inferSelect;
export type InsertCallbackRequest = z.infer<typeof insertCallbackRequestSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type MessagingUsageEvent = typeof messagingUsageEvents.$inferSelect;
export type InsertMessagingUsageEvent = z.infer<typeof insertMessagingUsageEventSchema>;
export type Folder = typeof folders.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type SmsTemplate = typeof smsTemplates.$inferSelect;
export type InsertSmsTemplate = z.infer<typeof insertSmsTemplateSchema>;
export type SmsCampaign = typeof smsCampaigns.$inferSelect;
export type InsertSmsCampaign = z.infer<typeof insertSmsCampaignSchema>;
export type SmsTracking = typeof smsTracking.$inferSelect;
export type InsertSmsTracking = z.infer<typeof insertSmsTrackingSchema>;
export type CommunicationAutomation = typeof communicationAutomations.$inferSelect;
export type InsertCommunicationAutomation = z.infer<typeof insertCommunicationAutomationSchema>;
export type AutomationExecution = typeof automationExecutions.$inferSelect;
export type InsertAutomationExecution = z.infer<typeof insertAutomationExecutionSchema>;
export type EmailSequence = typeof emailSequences.$inferSelect;
export type InsertEmailSequence = z.infer<typeof insertEmailSequenceSchema>;
export type EmailSequenceStep = typeof emailSequenceSteps.$inferSelect;
export type InsertEmailSequenceStep = z.infer<typeof insertEmailSequenceStepSchema>;
export type EmailSequenceEnrollment = typeof emailSequenceEnrollments.$inferSelect;
export type InsertEmailSequenceEnrollment = z.infer<typeof insertEmailSequenceEnrollmentSchema>;
