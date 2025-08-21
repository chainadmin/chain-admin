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

// Relations
export const tenantsRelations = relations(tenants, ({ many }) => ({
  platformUsers: many(platformUsers),
  consumers: many(consumers),
  accounts: many(accounts),
  emailTemplates: many(emailTemplates),
  senderIdentities: many(senderIdentities),
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

// Insert schemas
export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true });
export const insertPlatformUserSchema = createInsertSchema(platformUsers).omit({ id: true, createdAt: true });
export const insertConsumerSchema = createInsertSchema(consumers).omit({ id: true, createdAt: true });
export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, createdAt: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, createdAt: true });

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
