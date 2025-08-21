import {
  users,
  tenants,
  platformUsers,
  consumers,
  accounts,
  emailTemplates,
  type User,
  type UpsertUser,
  type Tenant,
  type InsertTenant,
  type PlatformUser,
  type InsertPlatformUser,
  type Consumer,
  type InsertConsumer,
  type Account,
  type InsertAccount,
  type EmailTemplate,
  type InsertEmailTemplate,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Tenant operations
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  
  // Platform user operations
  getPlatformUser(authId: string): Promise<PlatformUser | undefined>;
  getPlatformUserWithTenant(authId: string): Promise<(PlatformUser & { tenant: Tenant }) | undefined>;
  createPlatformUser(platformUser: InsertPlatformUser): Promise<PlatformUser>;
  
  // Consumer operations
  getConsumersByTenant(tenantId: string): Promise<Consumer[]>;
  getConsumer(id: string): Promise<Consumer | undefined>;
  createConsumer(consumer: InsertConsumer): Promise<Consumer>;
  
  // Account operations
  getAccountsByTenant(tenantId: string): Promise<(Account & { consumer: Consumer })[]>;
  getAccountsByConsumer(consumerId: string): Promise<Account[]>;
  createAccount(account: InsertAccount): Promise<Account>;
  bulkCreateAccounts(accounts: InsertAccount[]): Promise<Account[]>;
  
  // Email template operations
  getEmailTemplatesByTenant(tenantId: string): Promise<EmailTemplate[]>;
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  
  // Stats operations
  getTenantStats(tenantId: string): Promise<{
    totalConsumers: number;
    activeAccounts: number;
    totalBalance: number;
    collectionRate: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Tenant operations
  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [newTenant] = await db.insert(tenants).values(tenant).returning();
    return newTenant;
  }

  // Platform user operations
  async getPlatformUser(authId: string): Promise<PlatformUser | undefined> {
    const [platformUser] = await db.select().from(platformUsers).where(eq(platformUsers.authId, authId));
    return platformUser;
  }

  async getPlatformUserWithTenant(authId: string): Promise<(PlatformUser & { tenant: Tenant }) | undefined> {
    const result = await db
      .select()
      .from(platformUsers)
      .leftJoin(tenants, eq(platformUsers.tenantId, tenants.id))
      .where(eq(platformUsers.authId, authId));
    
    if (result.length === 0) return undefined;
    
    const [row] = result;
    if (!row.tenants) return undefined;
    
    return {
      ...row.platform_users,
      tenant: row.tenants,
    };
  }

  async createPlatformUser(platformUser: InsertPlatformUser): Promise<PlatformUser> {
    const [newPlatformUser] = await db.insert(platformUsers).values(platformUser).returning();
    return newPlatformUser;
  }

  // Consumer operations
  async getConsumersByTenant(tenantId: string): Promise<Consumer[]> {
    return await db.select().from(consumers).where(eq(consumers.tenantId, tenantId));
  }

  async getConsumer(id: string): Promise<Consumer | undefined> {
    const [consumer] = await db.select().from(consumers).where(eq(consumers.id, id));
    return consumer;
  }

  async createConsumer(consumer: InsertConsumer): Promise<Consumer> {
    const [newConsumer] = await db.insert(consumers).values(consumer).returning();
    return newConsumer;
  }

  // Account operations
  async getAccountsByTenant(tenantId: string): Promise<(Account & { consumer: Consumer })[]> {
    const result = await db
      .select()
      .from(accounts)
      .leftJoin(consumers, eq(accounts.consumerId, consumers.id))
      .where(eq(accounts.tenantId, tenantId))
      .orderBy(desc(accounts.createdAt));
    
    return result.map(row => ({
      ...row.accounts,
      consumer: row.consumers!,
    }));
  }

  async getAccountsByConsumer(consumerId: string): Promise<Account[]> {
    return await db.select().from(accounts).where(eq(accounts.consumerId, consumerId));
  }

  async createAccount(account: InsertAccount): Promise<Account> {
    const [newAccount] = await db.insert(accounts).values(account).returning();
    return newAccount;
  }

  async bulkCreateAccounts(accountsData: InsertAccount[]): Promise<Account[]> {
    return await db.insert(accounts).values(accountsData).returning();
  }

  // Email template operations
  async getEmailTemplatesByTenant(tenantId: string): Promise<EmailTemplate[]> {
    return await db.select().from(emailTemplates).where(eq(emailTemplates.tenantId, tenantId));
  }

  async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    const [newTemplate] = await db.insert(emailTemplates).values(template).returning();
    return newTemplate;
  }

  // Stats operations
  async getTenantStats(tenantId: string): Promise<{
    totalConsumers: number;
    activeAccounts: number;
    totalBalance: number;
    collectionRate: number;
  }> {
    const tenantConsumers = await db.select().from(consumers).where(eq(consumers.tenantId, tenantId));
    const tenantAccounts = await db.select().from(accounts).where(eq(accounts.tenantId, tenantId));
    
    const totalConsumers = tenantConsumers.length;
    const activeAccounts = tenantAccounts.filter(account => account.status === 'active').length;
    const totalBalance = tenantAccounts.reduce((sum, account) => sum + (account.balanceCents || 0), 0) / 100;
    const collectionRate = 68; // This would be calculated based on actual payment data
    
    return {
      totalConsumers,
      activeAccounts,
      totalBalance,
      collectionRate,
    };
  }
}

export const storage = new DatabaseStorage();
