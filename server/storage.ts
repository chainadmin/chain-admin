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
  emailLogs,
  emailReplies,
  smsTemplates,
  smsCampaigns,
  smsTracking,
  messagingUsageEvents,
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
  paymentMethods,
  paymentSchedules,
  subscriptions,
  subscriptionPlans,
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
  type EmailReply,
  type InsertEmailReply,
  type SmsTemplate,
  type InsertSmsTemplate,
  type SmsCampaign,
  type InsertSmsCampaign,
  type SmsTracking,
  type InsertSmsTracking,
  type InsertMessagingUsageEvent,
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
  type PaymentMethod,
  type InsertPaymentMethod,
  type PaymentSchedule,
  type InsertPaymentSchedule,
  type Subscription,
  type InsertSubscription,
  type Invoice,
  type InsertInvoice,
} from "@shared/schema";
import { messagingPlans, EMAIL_OVERAGE_RATE_PER_EMAIL, SMS_OVERAGE_RATE_PER_SEGMENT, type MessagingPlanId } from "@shared/billing-plans";
import { db } from "./db";
import { eq, and, desc, sql, inArray, gte, lte } from "drizzle-orm";
import {
  ensureArrangementOptionsSchema,
  ensureDocumentsSchema,
  ensureTenantSettingsSchema,
} from "@shared/schemaFixes";

type DocumentWithAccount = Document & {
  account?: (Account & { consumer?: Consumer }) | null;
};

function normalizeEmailValue(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.toLowerCase();
}

function normalizeUsernameValue(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.toLowerCase();
}

