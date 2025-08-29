import {
  users,
  tenants,
  platformUsers,
  consumers,
  accounts,
  emailTemplates,
  emailCampaigns,
  emailTracking,
  documents,
  arrangementOptions,
  tenantSettings,
  consumerNotifications,
  callbackRequests,
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
  type EmailCampaign,
  type InsertEmailCampaign,
  type EmailTracking,
  type InsertEmailTracking,
  type Document,
  type InsertDocument,
  type ArrangementOption,
  type InsertArrangementOption,
  type TenantSettings,
  type InsertTenantSettings,
  type ConsumerNotification,
  type InsertConsumerNotification,
  type CallbackRequest,
  type InsertCallbackRequest,
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
  deleteEmailTemplate(id: string, tenantId: string): Promise<void>;
  
  // Email campaign operations
  getEmailCampaignsByTenant(tenantId: string): Promise<(EmailCampaign & { templateName: string })[]>;
  createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign>;
  updateEmailCampaign(id: string, updates: Partial<EmailCampaign>): Promise<EmailCampaign>;
  
  // Email metrics operations
  getEmailMetricsByTenant(tenantId: string): Promise<any>;
  
  // Consumer registration operations
  registerConsumer(consumerData: InsertConsumer): Promise<Consumer>;
  getConsumerByEmailAndTenant(email: string, tenantSlug: string): Promise<Consumer | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  
  // Notification operations
  createNotification(notification: InsertConsumerNotification): Promise<ConsumerNotification>;
  getNotificationsByConsumer(consumerId: string): Promise<ConsumerNotification[]>;
  markNotificationRead(notificationId: string): Promise<void>;
  
  // Callback request operations
  createCallbackRequest(request: InsertCallbackRequest): Promise<CallbackRequest>;
  getCallbackRequestsByTenant(tenantId: string): Promise<(CallbackRequest & { consumerName: string })[]>;
  updateCallbackRequest(id: string, updates: Partial<CallbackRequest>): Promise<CallbackRequest>;
  
  // Document operations
  getDocumentsByTenant(tenantId: string): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  deleteDocument(id: string): Promise<void>;
  
  // Arrangement options operations
  getArrangementOptionsByTenant(tenantId: string): Promise<ArrangementOption[]>;
  createArrangementOption(option: InsertArrangementOption): Promise<ArrangementOption>;
  updateArrangementOption(id: string, option: Partial<InsertArrangementOption>): Promise<ArrangementOption>;
  deleteArrangementOption(id: string): Promise<void>;
  
  // Tenant settings operations
  getTenantSettings(tenantId: string): Promise<TenantSettings | undefined>;
  upsertTenantSettings(settings: InsertTenantSettings): Promise<TenantSettings>;
  
  // Tenant setup (for fixing access issues)
  setupTenantForUser(authId: string, tenantData: InsertTenant): Promise<{ tenant: Tenant; platformUser: PlatformUser }>;
  
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
    
    // Check if consumer is registered and send notification
    await this.notifyConsumerAccountAdded(newAccount);
    
    return newAccount;
  }

  async bulkCreateAccounts(accountsData: InsertAccount[]): Promise<Account[]> {
    const newAccounts = await db.insert(accounts).values(accountsData).returning();
    
    // Send notifications for registered consumers
    for (const account of newAccounts) {
      await this.notifyConsumerAccountAdded(account);
    }
    
    return newAccounts;
  }
  
  private async notifyConsumerAccountAdded(account: Account): Promise<void> {
    try {
      // Get consumer details
      const consumer = await this.getConsumer(account.consumerId);
      if (!consumer || !consumer.isRegistered) {
        return; // Only notify registered consumers
      }
      
      // Get tenant for company info
      const tenant = await this.getTenant(account.tenantId);
      if (!tenant) return;
      
      // Create notification
      await this.createNotification({
        tenantId: account.tenantId,
        consumerId: account.consumerId,
        accountId: account.id,
        type: 'account_added',
        title: `New Account Added - ${account.creditor}`,
        message: `A new account from ${account.creditor} has been added to your profile with a balance of $${((account.balanceCents || 0) / 100).toFixed(2)}. You can now view details and set up payment arrangements.`,
        metadata: {
          accountNumber: account.accountNumber,
          creditor: account.creditor,
          balance: account.balanceCents,
          companyName: tenant.name,
        },
      });
      
      // TODO: Send email notification if consumer has email preferences enabled
      // This would integrate with your email service provider
    } catch (error) {
      console.error('Error sending account notification:', error);
      // Don't throw - we don't want to fail account creation if notification fails
    }
  }

  // Email template operations
  async getEmailTemplatesByTenant(tenantId: string): Promise<EmailTemplate[]> {
    return await db.select().from(emailTemplates).where(eq(emailTemplates.tenantId, tenantId));
  }

  async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    const [newTemplate] = await db.insert(emailTemplates).values(template).returning();
    return newTemplate;
  }

  async deleteEmailTemplate(id: string, tenantId: string): Promise<void> {
    await db.delete(emailTemplates)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.tenantId, tenantId)));
  }

  // Email campaign operations
  async getEmailCampaignsByTenant(tenantId: string): Promise<(EmailCampaign & { templateName: string })[]> {
    const result = await db
      .select()
      .from(emailCampaigns)
      .leftJoin(emailTemplates, eq(emailCampaigns.templateId, emailTemplates.id))
      .where(eq(emailCampaigns.tenantId, tenantId))
      .orderBy(desc(emailCampaigns.createdAt));
    
    return result.map(row => ({
      ...row.email_campaigns,
      templateName: row.email_templates?.name || 'Unknown Template',
    }));
  }

  async createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign> {
    const [newCampaign] = await db.insert(emailCampaigns).values(campaign).returning();
    return newCampaign;
  }

  async updateEmailCampaign(id: string, updates: Partial<EmailCampaign>): Promise<EmailCampaign> {
    const [updatedCampaign] = await db.update(emailCampaigns).set(updates).where(eq(emailCampaigns.id, id)).returning();
    return updatedCampaign;
  }

  // Email metrics operations
  async getEmailMetricsByTenant(tenantId: string): Promise<any> {
    const campaigns = await db.select().from(emailCampaigns).where(eq(emailCampaigns.tenantId, tenantId));
    
    const totalSent = campaigns.reduce((sum, c) => sum + (c.totalSent || 0), 0);
    const totalDelivered = campaigns.reduce((sum, c) => sum + (c.totalDelivered || 0), 0);
    const totalOpened = campaigns.reduce((sum, c) => sum + (c.totalOpened || 0), 0);
    const totalClicked = campaigns.reduce((sum, c) => sum + (c.totalClicked || 0), 0);
    const totalErrors = campaigns.reduce((sum, c) => sum + (c.totalErrors || 0), 0);
    const totalOptOuts = campaigns.reduce((sum, c) => sum + (c.totalOptOuts || 0), 0);

    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recent7 = campaigns.filter(c => c.createdAt && c.createdAt >= last7Days).reduce((sum, c) => sum + (c.totalSent || 0), 0);
    const recent30 = campaigns.filter(c => c.createdAt && c.createdAt >= last30Days).reduce((sum, c) => sum + (c.totalSent || 0), 0);

    return {
      totalSent,
      totalDelivered,
      totalOpened,
      totalClicked,
      totalErrors,
      totalOptOuts,
      openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
      clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
      conversionRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
      optOutRate: totalSent > 0 ? Math.round((totalOptOuts / totalSent) * 100) : 0,
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
      last7Days: recent7,
      last30Days: recent30,
      sentThisMonth: recent30,
      bestTemplate: campaigns.length > 0 ? campaigns.sort((a, b) => (b.totalOpened || 0) - (a.totalOpened || 0))[0]?.name || "None yet" : "None yet",
    };
  }

  // Consumer registration operations
  async registerConsumer(consumerData: InsertConsumer): Promise<Consumer> {
    const [newConsumer] = await db.insert(consumers).values({
      ...consumerData,
      isRegistered: true,
      registrationDate: new Date(),
    }).returning();
    return newConsumer;
  }

  async getConsumerByEmailAndTenant(email: string, tenantSlug: string): Promise<Consumer | undefined> {
    const tenant = await this.getTenantBySlug(tenantSlug);
    if (!tenant) return undefined;
    
    const [consumer] = await db.select()
      .from(consumers)
      .where(and(eq(consumers.email, email), eq(consumers.tenantId, tenant.id)));
    return consumer || undefined;
  }


  // Notification operations
  async createNotification(notification: InsertConsumerNotification): Promise<ConsumerNotification> {
    const [newNotification] = await db.insert(consumerNotifications).values(notification).returning();
    return newNotification;
  }

  async getNotificationsByConsumer(consumerId: string): Promise<ConsumerNotification[]> {
    return await db.select()
      .from(consumerNotifications)
      .where(eq(consumerNotifications.consumerId, consumerId))
      .orderBy(desc(consumerNotifications.createdAt));
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    await db.update(consumerNotifications)
      .set({ isRead: true })
      .where(eq(consumerNotifications.id, notificationId));
  }

  // Callback request operations
  async createCallbackRequest(request: InsertCallbackRequest): Promise<CallbackRequest> {
    const [newRequest] = await db.insert(callbackRequests).values(request).returning();
    return newRequest;
  }

  async getCallbackRequestsByTenant(tenantId: string): Promise<(CallbackRequest & { consumerName: string })[]> {
    const result = await db
      .select()
      .from(callbackRequests)
      .leftJoin(consumers, eq(callbackRequests.consumerId, consumers.id))
      .where(eq(callbackRequests.tenantId, tenantId))
      .orderBy(desc(callbackRequests.createdAt));
    
    return result.map(row => ({
      ...row.callback_requests,
      consumerName: row.consumers ? `${row.consumers.firstName} ${row.consumers.lastName}` : 'Unknown Consumer',
    }));
  }

  async updateCallbackRequest(id: string, updates: Partial<CallbackRequest>): Promise<CallbackRequest> {
    const [updatedRequest] = await db.update(callbackRequests)
      .set(updates)
      .where(eq(callbackRequests.id, id))
      .returning();
    return updatedRequest;
  }

  // Document operations
  async getDocumentsByTenant(tenantId: string): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.tenantId, tenantId));
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db.insert(documents).values(document).returning();
    return newDocument;
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // Arrangement options operations
  async getArrangementOptionsByTenant(tenantId: string): Promise<ArrangementOption[]> {
    return await db.select().from(arrangementOptions).where(and(eq(arrangementOptions.tenantId, tenantId), eq(arrangementOptions.isActive, true)));
  }

  async createArrangementOption(option: InsertArrangementOption): Promise<ArrangementOption> {
    const [newOption] = await db.insert(arrangementOptions).values(option).returning();
    return newOption;
  }

  async updateArrangementOption(id: string, option: Partial<InsertArrangementOption>): Promise<ArrangementOption> {
    const [updatedOption] = await db.update(arrangementOptions).set({
      ...option,
      updatedAt: new Date(),
    }).where(eq(arrangementOptions.id, id)).returning();
    return updatedOption;
  }

  async deleteArrangementOption(id: string): Promise<void> {
    await db.delete(arrangementOptions).where(eq(arrangementOptions.id, id));
  }

  // Tenant settings operations
  async getTenantSettings(tenantId: string): Promise<TenantSettings | undefined> {
    const [settings] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
    return settings;
  }

  async upsertTenantSettings(settings: InsertTenantSettings): Promise<TenantSettings> {
    const { tenantId, ...settingsData } = settings;
    const [upsertedSettings] = await db
      .insert(tenantSettings)
      .values(settings)
      .onConflictDoUpdate({
        target: tenantSettings.tenantId,
        set: settingsData,
      })
      .returning();
    return upsertedSettings;
  }

  // Tenant setup helper
  async setupTenantForUser(authId: string, tenantData: InsertTenant): Promise<{ tenant: Tenant; platformUser: PlatformUser }> {
    // Create tenant
    const [tenant] = await db.insert(tenants).values(tenantData).returning();
    
    // Create platform user link
    const [platformUser] = await db.insert(platformUsers).values({
      authId,
      tenantId: tenant.id,
      role: 'owner', // Default role for tenant creator
    }).returning();

    // Create default tenant settings
    await this.upsertTenantSettings({
      tenantId: tenant.id,
      showPaymentPlans: true,
      showDocuments: true,
      allowSettlementRequests: true,
    });

    return { tenant, platformUser };
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
