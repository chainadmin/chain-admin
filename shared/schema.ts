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
  createdAt: timestamp("created_at").defaultNow(),
});

// Platform users (agency users)
export const platformUsers = pgTable("platform_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  authId: varchar("auth_id").notNull().references(() => users.id),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  role: text("role", { enum: ['platform_admin', 'owner', 'manager', 'agent'] }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Consumers (end users)
export const consumers = pgTable("consumers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  contactPrefs: jsonb("contact_prefs").default(sql`'{}'::jsonb`),
  additionalData: jsonb("additional_data").default(sql`'{}'::jsonb`), // Store custom CSV columns
  createdAt: timestamp("created_at").defaultNow(),
});

// Accounts (debts)
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
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
export const arrangementOptions = pgTable("arrangement_options", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(), // e.g., "Standard Payment Plan"
  description: text("description"),
  minBalance: bigint("min_balance", { mode: "number" }).notNull(), // In cents
  maxBalance: bigint("max_balance", { mode: "number" }).notNull(), // In cents
  monthlyPaymentMin: bigint("monthly_payment_min", { mode: "number" }).notNull(), // In cents
  monthlyPaymentMax: bigint("monthly_payment_max", { mode: "number" }).notNull(), // In cents
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  platformUsers: many(platformUsers),
  consumers: many(consumers),
  accounts: many(accounts),
  emailTemplates: many(emailTemplates),
  emailCampaigns: many(emailCampaigns),
  senderIdentities: many(senderIdentities),
  documents: many(documents),
  arrangementOptions: many(arrangementOptions),
  settings: one(tenantSettings, {
    fields: [tenants.id],
    references: [tenantSettings.tenantId],
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
  accounts: many(accounts),
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

// Insert schemas
export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true });
export const insertPlatformUserSchema = createInsertSchema(platformUsers).omit({ id: true, createdAt: true });
export const insertConsumerSchema = createInsertSchema(consumers).omit({ id: true, createdAt: true });
export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, createdAt: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertArrangementOptionSchema = createInsertSchema(arrangementOptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTenantSettingsSchema = createInsertSchema(tenantSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmailCampaignSchema = createInsertSchema(emailCampaigns).omit({ id: true, createdAt: true, completedAt: true });
export const insertEmailTrackingSchema = createInsertSchema(emailTracking).omit({ id: true });

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
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