function applyNormalizedEmail<T extends { email?: string | null }>(record: T): T {
  if (!("email" in record) || record.email === undefined) {
    return record;
  }

  return {
    ...record,
    email: normalizeEmailValue(record.email),
  } as T;
}

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
  getEmailCountByTenant(tenantId: string): Promise<number>;
  getSmsCountByTenant(tenantId: string): Promise<number>;
  getPlatformStats(): Promise<any>;
  updateTenantStatus(id: string, updates: { isActive: boolean; suspensionReason?: string | null; suspendedAt?: Date | null }): Promise<Tenant>;
  upgradeTenantToPaid(id: string): Promise<Tenant>;
  updateTenantTwilioSettings(id: string, twilioSettings: {
    twilioAccountSid?: string | null;
    twilioAuthToken?: string | null;
    twilioPhoneNumber?: string | null;
    twilioBusinessName?: string | null;
    twilioCampaignId?: string | null;
    customSenderEmail?: string | null;
  }): Promise<Tenant>;
  
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
  findConsumersByEmailAndDob(email: string, dateOfBirth: string): Promise<(Consumer & { tenant: Tenant })[]>;
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
  updateEmailTemplate(id: string, tenantId: string, updates: Partial<EmailTemplate>): Promise<EmailTemplate>;
  deleteEmailTemplate(id: string, tenantId: string): Promise<void>;
  
  // Email campaign operations
  getEmailCampaignsByTenant(tenantId: string): Promise<(EmailCampaign & { templateName: string })[]>;
  getEmailCampaignById(id: string, tenantId: string): Promise<EmailCampaign | undefined>;
  createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign>;
  updateEmailCampaign(id: string, updates: Partial<EmailCampaign>): Promise<EmailCampaign>;
  deleteEmailCampaign(id: string, tenantId: string): Promise<void>;
  
  // Email metrics operations
  getEmailMetricsByTenant(tenantId: string): Promise<any>;
  
  // Email reply operations
  createEmailReply(reply: InsertEmailReply): Promise<EmailReply>;
  getEmailRepliesByTenant(tenantId: string): Promise<(EmailReply & { consumerName: string; consumerEmail: string })[]>;
  getEmailReplyById(id: string, tenantId: string): Promise<EmailReply | undefined>;
  markEmailReplyAsRead(id: string, tenantId: string): Promise<EmailReply>;
  
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

  // Account management operations
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
  deleteCallbackRequest(id: string, tenantId: string): Promise<void>;
  
  // Document operations
  getDocumentsByTenant(tenantId: string): Promise<DocumentWithAccount[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  deleteDocument(id: string, tenantId: string): Promise<boolean>;
  
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
  
  // Payment method operations (saved cards)
  getPaymentMethodsByConsumer(consumerId: string, tenantId: string): Promise<PaymentMethod[]>;
  createPaymentMethod(paymentMethod: InsertPaymentMethod): Promise<PaymentMethod>;
  deletePaymentMethod(id: string, consumerId: string, tenantId: string): Promise<boolean>;
  setDefaultPaymentMethod(id: string, consumerId: string, tenantId: string): Promise<PaymentMethod>;
  
  // Payment schedule operations (recurring payments)
  getPaymentSchedulesByConsumer(consumerId: string, tenantId: string): Promise<PaymentSchedule[]>;
  getPaymentSchedulesByAccount(accountId: string, tenantId: string): Promise<PaymentSchedule[]>;
  getActivePaymentSchedulesByConsumerAndAccount(consumerId: string, accountId: string, tenantId: string): Promise<PaymentSchedule[]>;
  createPaymentSchedule(schedule: InsertPaymentSchedule): Promise<PaymentSchedule>;
  updatePaymentSchedule(id: string, tenantId: string, updates: Partial<PaymentSchedule>): Promise<PaymentSchedule>;
  cancelPaymentSchedule(id: string, tenantId: string): Promise<boolean>;
  
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
    planId: MessagingPlanId | null;
    planName: string | null;
    emailUsage: {
      used: number;
      included: number;
      overage: number;
      overageCharge: number;
    };
    smsUsage: {
      used: number;
      included: number;
      overage: number;
      overageCharge: number;
    };
    billingPeriod: { start: string; end: string } | null;
  }>;
  recordMessagingUsageEvent(event: InsertMessagingUsageEvent): Promise<void>;
  getMessagingUsageTotals(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{ emailCount: number; smsSegments: number }>;
  findSmsTrackingByExternalId(
    externalId: string
  ): Promise<{ tracking: SmsTracking; tenantId: string | null; campaignId: string | null } | undefined>;
  updateSmsTracking(id: string, updates: Partial<SmsTracking>): Promise<SmsTracking | undefined>;
  
  // Company management operations
  getPlatformUsersByTenant(tenantId: string): Promise<(PlatformUser & { userDetails?: User })[]>;
  
  // Stats operations
  getTenantStats(tenantId: string): Promise<{
    totalConsumers: number;
    activeAccounts: number;
    totalBalance: number;
    collectionRate: number;
    paymentMetrics?: {
      totalPayments: number;
      successfulPayments: number;
      declinedPayments: number;
      totalCollected: number;
      monthlyCollected: number;
    };
    emailMetrics?: {
      totalSent: number;
      opened: number;
      openRate: number;
      bounced: number;
    };
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
    const normalizedUsername = normalizeUsernameValue(username);
    if (!normalizedUsername) {
      return undefined;
    }

    const [credentials] = await db
      .select()
      .from(agencyCredentials)
      .where(sql`LOWER(TRIM(${agencyCredentials.username})) = ${normalizedUsername}`);
    return credentials;
  }

  async getAgencyCredentialsById(id: string): Promise<SelectAgencyCredentials | undefined> {
    const [credentials] = await db.select().from(agencyCredentials).where(eq(agencyCredentials.id, id));
    return credentials;
  }

  async createAgencyCredentials(credentials: InsertAgencyCredentials): Promise<SelectAgencyCredentials> {
    const normalizedUsername = normalizeUsernameValue(credentials.username);
    const normalizedEmail = normalizeEmailValue(credentials.email);

    if (!normalizedUsername) {
      throw new Error("Username is required for agency credentials");
    }

    if (!normalizedEmail) {
      throw new Error("Email is required for agency credentials");
    }

    const [newCredentials] = await db
      .insert(agencyCredentials)
      .values({
        ...credentials,
        username: normalizedUsername,
        email: normalizedEmail,
      })
      .returning();
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
    const normalizedEmail = normalizeEmailValue(email);
    if (!normalizedEmail) {
      return [];
    }

    // Get all consumers with this email across all tenants (case-insensitive)
    return await db.select()
      .from(consumers)
      .where(sql`LOWER(TRIM(${consumers.email})) = LOWER(${normalizedEmail})`);
  }

  async findConsumersByEmailAndDob(email: string, dateOfBirth: string): Promise<(Consumer & { tenant: Tenant })[]> {
    const normalizedEmail = normalizeEmailValue(email);
    if (!normalizedEmail || !dateOfBirth) {
      return [];
    }

    // Find all consumers with matching email across all tenants
    // DOB comparison will be done in the route using datesMatch for flexibility
    const results = await db.select({
      consumer: consumers,
      tenant: tenants
    })
      .from(consumers)
      .innerJoin(tenants, eq(consumers.tenantId, tenants.id))
      .where(sql`LOWER(TRIM(${consumers.email})) = LOWER(${normalizedEmail})`);

    return results.map(row => ({
      ...row.consumer,
      tenant: row.tenant
    }));
  }

  async createConsumer(consumer: InsertConsumer): Promise<Consumer> {
    const consumerToInsert = applyNormalizedEmail(consumer);
    const [newConsumer] = await db.insert(consumers).values(consumerToInsert).returning();
    return newConsumer;
  }

  async updateConsumer(id: string, updates: Partial<Consumer>): Promise<Consumer> {
    const sanitizedUpdates = applyNormalizedEmail(updates);
    const [updatedConsumer] = await db.update(consumers)
      .set(sanitizedUpdates)
      .where(eq(consumers.id, id))
      .returning();
    return updatedConsumer;
  }

  async findAccountsByConsumerEmail(email: string): Promise<(Account & { consumer: Consumer })[]> {
    const normalizedEmail = normalizeEmailValue(email);
    if (!normalizedEmail) {
      return [];
    }

    // Find all consumers with this email (case-insensitive)
    const consumersWithEmail = await db.select()
      .from(consumers)
      .where(sql`LOWER(TRIM(${consumers.email})) = LOWER(${normalizedEmail})`);

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
      .where(inArray(accounts.consumerId, consumerIds));

    return accountsList.map(row => ({
      ...row.account,
      consumer: row.consumer
    }));
  }

  async findOrCreateConsumer(consumerData: InsertConsumer): Promise<Consumer> {
    const hasEmailField = Object.prototype.hasOwnProperty.call(consumerData, "email");
    const normalizedEmail = normalizeEmailValue(hasEmailField ? consumerData.email ?? undefined : undefined);

    const normalizedConsumerData =
      hasEmailField && normalizedEmail !== consumerData.email
        ? { ...consumerData, email: normalizedEmail }
        : consumerData;

    // Check for existing consumer by email and tenant (unique within tenant)
    if (!normalizedEmail || !normalizedConsumerData.tenantId) {
      // If email or tenant is missing, create a new consumer
      return await this.createConsumer(normalizedConsumerData);
    }

    // First check if consumer already exists with this tenant
    const [existingConsumerWithTenant] = await db.select()
      .from(consumers)
      .where(
        and(
          eq(consumers.tenantId, normalizedConsumerData.tenantId),
          sql`LOWER(TRIM(${consumers.email})) = LOWER(${normalizedEmail})`
        )
      );
    
    if (existingConsumerWithTenant) {
      // Consumer already exists with this tenant - update fields
      const updates: any = {};
      
      // Always update folder assignment if provided (allows moving consumers between folders)
      if (consumerData.folderId !== undefined && consumerData.folderId !== existingConsumerWithTenant.folderId) {
        updates.folderId = consumerData.folderId;
      }
      
      // Always update additionalData if provided (includes folder/status info)
      if (consumerData.additionalData !== undefined) {
        updates.additionalData = consumerData.additionalData;
      }
      
      // Update name fields if provided (even if existing has values - allows corrections)
      if (consumerData.firstName !== undefined && consumerData.firstName !== existingConsumerWithTenant.firstName) {
        updates.firstName = consumerData.firstName;
      }
      if (consumerData.lastName !== undefined && consumerData.lastName !== existingConsumerWithTenant.lastName) {
        updates.lastName = consumerData.lastName;
      }
      
      // Update fields when provided in new data (CSV is source of truth)
      // Always update dateOfBirth if provided - this is critical for consumer matching
      if (consumerData.dateOfBirth !== undefined && consumerData.dateOfBirth !== existingConsumerWithTenant.dateOfBirth) {
        updates.dateOfBirth = consumerData.dateOfBirth;
      }
      
      // For other fields, only update if they're missing in the existing record but provided in new data
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
        console.log(`Updated consumer ${existingConsumerWithTenant.id} - moved to new folder or updated data`);
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
          sql`LOWER(TRIM(${consumers.email})) = LOWER(${normalizedEmail})`
        )
      );

    if (unlinkedConsumer) {
      // Found unlinked consumer with matching email - auto-link to this tenant
      const [linkedConsumer] = await db.update(consumers)
        .set({ 
          tenantId: normalizedConsumerData.tenantId,
          firstName: normalizedConsumerData.firstName || unlinkedConsumer.firstName,
          lastName: normalizedConsumerData.lastName || unlinkedConsumer.lastName,
          phone: normalizedConsumerData.phone || unlinkedConsumer.phone,
          dateOfBirth: normalizedConsumerData.dateOfBirth || unlinkedConsumer.dateOfBirth,
          ssnLast4: normalizedConsumerData.ssnLast4 || unlinkedConsumer.ssnLast4,
          address: normalizedConsumerData.address || unlinkedConsumer.address,
          city: normalizedConsumerData.city || unlinkedConsumer.city,
          state: normalizedConsumerData.state || unlinkedConsumer.state,
          zipCode: normalizedConsumerData.zipCode || unlinkedConsumer.zipCode,
          folderId: normalizedConsumerData.folderId
        })
        .where(eq(consumers.id, unlinkedConsumer.id))
        .returning();
        
      console.log(`Auto-linked unlinked consumer ${unlinkedConsumer.id} to tenant ${normalizedConsumerData.tenantId}`);
      return linkedConsumer;
    }
    
    // Check for existing consumer with matching criteria in another tenant to copy data
    const [existingConsumer] = await db.select()
      .from(consumers)
      .where(
        and(
          sql`LOWER(TRIM(${consumers.email})) = LOWER(${normalizedEmail})`,
          sql`${consumers.tenantId} IS NOT NULL`
        )
      );
    
    if (existingConsumer) {
      // Consumer exists in another tenant - create a new consumer record for this tenant
      // Copy data from existing consumer but create a new record for multi-tenant support
      const newConsumerData = {
        ...normalizedConsumerData,
        firstName: normalizedConsumerData.firstName || existingConsumer.firstName,
        lastName: normalizedConsumerData.lastName || existingConsumer.lastName,
        phone: normalizedConsumerData.phone || existingConsumer.phone,
        dateOfBirth: normalizedConsumerData.dateOfBirth || existingConsumer.dateOfBirth,
        address: normalizedConsumerData.address || existingConsumer.address,
        city: normalizedConsumerData.city || existingConsumer.city,
        state: normalizedConsumerData.state || existingConsumer.state,
        zipCode: normalizedConsumerData.zipCode || existingConsumer.zipCode,
        ssnLast4: normalizedConsumerData.ssnLast4 || existingConsumer.ssnLast4,
      };
      
      console.log(`Creating new consumer record for tenant ${normalizedConsumerData.tenantId} based on existing consumer from another tenant`);
      return await this.createConsumer(newConsumerData);
    }

    // No existing consumer found - create new one
    return await this.createConsumer(normalizedConsumerData);
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

  async findOrCreateAccount(accountData: InsertAccount): Promise<Account> {
    // Check if account already exists by filenumber and consumer (filenumber is mandatory and unique per consumer)
    if (accountData.filenumber && accountData.consumerId) {
      const [existingAccount] = await db.select()
        .from(accounts)
        .where(
          and(
            eq(accounts.consumerId, accountData.consumerId),
            eq(accounts.filenumber, accountData.filenumber)
          )
        );
      
      if (existingAccount) {
        // Account exists - update it with new data from CSV
        const updates: any = {};
        
        // Always update balance, folder, and status (allows moving accounts and updating balances)
        if (accountData.balanceCents !== undefined && accountData.balanceCents !== existingAccount.balanceCents) {
          updates.balanceCents = accountData.balanceCents;
        }
        if (accountData.folderId !== undefined && accountData.folderId !== existingAccount.folderId) {
          updates.folderId = accountData.folderId;
        }
        if (accountData.status !== undefined && accountData.status !== existingAccount.status) {
          updates.status = accountData.status;
        }
        
        // Update accountNumber if provided
        if (accountData.accountNumber !== undefined && accountData.accountNumber !== existingAccount.accountNumber) {
          updates.accountNumber = accountData.accountNumber;
        }
        
        // Update creditor if provided
        if (accountData.creditor && accountData.creditor !== existingAccount.creditor) {
          updates.creditor = accountData.creditor;
        }
        
        // Update due date if provided
        if (accountData.dueDate !== undefined && accountData.dueDate !== existingAccount.dueDate) {
          updates.dueDate = accountData.dueDate;
        }
        
        // Update additional data if provided
        if (accountData.additionalData !== undefined) {
          updates.additionalData = accountData.additionalData;
        }
        
        if (Object.keys(updates).length > 0) {
          const [updatedAccount] = await db.update(accounts)
            .set(updates)
            .where(eq(accounts.id, existingAccount.id))
            .returning();
          console.log(`Updated existing account with filenumber ${existingAccount.filenumber} for consumer ${accountData.consumerId}`);
          return updatedAccount;
        }
        
        return existingAccount;
      }
    }
    
    // No existing account found - create new one
    return await this.createAccount(accountData);
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

  async updateEmailTemplate(id: string, tenantId: string, updates: Partial<EmailTemplate>): Promise<EmailTemplate> {
    const [updated] = await db
      .update(emailTemplates)
      .set(updates)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.tenantId, tenantId)))
      .returning();
    
    if (!updated) {
      throw new Error('Email template not found');
    }
    
    return updated;
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

  // Email reply operations
  async createEmailReply(reply: InsertEmailReply): Promise<EmailReply> {
    const [newReply] = await db.insert(emailReplies).values(reply).returning();
    return newReply;
  }

  async getEmailRepliesByTenant(tenantId: string): Promise<(EmailReply & { consumerName: string; consumerEmail: string })[]> {
    const result = await db
      .select()
      .from(emailReplies)
      .leftJoin(consumers, eq(emailReplies.consumerId, consumers.id))
      .where(eq(emailReplies.tenantId, tenantId))
      .orderBy(desc(emailReplies.receivedAt));

    return result.map(row => ({
      ...row.email_replies,
      consumerName: row.consumers ? `${row.consumers.firstName} ${row.consumers.lastName}` : 'Unknown',
      consumerEmail: row.consumers?.email || row.email_replies.fromEmail,
    }));
  }

  async getEmailReplyById(id: string, tenantId: string): Promise<EmailReply | undefined> {
    const [reply] = await db
      .select()
      .from(emailReplies)
      .where(and(eq(emailReplies.id, id), eq(emailReplies.tenantId, tenantId)));
    return reply;
  }

  async markEmailReplyAsRead(id: string, tenantId: string): Promise<EmailReply> {
    const [updatedReply] = await db
      .update(emailReplies)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(emailReplies.id, id), eq(emailReplies.tenantId, tenantId)))
      .returning();
    return updatedReply;
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

  async recordMessagingUsageEvent(event: InsertMessagingUsageEvent): Promise<void> {
    await db
      .insert(messagingUsageEvents)
      .values(event)
      .onConflictDoNothing({ target: messagingUsageEvents.externalMessageId });
  }

  async getMessagingUsageTotals(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{ emailCount: number; smsSegments: number }> {
    const results = await db
      .select({
        messageType: messagingUsageEvents.messageType,
        total: sql<number>`COALESCE(SUM(${messagingUsageEvents.quantity}), 0)`,
      })
      .from(messagingUsageEvents)
      .where(
        and(
          eq(messagingUsageEvents.tenantId, tenantId),
          gte(messagingUsageEvents.occurredAt, periodStart),
          lte(messagingUsageEvents.occurredAt, periodEnd)
        )
      )
      .groupBy(messagingUsageEvents.messageType);

    let emailCount = 0;
    let smsSegments = 0;

    for (const row of results) {
      if (row.messageType === 'email') {
        emailCount = row.total;
      }
      if (row.messageType === 'sms') {
        smsSegments = row.total;
      }
    }

    return { emailCount, smsSegments };
  }

  async findSmsTrackingByExternalId(
    externalId: string
  ): Promise<{ tracking: SmsTracking; tenantId: string | null; campaignId: string | null } | undefined> {
    const [result] = await db
      .select({
        tracking: smsTracking,
        campaign: smsCampaigns,
      })
      .from(smsTracking)
      .leftJoin(smsCampaigns, eq(smsTracking.campaignId, smsCampaigns.id))
      .where(sql`(${smsTracking.trackingData} ->> 'twilioSid') = ${externalId}`)
      .limit(1);

    if (!result?.tracking) {
      return undefined;
    }

    return {
      tracking: result.tracking,
      tenantId: result.campaign?.tenantId ?? null,
      campaignId: result.tracking.campaignId ?? null,
    };
  }

  async updateSmsTracking(id: string, updates: Partial<SmsTracking>): Promise<SmsTracking | undefined> {
    const sanitizedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    ) as Partial<SmsTracking>;

    if (Object.keys(sanitizedUpdates).length === 0) {
      const [existing] = await db.select().from(smsTracking).where(eq(smsTracking.id, id));
      return existing;
    }

    const [updated] = await db.update(smsTracking).set(sanitizedUpdates).where(eq(smsTracking.id, id)).returning();
    return updated;
  }

  // Automation operations
  async getAutomationsByTenant(tenantId: string): Promise<CommunicationAutomation[]> {
    return await db.select()
      .from(communicationAutomations)
      .where(eq(communicationAutomations.tenantId, tenantId))
      .orderBy(desc(communicationAutomations.createdAt));
  }

  async createAutomation(automation: InsertCommunicationAutomation): Promise<CommunicationAutomation> {
    const payload = {
      ...automation,
      templateIds: automation.templateIds ?? [],
      templateSchedule: (automation.templateSchedule ?? []) as { templateId: string; dayOffset: number }[],
    };

    const [newAutomation] = await db
      .insert(communicationAutomations)
      .values(payload as any)
      .returning();
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
    const normalizedData = applyNormalizedEmail(consumerData);
    const [newConsumer] = await db.insert(consumers).values({
      ...normalizedData,
      isRegistered: true,
      registrationDate: new Date(),
    }).returning();
    return newConsumer;
  }

  async getConsumerByEmailAndTenant(email: string, tenantIdentifier: string): Promise<Consumer | undefined> {
    if (!tenantIdentifier) {
      return undefined;
    }

    const normalizedEmail = normalizeEmailValue(email);
    if (!normalizedEmail) {
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
          sql`LOWER(TRIM(${consumers.email})) = LOWER(${normalizedEmail})`
        )
      );

    return consumer || undefined;
  }

  async getConsumerByEmail(email: string): Promise<Consumer | undefined> {
    const normalizedEmail = normalizeEmailValue(email);
    if (!normalizedEmail) {
      return undefined;
    }

    // Get all consumers with this email
    const allConsumers = await db.select()
      .from(consumers)
      .where(sql`LOWER(TRIM(${consumers.email})) = LOWER(${normalizedEmail})`);

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

  async deleteCallbackRequest(id: string, tenantId: string): Promise<void> {
    await db.delete(callbackRequests)
      .where(and(eq(callbackRequests.id, id), eq(callbackRequests.tenantId, tenantId)));
  }

  // Document operations
  async getDocumentsByTenant(tenantId: string): Promise<DocumentWithAccount[]> {
    await ensureDocumentsSchema(db);

    const result = await db
      .select()
      .from(documents)
      .leftJoin(accounts, eq(documents.accountId, accounts.id))
      .leftJoin(consumers, eq(accounts.consumerId, consumers.id))
      .where(eq(documents.tenantId, tenantId))
      .orderBy(desc(documents.createdAt));

    return result.map(row => ({
      ...row.documents,
      account: row.accounts
        ? {
            ...row.accounts,
            consumer: row.consumers || undefined,
          }
        : undefined,
    }));
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    await ensureDocumentsSchema(db);

    const [newDocument] = await db.insert(documents).values(document).returning();
    return newDocument;
  }

  async deleteDocument(id: string, tenantId: string): Promise<boolean> {
    await ensureDocumentsSchema(db);

    const deleted = await db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId)))
      .returning({ id: documents.id });

    return deleted.length > 0;
  }

  // Arrangement options operations
  async getArrangementOptionsByTenant(tenantId: string): Promise<ArrangementOption[]> {
    await ensureArrangementOptionsSchema(db);

    return await db.select().from(arrangementOptions).where(and(eq(arrangementOptions.tenantId, tenantId), eq(arrangementOptions.isActive, true)));
  }

  async createArrangementOption(option: InsertArrangementOption): Promise<ArrangementOption> {
    await ensureArrangementOptionsSchema(db);

    const [newOption] = await db.insert(arrangementOptions).values(option).returning();
    return newOption;
  }

  async updateArrangementOption(
    id: string,
    tenantId: string,
    option: Partial<InsertArrangementOption>,
  ): Promise<ArrangementOption | undefined> {
    await ensureArrangementOptionsSchema(db);

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
    await ensureArrangementOptionsSchema(db);

    const deletedOptions = await db
      .delete(arrangementOptions)
      .where(and(eq(arrangementOptions.id, id), eq(arrangementOptions.tenantId, tenantId)))
      .returning();

    return deletedOptions.length > 0;
  }

  // Tenant settings operations
  async getTenantSettings(tenantId: string): Promise<TenantSettings | undefined> {
    await ensureTenantSettingsSchema(db);

    const [settings] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
    return settings;
  }

  async upsertTenantSettings(settings: InsertTenantSettings): Promise<TenantSettings> {
    await ensureTenantSettingsSchema(db);

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

  // Payment method operations (saved cards)
  async getPaymentMethodsByConsumer(consumerId: string, tenantId: string): Promise<PaymentMethod[]> {
    return await db
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.consumerId, consumerId), eq(paymentMethods.tenantId, tenantId)))
      .orderBy(desc(paymentMethods.isDefault), desc(paymentMethods.createdAt));
  }

  async createPaymentMethod(paymentMethod: InsertPaymentMethod): Promise<PaymentMethod> {
    const [newMethod] = await db.insert(paymentMethods).values(paymentMethod).returning();
    return newMethod;
  }

  async deletePaymentMethod(id: string, consumerId: string, tenantId: string): Promise<boolean> {
    const result = await db
      .delete(paymentMethods)
      .where(and(
        eq(paymentMethods.id, id),
        eq(paymentMethods.consumerId, consumerId),
        eq(paymentMethods.tenantId, tenantId)
      ))
      .returning();
    return result.length > 0;
  }

  async setDefaultPaymentMethod(id: string, consumerId: string, tenantId: string): Promise<PaymentMethod> {
    // First verify the payment method exists and belongs to this consumer/tenant
    const [existing] = await db
      .select()
      .from(paymentMethods)
      .where(and(
        eq(paymentMethods.id, id),
        eq(paymentMethods.consumerId, consumerId),
        eq(paymentMethods.tenantId, tenantId)
      ))
      .limit(1);
    
    if (!existing) {
      throw new Error('Payment method not found or access denied');
    }
    
    // Clear all default flags for this consumer
    await db
      .update(paymentMethods)
      .set({ isDefault: false })
      .where(and(eq(paymentMethods.consumerId, consumerId), eq(paymentMethods.tenantId, tenantId)));
    
    // Set this one as default
    const [updated] = await db
      .update(paymentMethods)
      .set({ isDefault: true })
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.tenantId, tenantId)))
      .returning();
    
    return updated;
  }

  // Payment schedule operations (recurring payments)
  async getPaymentSchedulesByConsumer(consumerId: string, tenantId: string): Promise<PaymentSchedule[]> {
    return await db
      .select()
      .from(paymentSchedules)
      .where(and(eq(paymentSchedules.consumerId, consumerId), eq(paymentSchedules.tenantId, tenantId)))
      .orderBy(desc(paymentSchedules.createdAt));
  }

  async getPaymentSchedulesByAccount(accountId: string, tenantId: string): Promise<PaymentSchedule[]> {
    return await db
      .select()
      .from(paymentSchedules)
      .where(and(eq(paymentSchedules.accountId, accountId), eq(paymentSchedules.tenantId, tenantId)))
      .orderBy(desc(paymentSchedules.createdAt));
  }

  async getActivePaymentSchedulesByConsumerAndAccount(consumerId: string, accountId: string, tenantId: string): Promise<PaymentSchedule[]> {
    return await db
      .select()
      .from(paymentSchedules)
      .where(and(
        eq(paymentSchedules.consumerId, consumerId), 
        eq(paymentSchedules.accountId, accountId),
        eq(paymentSchedules.tenantId, tenantId),
        eq(paymentSchedules.status, 'active')
      ));
  }

  async createPaymentSchedule(schedule: InsertPaymentSchedule): Promise<PaymentSchedule> {
    const [newSchedule] = await db.insert(paymentSchedules).values(schedule).returning();
    return newSchedule;
  }

  async updatePaymentSchedule(id: string, tenantId: string, updates: Partial<PaymentSchedule>): Promise<PaymentSchedule> {
    const [updated] = await db
      .update(paymentSchedules)
      .set(updates)
      .where(and(eq(paymentSchedules.id, id), eq(paymentSchedules.tenantId, tenantId)))
      .returning();
    
    if (!updated) {
      throw new Error('Payment schedule not found or access denied');
    }
    
    return updated;
  }

  async cancelPaymentSchedule(id: string, tenantId: string): Promise<boolean> {
    const result = await db
      .update(paymentSchedules)
      .set({ status: 'cancelled' })
      .where(and(eq(paymentSchedules.id, id), eq(paymentSchedules.tenantId, tenantId)))
      .returning();
    return result.length > 0;
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
    planId: MessagingPlanId | null;
    planName: string | null;
    emailUsage: {
      used: number;
      included: number;
      overage: number;
      overageCharge: number;
    };
    smsUsage: {
      used: number;
      included: number;
      overage: number;
      overageCharge: number;
    };
    billingPeriod: { start: string; end: string } | null;
  }> {
    const activeConsumersResult = await db.select().from(consumers).where(eq(consumers.tenantId, tenantId));
    const activeConsumers = activeConsumersResult.length;

    const subscription = await this.getSubscriptionByTenant(tenantId);
    
    // Fetch the actual plan from database using the subscription's planId
    let dbPlan = null;
    if (subscription?.planId) {
      const [planResult] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, subscription.planId));
      dbPlan = planResult;
    }

    const monthlyBase = dbPlan ? Number(dbPlan.monthlyPriceCents) / 100 : 0;

    let emailUsage = { used: 0, included: dbPlan?.includedEmails ?? 0, overage: 0, overageCharge: 0 };
    let smsUsage = { used: 0, included: dbPlan?.includedSms ?? 0, overage: 0, overageCharge: 0 };
    let usageCharges = 0;
    let totalBill = monthlyBase;
    let nextBillDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString();
    let billingPeriod: { start: string; end: string } | null = null;

    if (subscription) {
      const periodStart = new Date(subscription.currentPeriodStart);
      const periodEnd = new Date(subscription.currentPeriodEnd);
      billingPeriod = { start: periodStart.toISOString(), end: periodEnd.toISOString() };
      nextBillDate = periodEnd.toLocaleDateString();

      const usageTotals = await this.getMessagingUsageTotals(tenantId, periodStart, periodEnd);

      const includedEmails = dbPlan?.includedEmails ?? 0;
      const includedSms = dbPlan?.includedSms ?? 0;

      const emailOverage = Math.max(0, usageTotals.emailCount - includedEmails);
      const smsOverage = Math.max(0, usageTotals.smsSegments - includedSms);

      const emailOverageCharge = Number((emailOverage * EMAIL_OVERAGE_RATE_PER_EMAIL).toFixed(2));
      const smsOverageCharge = Number((smsOverage * SMS_OVERAGE_RATE_PER_SEGMENT).toFixed(2));

      emailUsage = {
        used: usageTotals.emailCount,
        included: includedEmails,
        overage: emailOverage,
        overageCharge: emailOverageCharge,
      };

      smsUsage = {
        used: usageTotals.smsSegments,
        included: includedSms,
        overage: smsOverage,
        overageCharge: smsOverageCharge,
      };

      usageCharges = Number((emailOverageCharge + smsOverageCharge).toFixed(2));
      totalBill = Number((monthlyBase + usageCharges).toFixed(2));
    }

    return {
      activeConsumers,
      monthlyBase,
      usageCharges,
      totalBill,
      nextBillDate,
      planId: (dbPlan?.slug as MessagingPlanId) ?? null,
      planName: dbPlan?.name ?? null,
      emailUsage,
      smsUsage,
      billingPeriod,
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

  // Stats operations
  async getTenantStats(tenantId: string): Promise<{
    totalConsumers: number;
    activeAccounts: number;
    totalBalance: number;
    collectionRate: number;
    paymentMetrics?: {
      totalPayments: number;
      successfulPayments: number;
      declinedPayments: number;
      totalCollected: number;
      monthlyCollected: number;
    };
    emailMetrics?: {
      totalSent: number;
      opened: number;
      openRate: number;
      bounced: number;
    };
  }> {
    const tenantConsumers = await db.select().from(consumers).where(eq(consumers.tenantId, tenantId));
    const tenantAccounts = await db.select().from(accounts).where(eq(accounts.tenantId, tenantId));
    
    const totalConsumers = tenantConsumers.length;
    const activeAccounts = tenantAccounts.filter(account => account.status === 'active').length;
    const totalBalance = tenantAccounts.reduce((sum, account) => sum + (account.balanceCents || 0), 0) / 100;
    
    // Calculate payment metrics
    const tenantPayments = await db
      .select()
      .from(payments)
      .innerJoin(accounts, eq(payments.accountId, accounts.id))
      .where(eq(accounts.tenantId, tenantId));
    
    const successfulPayments = tenantPayments.filter(p => p.payments.status === 'completed');
    const totalCollected = successfulPayments.reduce((sum, p) => sum + (p.payments.amountCents || 0), 0) / 100;
    
    // Monthly payments (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthlyPayments = successfulPayments.filter(p => {
      const createdAt = p.payments.createdAt;
      return createdAt && new Date(createdAt) >= thirtyDaysAgo;
    });
    const monthlyCollected = monthlyPayments.reduce((sum, p) => sum + (p.payments.amountCents || 0), 0) / 100;
    
    const declinedPayments = tenantPayments.filter(p => p.payments.status === 'failed' || p.payments.status === 'declined').length;
    
    // Calculate collection rate: (Total Collected / (Total Balance + Total Collected)) * 100
    // This represents the percentage of original debt that has been collected
    const originalDebt = totalBalance + totalCollected;
    const collectionRate = originalDebt > 0 ? Math.round((totalCollected / originalDebt) * 100) : 0;
    
    // Email metrics from Postmark webhooks
    const emailLogsData = await db
      .select()
      .from(emailLogs)
      .where(eq(emailLogs.tenantId, tenantId));
    
    const totalSent = emailLogsData.length;
    const opened = emailLogsData.filter(e => e.openedAt !== null).length;
    const bounced = emailLogsData.filter(e => e.bouncedAt !== null).length;
    const openRate = totalSent > 0 ? Math.round((opened / totalSent) * 100) : 0;
    
    return {
      totalConsumers,
      activeAccounts,
      totalBalance,
      collectionRate,
      paymentMetrics: {
        totalPayments: tenantPayments.length,
        successfulPayments: successfulPayments.length,
        declinedPayments,
        totalCollected,
        monthlyCollected,
      },
      emailMetrics: {
        totalSent,
        opened,
        openRate,
        bounced,
      },
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

  async getEmailCountByTenant(tenantId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailLogs)
      .where(eq(emailLogs.tenantId, tenantId));
    return result[0]?.count || 0;
  }

  async getSmsCountByTenant(tenantId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(smsTracking)
      .innerJoin(smsCampaigns, eq(smsTracking.campaignId, smsCampaigns.id))
      .where(eq(smsCampaigns.tenantId, tenantId));
    return result[0]?.count || 0;
  }

  async getPlatformStats(): Promise<any> {
    const allTenants = await db.select().from(tenants);
    const allConsumers = await db.select().from(consumers);
    const allAccounts = await db.select().from(accounts);
    
    // Get email and SMS usage counts
    const allEmails = await db.select({ tenantId: emailLogs.tenantId }).from(emailLogs);
    const allSms = await db.select({ campaignId: smsTracking.campaignId }).from(smsTracking);
    
    const totalTenants = allTenants.length;
    const activeTenants = allTenants.filter(t => t.isActive).length;
    const trialTenants = allTenants.filter(t => t.isTrialAccount).length;
    const paidTenants = allTenants.filter(t => t.isPaidAccount).length;
    const totalConsumers = allConsumers.length;
    const totalAccounts = allAccounts.length;
    const totalBalanceCents = allAccounts.reduce((sum: number, account: any) => sum + (account.balanceCents || 0), 0);
    const totalEmailsSent = allEmails.length;
    const totalSmsSent = allSms.length;
    
    return {
      totalTenants,
      activeTenants,
      trialTenants,
      paidTenants,
      totalConsumers,
      totalAccounts,
      totalBalanceCents,
      totalEmailsSent,
      totalSmsSent
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
    customSenderEmail?: string | null;
  }): Promise<Tenant> {
    const [updatedTenant] = await db.update(tenants)
      .set(twilioSettings)
      .where(eq(tenants.id, id))
      .returning();
    return updatedTenant;
  }
}

export const storage = new DatabaseStorage();
