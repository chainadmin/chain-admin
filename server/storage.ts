import {
  users,
  tenants,
  platformUsers,
  agencyCredentials,
  consumers,
  accounts,
  folders,
  emailTemplates,
  emailCampaigns,
  emailTracking,
  smsTemplates,
  smsCampaigns,
  smsTracking,
  communicationAutomations,
  automationExecutions,
  emailSequences,
  emailSequenceSteps,
  emailSequenceEnrollments,
  documents,
  arrangementOptions,
  tenantSettings,
  consumerNotifications,
  callbackRequests,
  payments,
  subscriptions,
  invoices,
  type User,
  type UpsertUser,
  type Tenant,
  type InsertTenant,
  type PlatformUser,
  type InsertPlatformUser,
  type SelectAgencyCredentials,
  type InsertAgencyCredentials,
  type Consumer,
  type InsertConsumer,
  type Account,
  type InsertAccount,
  type Folder,
  type InsertFolder,
  type EmailTemplate,
  type InsertEmailTemplate,
  type EmailCampaign,
  type InsertEmailCampaign,
  type EmailTracking,
  type InsertEmailTracking,
  type SmsTemplate,
  type InsertSmsTemplate,
  type SmsCampaign,
  type InsertSmsCampaign,
  type SmsTracking,
  type InsertSmsTracking,
  type CommunicationAutomation,
  type InsertCommunicationAutomation,
  type AutomationExecution,
  type InsertAutomationExecution,
  type EmailSequence,
  type InsertEmailSequence,
  type EmailSequenceStep,
  type InsertEmailSequenceStep,
  type EmailSequenceEnrollment,
  type InsertEmailSequenceEnrollment,
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
  type Payment,
  type InsertPayment,
  type Subscription,
  type InsertSubscription,
  type Invoice,
  type InsertInvoice,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Tenant operations
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  getTenantByEmail(email: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  createTrialTenant(data: {
    name: string;
    slug: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerDateOfBirth: string;
    ownerSSN: string;
    businessName: string;
    phoneNumber: string;
    email: string;
  }): Promise<Tenant>;
  createTenantWithPostmark(data: {
    name: string;
    email: string;
    postmarkServerId: string;
    postmarkServerToken: string;
    postmarkServerName: string;
  }): Promise<Tenant>;
  
  // Global admin operations
  getAllTenants(): Promise<Tenant[]>;
  getConsumerCountByTenant(tenantId: string): Promise<number>;
  getAccountCountByTenant(tenantId: string): Promise<number>;
  getTotalBalanceByTenant(tenantId: string): Promise<number>;
  getPlatformStats(): Promise<any>;
  updateTenantStatus(id: string, updates: { isActive: boolean; suspensionReason?: string | null; suspendedAt?: Date | null }): Promise<Tenant>;
  upgradeTenantToPaid(id: string): Promise<Tenant>;
  
  // Platform user operations
  getPlatformUser(authId: string): Promise<PlatformUser | undefined>;
  getPlatformUserWithTenant(authId: string): Promise<(PlatformUser & { tenant: Tenant }) | undefined>;
  createPlatformUser(platformUser: InsertPlatformUser): Promise<PlatformUser>;
  
  // Agency credentials operations
  getAgencyCredentialsByUsername(username: string): Promise<SelectAgencyCredentials | undefined>;
  getAgencyCredentialsById(id: string): Promise<SelectAgencyCredentials | undefined>;
  createAgencyCredentials(credentials: InsertAgencyCredentials): Promise<SelectAgencyCredentials>;
  updateAgencyLoginTime(id: string): Promise<void>;
  
  // Consumer operations
  getConsumersByTenant(tenantId: string): Promise<Consumer[]>;
  getConsumer(id: string): Promise<Consumer | undefined>;
  getConsumerByEmail(email: string): Promise<Consumer | undefined>;
  getConsumersByEmail(email: string): Promise<Consumer[]>;
  getConsumerByEmailAndTenant(email: string, tenantIdentifier: string): Promise<Consumer | undefined>;
  createConsumer(consumer: InsertConsumer): Promise<Consumer>;
  updateConsumer(id: string, updates: Partial<Consumer>): Promise<Consumer>;
  findOrCreateConsumer(consumerData: InsertConsumer): Promise<Consumer>;
  findAccountsByConsumerEmail(email: string): Promise<(Account & { consumer: Consumer })[]>;
  deleteConsumer(id: string, tenantId: string): Promise<void>;
  
  // Folder operations
  getFoldersByTenant(tenantId: string): Promise<Folder[]>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  deleteFolder(id: string, tenantId: string): Promise<void>;
  getDefaultFolder(tenantId: string): Promise<Folder | undefined>;
  ensureDefaultFolders(tenantId: string): Promise<void>;
  
  // Account operations
  getAccount(id: string): Promise<(Account & { consumer?: Consumer; folder?: Folder }) | undefined>;
  getAccountsByTenant(tenantId: string): Promise<(Account & { consumer: Consumer; folder?: Folder })[]>;
  getAccountsByFolder(folderId: string): Promise<(Account & { consumer: Consumer })[]>;
  getAccountsByConsumer(consumerId: string): Promise<Account[]>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: string, updates: Partial<Account>): Promise<Account>;
  bulkCreateAccounts(accounts: InsertAccount[]): Promise<Account[]>;
  
  // Email template operations
  getEmailTemplatesByTenant(tenantId: string): Promise<EmailTemplate[]>;
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  deleteEmailTemplate(id: string, tenantId: string): Promise<void>;
  
  // Email campaign operations
  getEmailCampaignsByTenant(tenantId: string): Promise<(EmailCampaign & { templateName: string })[]>;
  getEmailCampaignById(id: string, tenantId: string): Promise<EmailCampaign | undefined>;
  createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign>;
  updateEmailCampaign(id: string, updates: Partial<EmailCampaign>): Promise<EmailCampaign>;
  deleteEmailCampaign(id: string, tenantId: string): Promise<void>;
  
  // Email metrics operations
  getEmailMetricsByTenant(tenantId: string): Promise<any>;
  
  // SMS template operations
  getSmsTemplatesByTenant(tenantId: string): Promise<SmsTemplate[]>;
  createSmsTemplate(template: InsertSmsTemplate): Promise<SmsTemplate>;
  deleteSmsTemplate(id: string, tenantId: string): Promise<void>;
  
  // SMS campaign operations
  getSmsCampaignsByTenant(tenantId: string): Promise<(SmsCampaign & { templateName: string })[]>;
  getSmsCampaignById(id: string, tenantId: string): Promise<SmsCampaign | undefined>;
  createSmsCampaign(campaign: InsertSmsCampaign): Promise<SmsCampaign>;
  updateSmsCampaign(id: string, updates: Partial<SmsCampaign>): Promise<SmsCampaign>;
  deleteSmsCampaign(id: string, tenantId: string): Promise<void>;
  
  // SMS metrics operations
  getSmsMetricsByTenant(tenantId: string): Promise<any>;
  
  // SMS tracking operations
  createSmsTracking(tracking: InsertSmsTracking): Promise<SmsTracking>;
  
  // Automation operations
  getAutomationsByTenant(tenantId: string): Promise<CommunicationAutomation[]>;
  createAutomation(automation: InsertCommunicationAutomation): Promise<CommunicationAutomation>;
  updateAutomation(id: string, updates: Partial<CommunicationAutomation>): Promise<CommunicationAutomation>;
  deleteAutomation(id: string, tenantId: string): Promise<void>;
  getAutomationById(id: string, tenantId: string): Promise<CommunicationAutomation | undefined>;
  
  // Automation execution operations
  getAutomationExecutions(automationId: string): Promise<AutomationExecution[]>;
  createAutomationExecution(execution: InsertAutomationExecution): Promise<AutomationExecution>;
  getActiveAutomations(): Promise<CommunicationAutomation[]>;
  
  // Email sequence operations
  getEmailSequencesByTenant(tenantId: string): Promise<EmailSequence[]>;
  getEmailSequenceById(id: string, tenantId: string): Promise<EmailSequence | undefined>;
  createEmailSequence(sequence: InsertEmailSequence): Promise<EmailSequence>;
  updateEmailSequence(id: string, updates: Partial<EmailSequence>): Promise<EmailSequence>;
  deleteEmailSequence(id: string, tenantId: string): Promise<void>;
  
  // Email sequence steps operations
  getSequenceSteps(sequenceId: string): Promise<(EmailSequenceStep & { template: EmailTemplate })[]>;
  createSequenceStep(step: InsertEmailSequenceStep): Promise<EmailSequenceStep>;
  updateSequenceStep(id: string, updates: Partial<EmailSequenceStep>): Promise<EmailSequenceStep>;
  deleteSequenceStep(id: string): Promise<void>;
  reorderSequenceSteps(sequenceId: string, stepIds: string[]): Promise<void>;
  
  // Email sequence enrollment operations
  getSequenceEnrollments(sequenceId: string): Promise<(EmailSequenceEnrollment & { consumer: Consumer })[]>;
  enrollConsumerInSequence(enrollment: InsertEmailSequenceEnrollment): Promise<EmailSequenceEnrollment>;
  updateEnrollment(id: string, updates: Partial<EmailSequenceEnrollment>): Promise<EmailSequenceEnrollment>;
  getActiveEnrollments(): Promise<(EmailSequenceEnrollment & { sequence: EmailSequence; consumer: Consumer; currentStep?: EmailSequenceStep })[]>;
  pauseEnrollment(id: string): Promise<void>;
  resumeEnrollment(id: string): Promise<void>;
  cancelEnrollment(id: string): Promise<void>;
  
  // Consumer registration operations
  registerConsumer(consumerData: InsertConsumer): Promise<Consumer>;
  getConsumerByEmailAndTenant(email: string, tenantIdentifier: string): Promise<Consumer | undefined>;
  getConsumerByEmail(email: string, tenantId: string): Promise<Consumer | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  
  // Account management operations
  createAccount(account: InsertAccount): Promise<Account>;
  deleteAccount(id: string, tenantId: string): Promise<void>;
  bulkDeleteAccounts(ids: string[], tenantId: string): Promise<number>;
  
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
  updateArrangementOption(
    id: string,
    tenantId: string,
    option: Partial<InsertArrangementOption>,
  ): Promise<ArrangementOption | undefined>;
  deleteArrangementOption(id: string, tenantId: string): Promise<boolean>;
  
  // Tenant settings operations
  getTenantSettings(tenantId: string): Promise<TenantSettings | undefined>;
  upsertTenantSettings(settings: InsertTenantSettings): Promise<TenantSettings>;
  
  // Tenant setup (for fixing access issues)
  setupTenantForUser(authId: string, tenantData: InsertTenant): Promise<{ tenant: Tenant; platformUser: PlatformUser }>;
  
  // Payment operations
  getPaymentsByTenant(tenantId: string): Promise<(Payment & { consumerName?: string; consumerEmail?: string; accountCreditor?: string })[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentStats(tenantId: string): Promise<{
    totalProcessed: number;
    totalAmountCents: number;
    successfulPayments: number;
    failedPayments: number;
    pendingPayments: number;
  }>;
  
  // Billing operations
  getSubscriptionByTenant(tenantId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: string, updates: Partial<Subscription>): Promise<Subscription>;
  getInvoicesByTenant(tenantId: string): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  getCurrentInvoice(tenantId: string): Promise<Invoice | undefined>;
  getBillingStats(tenantId: string): Promise<{
    activeConsumers: number;
    monthlyBase: number;
    usageCharges: number;
    totalBill: number;
    nextBillDate: string;
  }>;
  
  // Company management operations
  getPlatformUsersByTenant(tenantId: string): Promise<(PlatformUser & { userDetails?: User })[]>;
  updateConsumer(id: string, updates: Partial<Consumer>): Promise<Consumer>;
  
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

  async getTenantByEmail(email: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email));
    return tenant;
  }

  async createTrialTenant(data: {
    name: string;
    slug: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerDateOfBirth: string;
    ownerSSN: string;
    businessName: string;
    phoneNumber: string;
    email: string;
  }): Promise<Tenant> {
    const [newTenant] = await db.insert(tenants).values({
      name: data.name,
      slug: data.slug,
      isTrialAccount: true,
      isPaidAccount: false,
      ownerFirstName: data.ownerFirstName,
      ownerLastName: data.ownerLastName,
      ownerDateOfBirth: data.ownerDateOfBirth,
      ownerSSN: data.ownerSSN,
      businessName: data.businessName,
      phoneNumber: data.phoneNumber,
      email: data.email,
      notifiedOwners: false,
    }).returning();
    return newTenant;
  }

  async createTenantWithPostmark(data: {
    name: string;
    email: string;
    postmarkServerId: string;
    postmarkServerToken: string;
    postmarkServerName: string;
  }): Promise<Tenant> {
    // Generate slug from name
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    
    const [newTenant] = await db.insert(tenants).values({
      name: data.name,
      slug: slug,
      email: data.email,
      isTrialAccount: false, // Created by admin as paid account
      isPaidAccount: true,
      postmarkServerId: data.postmarkServerId,
      postmarkServerToken: data.postmarkServerToken,
      postmarkServerName: data.postmarkServerName,
    }).returning();
    
    // Ensure default folders are created
    await this.ensureDefaultFolders(newTenant.id);
    
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
  
  // Agency credentials operations
  async getAgencyCredentialsByUsername(username: string): Promise<SelectAgencyCredentials | undefined> {
    const [credentials] = await db.select().from(agencyCredentials).where(eq(agencyCredentials.username, username));
    return credentials;
  }

  async getAgencyCredentialsById(id: string): Promise<SelectAgencyCredentials | undefined> {
    const [credentials] = await db.select().from(agencyCredentials).where(eq(agencyCredentials.id, id));
    return credentials;
  }

  async createAgencyCredentials(credentials: InsertAgencyCredentials): Promise<SelectAgencyCredentials> {
    const [newCredentials] = await db.insert(agencyCredentials).values(credentials).returning();
    return newCredentials;
  }

  async updateAgencyLoginTime(id: string): Promise<void> {
    await db.update(agencyCredentials)
      .set({ lastLoginAt: new Date() })
      .where(eq(agencyCredentials.id, id));
  }

  // Consumer operations
  async getConsumersByTenant(tenantId: string): Promise<Consumer[]> {
    return await db.select().from(consumers).where(eq(consumers.tenantId, tenantId));
  }

  async getConsumer(id: string): Promise<Consumer | undefined> {
    const [consumer] = await db.select().from(consumers).where(eq(consumers.id, id));
    return consumer;
  }

  async getConsumersByEmail(email: string): Promise<Consumer[]> {
    // Get all consumers with this email across all tenants
    return await db.select()
      .from(consumers)
      .where(eq(consumers.email, email));
  }

  async createConsumer(consumer: InsertConsumer): Promise<Consumer> {
    const [newConsumer] = await db.insert(consumers).values(consumer).returning();
    return newConsumer;
  }

  async updateConsumer(id: string, updates: Partial<Consumer>): Promise<Consumer> {
    const [updatedConsumer] = await db.update(consumers)
      .set(updates)
      .where(eq(consumers.id, id))
      .returning();
    return updatedConsumer;
  }

  async findAccountsByConsumerEmail(email: string): Promise<(Account & { consumer: Consumer })[]> {
    // Find all consumers with this email
    const consumersWithEmail = await db.select()
      .from(consumers)
      .where(eq(consumers.email, email));
    
    if (consumersWithEmail.length === 0) {
      return [];
    }

    // Get all accounts for these consumers
    const consumerIds = consumersWithEmail.map(c => c.id);
    const accountsList = await db.select({
      account: accounts,
      consumer: consumers
    })
      .from(accounts)
      .innerJoin(consumers, eq(accounts.consumerId, consumers.id))
      .where(sql`${accounts.consumerId} IN ${sql`(${sql.join(consumerIds.map(id => sql`${id}`), sql`, `)})`}`);

    return accountsList.map(row => ({
      ...row.account,
      consumer: row.consumer
    }));
  }

  async findOrCreateConsumer(consumerData: InsertConsumer): Promise<Consumer> {
    // Check for existing consumer by email and tenant (unique within tenant)
    if (!consumerData.email || !consumerData.tenantId) {
      // If email or tenant is missing, create a new consumer
      return await this.createConsumer(consumerData);
    }
    
    // First check if consumer already exists with this tenant
    const [existingConsumerWithTenant] = await db.select()
      .from(consumers)
      .where(
        and(
          eq(consumers.tenantId, consumerData.tenantId),
          sql`LOWER(${consumers.email}) = LOWER(${consumerData.email})`
        )
      );
    
    if (existingConsumerWithTenant) {
      // Consumer already exists with this tenant - update missing fields if provided
      const updates: any = {};
      
      // Update fields only if they're missing in the existing record but provided in new data
      if (!existingConsumerWithTenant.dateOfBirth && consumerData.dateOfBirth) {
        updates.dateOfBirth = consumerData.dateOfBirth;
      }
      if (!existingConsumerWithTenant.address && consumerData.address) {
        updates.address = consumerData.address;
      }
      if (!existingConsumerWithTenant.city && consumerData.city) {
        updates.city = consumerData.city;
      }
      if (!existingConsumerWithTenant.state && consumerData.state) {
        updates.state = consumerData.state;
      }
      if (!existingConsumerWithTenant.zipCode && consumerData.zipCode) {
        updates.zipCode = consumerData.zipCode;
      }
      if (!existingConsumerWithTenant.phone && consumerData.phone) {
        updates.phone = consumerData.phone;
      }
      
      if (Object.keys(updates).length > 0) {
        const [updatedConsumer] = await db.update(consumers)
          .set(updates)
          .where(eq(consumers.id, existingConsumerWithTenant.id))
          .returning();
        console.log(`Updated consumer ${existingConsumerWithTenant.id} with missing fields`);
        return updatedConsumer;
      }
      
      return existingConsumerWithTenant;
    }

    // Check if consumer exists but not linked to any tenant (auto-link scenario)
    const [unlinkedConsumer] = await db.select()
      .from(consumers)
      .where(
        and(
          sql`${consumers.tenantId} IS NULL`,
          sql`LOWER(${consumers.email}) = LOWER(${consumerData.email})`
        )
      );

    if (unlinkedConsumer) {
      // Found unlinked consumer with matching email - auto-link to this tenant
      const [linkedConsumer] = await db.update(consumers)
        .set({ 
          tenantId: consumerData.tenantId,
          firstName: consumerData.firstName || unlinkedConsumer.firstName,
          lastName: consumerData.lastName || unlinkedConsumer.lastName,
          phone: consumerData.phone || unlinkedConsumer.phone,
          dateOfBirth: consumerData.dateOfBirth || unlinkedConsumer.dateOfBirth,
          ssnLast4: consumerData.ssnLast4 || unlinkedConsumer.ssnLast4,
          address: consumerData.address || unlinkedConsumer.address,
          city: consumerData.city || unlinkedConsumer.city,
          state: consumerData.state || unlinkedConsumer.state,
          zipCode: consumerData.zipCode || unlinkedConsumer.zipCode,
          folderId: consumerData.folderId
        })
        .where(eq(consumers.id, unlinkedConsumer.id))
        .returning();
        
      console.log(`Auto-linked unlinked consumer ${unlinkedConsumer.id} to tenant ${consumerData.tenantId}`);
      return linkedConsumer;
    }
    
    // Check for existing consumer with matching criteria in another tenant to copy data
    const [existingConsumer] = await db.select()
      .from(consumers)
      .where(
        and(
          sql`LOWER(${consumers.email}) = LOWER(${consumerData.email})`,
          sql`${consumers.tenantId} IS NOT NULL`
        )
      );
    
    if (existingConsumer) {
      // Consumer exists in another tenant - create a new consumer record for this tenant
      // Copy data from existing consumer but create a new record for multi-tenant support
      const newConsumerData = {
        ...consumerData,
        firstName: consumerData.firstName || existingConsumer.firstName,
        lastName: consumerData.lastName || existingConsumer.lastName,
        phone: consumerData.phone || existingConsumer.phone,
        dateOfBirth: consumerData.dateOfBirth || existingConsumer.dateOfBirth,
        address: consumerData.address || existingConsumer.address,
        city: consumerData.city || existingConsumer.city,
        state: consumerData.state || existingConsumer.state,
        zipCode: consumerData.zipCode || existingConsumer.zipCode,
        ssnLast4: consumerData.ssnLast4 || existingConsumer.ssnLast4,
      };
      
      console.log(`Creating new consumer record for tenant ${consumerData.tenantId} based on existing consumer from another tenant`);
      return await this.createConsumer(newConsumerData);
    }

    // No existing consumer found - create new one
    return await this.createConsumer(consumerData);
  }

  async deleteConsumer(id: string, tenantId: string): Promise<void> {
    await db.delete(consumers)
      .where(and(eq(consumers.id, id), eq(consumers.tenantId, tenantId)));
  }

  // Folder operations
  async getFoldersByTenant(tenantId: string): Promise<Folder[]> {
    return await db.select().from(folders).where(eq(folders.tenantId, tenantId)).orderBy(folders.sortOrder);
  }

  async createFolder(folder: InsertFolder): Promise<Folder> {
    const [newFolder] = await db.insert(folders).values(folder).returning();
    return newFolder;
  }

  async deleteFolder(id: string, tenantId: string): Promise<void> {
    // First, move all accounts in this folder to the default folder
    const defaultFolder = await this.getDefaultFolder(tenantId);
    if (defaultFolder) {
      await db.update(accounts)
        .set({ folderId: defaultFolder.id })
        .where(and(eq(accounts.folderId, id), eq(accounts.tenantId, tenantId)));
    }
    
    // Then delete the folder
    await db.delete(folders)
      .where(and(eq(folders.id, id), eq(folders.tenantId, tenantId), eq(folders.isDefault, false)));
  }

  async getDefaultFolder(tenantId: string): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(
      and(eq(folders.tenantId, tenantId), eq(folders.isDefault, true))
    );
    return folder;
  }

  async ensureDefaultFolders(tenantId: string): Promise<void> {
    // Create default folders if they don't exist
    const existingFolders = await this.getFoldersByTenant(tenantId);
    
    const defaultFolders = [
      { name: "All Accounts", description: "All imported accounts", color: "#3b82f6", isDefault: true, sortOrder: 0 },
      { name: "New", description: "New accounts to be contacted", color: "#10b981", isDefault: false, sortOrder: 1 },
      { name: "Decline", description: "Accounts that declined payment", color: "#ef4444", isDefault: false, sortOrder: 2 },
      { name: "First Attempt", description: "First contact attempt made", color: "#f59e0b", isDefault: false, sortOrder: 3 },
      { name: "Second Attempt", description: "Second contact attempt made", color: "#8b5cf6", isDefault: false, sortOrder: 4 }
    ];
    
    for (const folderData of defaultFolders) {
      const exists = existingFolders.find(f => f.name === folderData.name);
      if (!exists) {
        await this.createFolder({ ...folderData, tenantId });
      }
    }
  }

  // Account operations
  async getAccountsByTenant(tenantId: string): Promise<(Account & { consumer: Consumer; folder?: Folder })[]> {
    const result = await db
      .select()
      .from(accounts)
      .leftJoin(consumers, eq(accounts.consumerId, consumers.id))
      .leftJoin(folders, eq(accounts.folderId, folders.id))
      .where(eq(accounts.tenantId, tenantId))
      .orderBy(desc(accounts.createdAt));
    
    return result.map(row => ({
      ...row.accounts,
      consumer: row.consumers!,
      folder: row.folders || undefined,
    }));
  }

  async getAccountsByFolder(folderId: string): Promise<(Account & { consumer: Consumer })[]> {
    const result = await db
      .select()
      .from(accounts)
      .leftJoin(consumers, eq(accounts.consumerId, consumers.id))
      .where(eq(accounts.folderId, folderId))
      .orderBy(desc(accounts.createdAt));
    
    return result.map(row => ({
      ...row.accounts,
      consumer: row.consumers!,
    }));
  }

  async getAccountsByConsumer(consumerId: string): Promise<Account[]> {
    return await db.select().from(accounts).where(eq(accounts.consumerId, consumerId));
  }

  async getAccount(id: string): Promise<(Account & { consumer?: Consumer; folder?: Folder }) | undefined> {
    const [result] = await db
      .select()
      .from(accounts)
      .leftJoin(consumers, eq(accounts.consumerId, consumers.id))
      .leftJoin(folders, eq(accounts.folderId, folders.id))
      .where(eq(accounts.id, id));

    if (!result) {
      return undefined;
    }

    return {
      ...result.accounts,
      consumer: result.consumers || undefined,
      folder: result.folders || undefined,
    };
  }

  async createAccount(account: InsertAccount): Promise<Account> {
    const [newAccount] = await db.insert(accounts).values(account).returning();

    // Check if consumer is registered and send notification
    await this.notifyConsumerAccountAdded(newAccount);

    return newAccount;
  }

  async updateAccount(id: string, updates: Partial<Account>): Promise<Account> {
    const [updatedAccount] = await db
      .update(accounts)
      .set(updates)
      .where(eq(accounts.id, id))
      .returning();

    return updatedAccount;
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

  async getEmailCampaignById(id: string, tenantId: string): Promise<EmailCampaign | undefined> {
    const [campaign] = await db.select()
      .from(emailCampaigns)
      .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.tenantId, tenantId)));
    return campaign;
  }

  async createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign> {
    const [newCampaign] = await db.insert(emailCampaigns).values(campaign).returning();
    return newCampaign;
  }

  async updateEmailCampaign(id: string, updates: Partial<EmailCampaign>): Promise<EmailCampaign> {
    const [updatedCampaign] = await db.update(emailCampaigns).set(updates).where(eq(emailCampaigns.id, id)).returning();
    return updatedCampaign;
  }

  async deleteEmailCampaign(id: string, tenantId: string): Promise<void> {
    await db.delete(emailCampaigns)
      .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.tenantId, tenantId)));
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

  // SMS template operations
  async getSmsTemplatesByTenant(tenantId: string): Promise<SmsTemplate[]> {
    return await db.select().from(smsTemplates).where(eq(smsTemplates.tenantId, tenantId));
  }

  async createSmsTemplate(template: InsertSmsTemplate): Promise<SmsTemplate> {
    const [newTemplate] = await db.insert(smsTemplates).values(template).returning();
    return newTemplate;
  }

  async deleteSmsTemplate(id: string, tenantId: string): Promise<void> {
    await db.delete(smsTemplates)
      .where(and(eq(smsTemplates.id, id), eq(smsTemplates.tenantId, tenantId)));
  }

  // SMS campaign operations
  async getSmsCampaignsByTenant(tenantId: string): Promise<(SmsCampaign & { templateName: string })[]> {
    const result = await db
      .select()
      .from(smsCampaigns)
      .leftJoin(smsTemplates, eq(smsCampaigns.templateId, smsTemplates.id))
      .where(eq(smsCampaigns.tenantId, tenantId))
      .orderBy(desc(smsCampaigns.createdAt));

    return result.map(row => ({
      ...row.sms_campaigns,
      templateName: row.sms_templates?.name || 'Unknown Template',
    }));
  }

  async getSmsCampaignById(id: string, tenantId: string): Promise<SmsCampaign | undefined> {
    const [campaign] = await db.select()
      .from(smsCampaigns)
      .where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.tenantId, tenantId)));
    return campaign;
  }

  async createSmsCampaign(campaign: InsertSmsCampaign): Promise<SmsCampaign> {
    const [newCampaign] = await db.insert(smsCampaigns).values(campaign).returning();
    return newCampaign;
  }

  async updateSmsCampaign(id: string, updates: Partial<SmsCampaign>): Promise<SmsCampaign> {
    const [updatedCampaign] = await db.update(smsCampaigns).set(updates).where(eq(smsCampaigns.id, id)).returning();
    return updatedCampaign;
  }

  async deleteSmsCampaign(id: string, tenantId: string): Promise<void> {
    await db.delete(smsCampaigns)
      .where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.tenantId, tenantId)));
  }

  // SMS metrics operations
  async getSmsMetricsByTenant(tenantId: string): Promise<any> {
    const campaigns = await db.select().from(smsCampaigns).where(eq(smsCampaigns.tenantId, tenantId));
    
    const totalSent = campaigns.reduce((sum, c) => sum + (c.totalSent || 0), 0);
    const totalDelivered = campaigns.reduce((sum, c) => sum + (c.totalDelivered || 0), 0);
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
      totalErrors,
      totalOptOuts,
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
      optOutRate: totalSent > 0 ? Math.round((totalOptOuts / totalSent) * 100) : 0,
      last7Days: recent7,
      last30Days: recent30,
      sentThisMonth: recent30,
      bestTemplate: campaigns.length > 0 ? campaigns.sort((a, b) => (b.totalDelivered || 0) - (a.totalDelivered || 0))[0]?.name || "None yet" : "None yet",
    };
  }

  // SMS tracking operations
  async createSmsTracking(tracking: InsertSmsTracking): Promise<SmsTracking> {
    const [newTracking] = await db.insert(smsTracking).values(tracking).returning();
    return newTracking;
  }

  // Automation operations
  async getAutomationsByTenant(tenantId: string): Promise<CommunicationAutomation[]> {
    return await db.select()
      .from(communicationAutomations)
      .where(eq(communicationAutomations.tenantId, tenantId))
      .orderBy(desc(communicationAutomations.createdAt));
  }

  async createAutomation(automation: InsertCommunicationAutomation): Promise<CommunicationAutomation> {
    const [newAutomation] = await db.insert(communicationAutomations).values(automation).returning();
    return newAutomation;
  }

  async updateAutomation(id: string, updates: Partial<CommunicationAutomation>): Promise<CommunicationAutomation> {
    const [updatedAutomation] = await db.update(communicationAutomations)
      .set(updates)
      .where(eq(communicationAutomations.id, id))
      .returning();
    return updatedAutomation;
  }

  async deleteAutomation(id: string, tenantId: string): Promise<void> {
    await db.delete(communicationAutomations)
      .where(and(eq(communicationAutomations.id, id), eq(communicationAutomations.tenantId, tenantId)));
  }

  async getAutomationById(id: string, tenantId: string): Promise<CommunicationAutomation | undefined> {
    const [automation] = await db.select()
      .from(communicationAutomations)
      .where(and(eq(communicationAutomations.id, id), eq(communicationAutomations.tenantId, tenantId)));
    return automation || undefined;
  }

  // Automation execution operations
  async getAutomationExecutions(automationId: string): Promise<AutomationExecution[]> {
    return await db.select()
      .from(automationExecutions)
      .where(eq(automationExecutions.automationId, automationId))
      .orderBy(desc(automationExecutions.executedAt));
  }

  async createAutomationExecution(execution: InsertAutomationExecution): Promise<AutomationExecution> {
    const [newExecution] = await db.insert(automationExecutions).values(execution).returning();
    return newExecution;
  }

  async getActiveAutomations(): Promise<CommunicationAutomation[]> {
    return await db.select()
      .from(communicationAutomations)
      .where(eq(communicationAutomations.isActive, true));
  }

  // Email sequence operations
  async getEmailSequencesByTenant(tenantId: string): Promise<EmailSequence[]> {
    return await db.select()
      .from(emailSequences)
      .where(eq(emailSequences.tenantId, tenantId))
      .orderBy(desc(emailSequences.createdAt));
  }

  async getEmailSequenceById(id: string, tenantId: string): Promise<EmailSequence | undefined> {
    const [sequence] = await db.select()
      .from(emailSequences)
      .where(and(eq(emailSequences.id, id), eq(emailSequences.tenantId, tenantId)));
    return sequence || undefined;
  }

  async createEmailSequence(sequence: InsertEmailSequence): Promise<EmailSequence> {
    const [newSequence] = await db.insert(emailSequences).values(sequence).returning();
    return newSequence;
  }

  async updateEmailSequence(id: string, updates: Partial<EmailSequence>): Promise<EmailSequence> {
    const [updatedSequence] = await db.update(emailSequences)
      .set(updates)
      .where(eq(emailSequences.id, id))
      .returning();
    return updatedSequence;
  }

  async deleteEmailSequence(id: string, tenantId: string): Promise<void> {
    await db.delete(emailSequences)
      .where(and(eq(emailSequences.id, id), eq(emailSequences.tenantId, tenantId)));
  }

  // Email sequence steps operations
  async getSequenceSteps(sequenceId: string): Promise<(EmailSequenceStep & { template: EmailTemplate })[]> {
    const result = await db
      .select()
      .from(emailSequenceSteps)
      .leftJoin(emailTemplates, eq(emailSequenceSteps.templateId, emailTemplates.id))
      .where(eq(emailSequenceSteps.sequenceId, sequenceId))
      .orderBy(emailSequenceSteps.stepOrder);
    
    return result.map(row => ({
      ...row.email_sequence_steps,
      template: row.email_templates!,
    }));
  }

  async createSequenceStep(step: InsertEmailSequenceStep): Promise<EmailSequenceStep> {
    const [newStep] = await db.insert(emailSequenceSteps).values(step).returning();
    return newStep;
  }

  async updateSequenceStep(id: string, updates: Partial<EmailSequenceStep>): Promise<EmailSequenceStep> {
    const [updatedStep] = await db.update(emailSequenceSteps)
      .set(updates)
      .where(eq(emailSequenceSteps.id, id))
      .returning();
    return updatedStep;
  }

  async deleteSequenceStep(id: string): Promise<void> {
    await db.delete(emailSequenceSteps)
      .where(eq(emailSequenceSteps.id, id));
  }

  async reorderSequenceSteps(sequenceId: string, stepIds: string[]): Promise<void> {
    for (let i = 0; i < stepIds.length; i++) {
      await db.update(emailSequenceSteps)
        .set({ stepOrder: i + 1 })
        .where(and(eq(emailSequenceSteps.id, stepIds[i]), eq(emailSequenceSteps.sequenceId, sequenceId)));
    }
  }

  // Email sequence enrollment operations
  async getSequenceEnrollments(sequenceId: string): Promise<(EmailSequenceEnrollment & { consumer: Consumer })[]> {
    const result = await db
      .select()
      .from(emailSequenceEnrollments)
      .leftJoin(consumers, eq(emailSequenceEnrollments.consumerId, consumers.id))
      .where(eq(emailSequenceEnrollments.sequenceId, sequenceId))
      .orderBy(desc(emailSequenceEnrollments.enrolledAt));
    
    return result.map(row => ({
      ...row.email_sequence_enrollments,
      consumer: row.consumers!,
    }));
  }

  async enrollConsumerInSequence(enrollment: InsertEmailSequenceEnrollment): Promise<EmailSequenceEnrollment> {
    const [newEnrollment] = await db.insert(emailSequenceEnrollments).values(enrollment).returning();
    return newEnrollment;
  }

  async updateEnrollment(id: string, updates: Partial<EmailSequenceEnrollment>): Promise<EmailSequenceEnrollment> {
    const [updatedEnrollment] = await db.update(emailSequenceEnrollments)
      .set(updates)
      .where(eq(emailSequenceEnrollments.id, id))
      .returning();
    return updatedEnrollment;
  }

  async getActiveEnrollments(): Promise<(EmailSequenceEnrollment & { sequence: EmailSequence; consumer: Consumer; currentStep?: EmailSequenceStep })[]> {
    const result = await db
      .select()
      .from(emailSequenceEnrollments)
      .leftJoin(emailSequences, eq(emailSequenceEnrollments.sequenceId, emailSequences.id))
      .leftJoin(consumers, eq(emailSequenceEnrollments.consumerId, consumers.id))
      .leftJoin(emailSequenceSteps, eq(emailSequenceEnrollments.currentStepId, emailSequenceSteps.id))
      .where(and(
        eq(emailSequenceEnrollments.status, 'active'),
        eq(emailSequences.isActive, true)
      ))
      .orderBy(emailSequenceEnrollments.nextEmailAt);
    
    return result.map(row => ({
      ...row.email_sequence_enrollments,
      sequence: row.email_sequences!,
      consumer: row.consumers!,
      currentStep: row.email_sequence_steps || undefined,
    }));
  }

  async pauseEnrollment(id: string): Promise<void> {
    await db.update(emailSequenceEnrollments)
      .set({ status: 'paused' })
      .where(eq(emailSequenceEnrollments.id, id));
  }

  async resumeEnrollment(id: string): Promise<void> {
    await db.update(emailSequenceEnrollments)
      .set({ status: 'active' })
      .where(eq(emailSequenceEnrollments.id, id));
  }

  async cancelEnrollment(id: string): Promise<void> {
    await db.update(emailSequenceEnrollments)
      .set({ status: 'cancelled' })
      .where(eq(emailSequenceEnrollments.id, id));
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

  async getConsumerByEmailAndTenant(email: string, tenantIdentifier: string): Promise<Consumer | undefined> {
    if (!tenantIdentifier) {
      return undefined;
    }

    const tenant = await this.getTenantBySlug(tenantIdentifier);
    const tenantId = tenant?.id ?? (tenantIdentifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      ? tenantIdentifier
      : undefined);

    if (!tenantId) {
      return undefined;
    }

    const [consumer] = await db.select()
      .from(consumers)
      .where(
        and(
          eq(consumers.tenantId, tenantId),
          sql`LOWER(${consumers.email}) = LOWER(${email})`
        )
      );

    return consumer || undefined;
  }

  async getConsumerByEmail(email: string): Promise<Consumer | undefined> {
    // Get all consumers with this email
    const allConsumers = await db.select()
      .from(consumers)
      .where(sql`LOWER(${consumers.email}) = LOWER(${email})`);

    // Prioritize consumers WITH a tenantId over those without
    // This ensures we return linked consumers first
    const linkedConsumer = allConsumers.find(c => c.tenantId);
    if (linkedConsumer) {
      return linkedConsumer;
    }
    
    // If no linked consumer found, return the first one (if any)
    return allConsumers[0] || undefined;
  }

  async deleteAccount(id: string, tenantId: string): Promise<void> {
    await db.delete(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.tenantId, tenantId)));
  }

  async bulkDeleteAccounts(ids: string[], tenantId: string): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const accountsToDelete = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(inArray(accounts.id, ids), eq(accounts.tenantId, tenantId)));

    if (accountsToDelete.length === 0) {
      return 0;
    }

    await db
      .delete(accounts)
      .where(and(inArray(accounts.id, ids), eq(accounts.tenantId, tenantId)));

    return accountsToDelete.length;
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

  async updateArrangementOption(
    id: string,
    tenantId: string,
    option: Partial<InsertArrangementOption>,
  ): Promise<ArrangementOption | undefined> {
    const { tenantId: _ignoredTenantId, ...updates } = option;

    const [updatedOption] = await db
      .update(arrangementOptions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(arrangementOptions.id, id), eq(arrangementOptions.tenantId, tenantId)))
      .returning();

    return updatedOption;
  }

  async deleteArrangementOption(id: string, tenantId: string): Promise<boolean> {
    const deletedOptions = await db
      .delete(arrangementOptions)
      .where(and(eq(arrangementOptions.id, id), eq(arrangementOptions.tenantId, tenantId)))
      .returning();

    return deletedOptions.length > 0;
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
        set: {
          ...settingsData,
          updatedAt: new Date(),
        },
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

  // Payment operations
  async getPaymentsByTenant(tenantId: string): Promise<(Payment & { consumerName?: string; consumerEmail?: string; accountCreditor?: string })[]> {
    const result = await db
      .select()
      .from(payments)
      .leftJoin(consumers, eq(payments.consumerId, consumers.id))
      .leftJoin(accounts, eq(payments.accountId, accounts.id))
      .where(eq(payments.tenantId, tenantId))
      .orderBy(desc(payments.createdAt));
    
    return result.map(row => ({
      ...row.payments,
      consumerName: row.consumers ? `${row.consumers.firstName} ${row.consumers.lastName}` : undefined,
      consumerEmail: row.consumers?.email || undefined,
      accountCreditor: row.accounts?.creditor || undefined,
    }));
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async getPaymentStats(tenantId: string): Promise<{
    totalProcessed: number;
    totalAmountCents: number;
    successfulPayments: number;
    failedPayments: number;
    pendingPayments: number;
  }> {
    const tenantPayments = await db.select().from(payments).where(eq(payments.tenantId, tenantId));
    
    const totalProcessed = tenantPayments.length;
    const totalAmountCents = tenantPayments.reduce((sum, payment) => sum + (payment.amountCents || 0), 0);
    const successfulPayments = tenantPayments.filter(payment => payment.status === 'completed').length;
    const failedPayments = tenantPayments.filter(payment => payment.status === 'failed').length;
    const pendingPayments = tenantPayments.filter(payment => ['pending', 'processing'].includes(payment.status || '')).length;
    
    return {
      totalProcessed,
      totalAmountCents,
      successfulPayments,
      failedPayments,
      pendingPayments,
    };
  }

  // Billing operations
  async getSubscriptionByTenant(tenantId: string): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId));
    return subscription;
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const [newSubscription] = await db.insert(subscriptions).values(subscription).returning();
    return newSubscription;
  }

  async updateSubscription(id: string, updates: Partial<Subscription>): Promise<Subscription> {
    const [updatedSubscription] = await db.update(subscriptions).set(updates).where(eq(subscriptions.id, id)).returning();
    return updatedSubscription;
  }

  async getInvoicesByTenant(tenantId: string): Promise<Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.tenantId, tenantId)).orderBy(desc(invoices.createdAt));
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [newInvoice] = await db.insert(invoices).values(invoice).returning();
    return newInvoice;
  }

  async getCurrentInvoice(tenantId: string): Promise<Invoice | undefined> {
    const now = new Date();
    const [currentInvoice] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.status, 'pending')
        )
      )
      .orderBy(desc(invoices.createdAt))
      .limit(1);
    return currentInvoice;
  }

  async getBillingStats(tenantId: string): Promise<{
    activeConsumers: number;
    monthlyBase: number;
    usageCharges: number;
    totalBill: number;
    nextBillDate: string;
  }> {
    // Get active consumers count
    const activeConsumersResult = await db.select().from(consumers).where(eq(consumers.tenantId, tenantId));
    const activeConsumers = activeConsumersResult.length;

    // Get subscription details
    const subscription = await this.getSubscriptionByTenant(tenantId);
    const monthlyBase = subscription ? subscription.monthlyBaseCents / 100 : 0;
    const usageCharges = subscription ? (activeConsumers * subscription.pricePerConsumerCents) / 100 : 0;
    const totalBill = monthlyBase + usageCharges;

    // Calculate next bill date (end of current billing period)
    const nextBillDate = subscription 
      ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(); // Default to 30 days from now

    return {
      activeConsumers,
      monthlyBase,
      usageCharges,
      totalBill,
      nextBillDate,
    };
  }

  // Company management operations
  async getPlatformUsersByTenant(tenantId: string): Promise<(PlatformUser & { userDetails?: User })[]> {
    const result = await db
      .select()
      .from(platformUsers)
      .leftJoin(users, eq(platformUsers.authId, users.id))
      .where(eq(platformUsers.tenantId, tenantId))
      .orderBy(desc(platformUsers.createdAt));
    
    return result.map(row => ({
      ...row.platform_users,
      userDetails: row.users || undefined,
    }));
  }

  async updateConsumer(id: string, updates: Partial<Consumer>): Promise<Consumer> {
    const [updatedConsumer] = await db.update(consumers)
      .set(updates)
      .where(eq(consumers.id, id))
      .returning();
    return updatedConsumer;
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

  // Global admin implementations
  async getAllTenants(): Promise<Tenant[]> {
    return await db.select().from(tenants).orderBy(desc(tenants.createdAt));
  }

  async getConsumerCountByTenant(tenantId: string): Promise<number> {
    const tenantConsumers = await db.select().from(consumers).where(eq(consumers.tenantId, tenantId));
    return tenantConsumers.length;
  }

  async getAccountCountByTenant(tenantId: string): Promise<number> {
    const tenantAccounts = await db.select().from(accounts).where(eq(accounts.tenantId, tenantId));
    return tenantAccounts.length;
  }

  async getTotalBalanceByTenant(tenantId: string): Promise<number> {
    const tenantAccounts = await db.select().from(accounts).where(eq(accounts.tenantId, tenantId));
    return tenantAccounts.reduce((sum: number, account: any) => sum + (account.balanceCents || 0), 0);
  }

  async getPlatformStats(): Promise<any> {
    const allTenants = await db.select().from(tenants);
    const allConsumers = await db.select().from(consumers);
    const allAccounts = await db.select().from(accounts);
    
    const totalTenants = allTenants.length;
    const activeTenants = allTenants.filter(t => t.isActive).length;
    const trialTenants = allTenants.filter(t => t.isTrialAccount).length;
    const paidTenants = allTenants.filter(t => t.isPaidAccount).length;
    const totalConsumers = allConsumers.length;
    const totalAccounts = allAccounts.length;
    const totalBalanceCents = allAccounts.reduce((sum: number, account: any) => sum + (account.balanceCents || 0), 0);
    
    return {
      totalTenants,
      activeTenants,
      trialTenants,
      paidTenants,
      totalConsumers,
      totalAccounts,
      totalBalanceCents
    };
  }

  async updateTenantStatus(id: string, updates: { isActive: boolean; suspensionReason?: string | null; suspendedAt?: Date | null }): Promise<Tenant> {
    const [updatedTenant] = await db.update(tenants)
      .set(updates)
      .where(eq(tenants.id, id))
      .returning();
    return updatedTenant;
  }

  async upgradeTenantToPaid(id: string): Promise<Tenant> {
    const [updatedTenant] = await db.update(tenants)
      .set({
        isPaidAccount: true,
        isTrialAccount: false,
      })
      .where(eq(tenants.id, id))
      .returning();
    return updatedTenant;
  }

  async updateTenantTwilioSettings(id: string, twilioSettings: {
    twilioAccountSid?: string | null;
    twilioAuthToken?: string | null;
    twilioPhoneNumber?: string | null;
    twilioBusinessName?: string | null;
    twilioCampaignId?: string | null;
  }): Promise<Tenant> {
    const [updatedTenant] = await db.update(tenants)
      .set(twilioSettings)
      .where(eq(tenants.id, id))
      .returning();
    return updatedTenant;
  }
}

export const storage = new DatabaseStorage();
