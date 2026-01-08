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
  businessType: text("business_type").default('call_center'), // Type of business using the platform
  brand: jsonb("brand").default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").default(true), // Can be suspended by platform owner
  suspendedAt: timestamp("suspended_at"),
  suspensionReason: text("suspension_reason"),
  // Service cutoff controls (platform admin can disable specific services)
  emailServiceEnabled: boolean("email_service_enabled").default(true),
  smsServiceEnabled: boolean("sms_service_enabled").default(true),
  portalAccessEnabled: boolean("portal_access_enabled").default(true),
  paymentProcessingEnabled: boolean("payment_processing_enabled").default(true),
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
  customSenderEmail: text("custom_sender_email"), // Custom sender email (e.g., support@agencyname.com) - must be verified in Postmark
  // Twilio integration (each agency has their own)
  twilioAccountSid: text("twilio_account_sid"), // Twilio Account SID
  twilioAuthToken: text("twilio_auth_token"), // Twilio Auth Token (encrypted in production)
  twilioPhoneNumber: text("twilio_phone_number"), // Twilio phone number with country code
  twilioBusinessName: text("twilio_business_name"), // Business name registered with campaign
  twilioCampaignId: text("twilio_campaign_id"), // 10DLC Campaign ID if applicable
  notifiedOwners: boolean("notified_owners").default(false), // Track if owners were notified
  notificationSentAt: timestamp("notification_sent_at"),
  // Stripe billing integration
  stripeCustomerId: text("stripe_customer_id"), // Stripe customer ID for billing
  stripePaymentMethodId: text("stripe_payment_method_id"), // Default payment method (card or bank account)
  paymentMethodType: text("payment_method_type"), // 'card' or 'bank_account'
  cardLast4: text("card_last4"), // Last 4 digits of card for display
  cardBrand: text("card_brand"), // Card brand (Visa, Mastercard, etc.)
  bankAccountLast4: text("bank_account_last4"), // Last 4 digits of account number
  bankRoutingLast4: text("bank_routing_last4"), // Last 4 digits of routing number
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
  restrictedServices: text("restricted_services").array().default(sql`ARRAY[]::TEXT[]`), // Services this user cannot access (e.g., 'billing', 'sms', 'payments', 'import', 'reports')
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
  paymentStatus: text("payment_status", { enum: ['current', 'pending_payment', 'payment_failed', 'no_payment_plan'] }).default('no_payment_plan'), // Track payment plan status
  smsOptedOut: boolean("sms_opted_out").default(false), // Consumer opted out of SMS (replied STOP)
  smsOptedOutAt: timestamp("sms_opted_out_at"), // When they opted out
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
  filenumber: text("filenumber"), // Required for SMAX integration (nullable for migration)
  creditor: text("creditor").notNull(),
  balanceCents: bigint("balance_cents", { mode: "number" }).notNull(),
  originalBalanceCents: bigint("original_balance_cents", { mode: "number" }), // Original balance from import, used for balance recalculation
  status: text("status").default("active"),
  dueDate: date("due_date"),
  additionalData: jsonb("additional_data").default(sql`'{}'::jsonb`), // Store custom CSV columns
  returnedAt: timestamp("returned_at"), // Timestamp when account was moved to Returned folder (for auto-deletion after 7 days)
  createdAt: timestamp("created_at").defaultNow(),
});

// Push device tokens
export const pushDevices = pgTable("push_devices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  expoToken: text("expo_token"), // For Expo-based push notifications (legacy)
  pushToken: text("push_token"), // For native FCM/APNS tokens
  platform: text("platform"), // "ios", "android", "web", or "expo"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email templates (per tenant)
export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  greeting: text("greeting"), // User's custom greeting
  mainMessage: text("main_message"), // User's main message content
  buttonText: text("button_text"), // Button text
  buttonUrl: text("button_url"), // Button URL (can be variable or custom URL)
  closingMessage: text("closing_message"), // Additional message before sign-off
  signOff: text("sign_off"), // Sign-off text
  // Account details box customization
  showAccountDetails: boolean("show_account_details").default(true), // Show/hide account details box
  accountLabel: text("account_label").default("Account:"), // Custom label for account number
  creditorLabel: text("creditor_label").default("Creditor:"), // Custom label for creditor
  balanceLabel: text("balance_label").default("Balance:"), // Custom label for balance
  dueDateLabel: text("due_date_label").default("Due Date:"), // Custom label for due date
  designType: text("design_type").default("custom"), // "custom", "postmark-invoice", "postmark-welcome", etc.
  // New block-based editor structure
  blocks: jsonb("blocks"), // Array of draggable email blocks [{type, content, style, position}]
  editorMode: text("editor_mode").default("legacy"), // "legacy" (old HTML editor) or "builder" (new drag-and-drop)
  status: text("status").default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Email campaigns
export const emailCampaigns = pgTable("email_campaigns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  templateId: uuid("template_id").references(() => emailTemplates.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  targetGroup: text("target_group").notNull(), // "all", "with-balance", "overdue", "folder"
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }), // For folder-specific campaigns
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

// Email logs for all sent emails (usage tracking)
export const emailLogs = pgTable("email_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "set null" }), // Link to consumer for conversation tracking
  messageId: text("message_id"), // Postmark message ID
  fromEmail: text("from_email").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  htmlBody: text("html_body"),
  textBody: text("text_body"),
  status: text("status").default("sent"), // "sent", "delivered", "bounced", "complained", "opened"
  tag: text("tag"), // For categorizing emails (e.g., "test-email", "campaign", "notification")
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  sentAt: timestamp("sent_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  bouncedAt: timestamp("bounced_at"),
  complainedAt: timestamp("complained_at"),
  bounceReason: text("bounce_reason"),
  complaintReason: text("complaint_reason"),
});

// Email replies - inbound emails from consumers
export const emailReplies = pgTable("email_replies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "set null" }), // Null if consumer not found
  fromEmail: text("from_email").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  textBody: text("text_body"),
  htmlBody: text("html_body"),
  messageId: text("message_id"), // Postmark inbound message ID
  inReplyToMessageId: text("in_reply_to_message_id"), // Original message ID if this is a reply
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  readBy: text("read_by"), // Email/username of person who read it
  notes: text("notes"), // Internal notes about this reply
  receivedAt: timestamp("received_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// SMS replies - inbound SMS from consumers
export const smsReplies = pgTable("sms_replies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "set null" }), // Null if consumer not found
  fromPhone: text("from_phone").notNull(),
  toPhone: text("to_phone").notNull(), // Tenant's Twilio number
  messageBody: text("message_body").notNull(),
  messageSid: text("message_sid"), // Twilio message SID
  numMedia: bigint("num_media", { mode: "number" }).default(0), // Number of media attachments
  mediaUrls: text("media_urls").array(), // URLs of media attachments
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  readBy: text("read_by"), // Username of person who read it
  notes: text("notes"), // Internal notes
  receivedAt: timestamp("received_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Auto-response configuration (per tenant)
export const autoResponseConfig = pgTable("auto_response_config", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull().unique(),
  enabled: boolean("enabled").default(false),
  testMode: boolean("test_mode").default(true), // Test mode prevents auto-sending, only shows preview
  openaiApiKey: text("openai_api_key"), // User's OpenAI API key (encrypted in production)
  model: text("model").default("gpt-5-nano"), // OpenAI model to use
  responseTone: text("response_tone").default("professional"), // "professional", "friendly", "empathetic", "concise"
  customInstructions: text("custom_instructions"), // Additional instructions for AI
  businessResponseTemplate: text("business_response_template"), // Sample responses and templates for AI to reference
  enableEmailAutoResponse: boolean("enable_email_auto_response").default(true),
  enableSmsAutoResponse: boolean("enable_sms_auto_response").default(true),
  maxResponseLength: integer("max_response_length").default(500), // Max characters in response
  includedResponsesPerMonth: integer("included_responses_per_month").default(1000), // Based on plan
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Auto-response usage tracking
export const autoResponseUsage = pgTable("auto_response_usage", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  messageType: text("message_type").notNull(), // "email" or "sms"
  inboundMessageId: uuid("inbound_message_id"), // References emailReplies or smsReplies
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "set null" }),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  prompt: text("prompt").notNull(), // The generated prompt sent to OpenAI
  response: text("response").notNull(), // The AI-generated response
  tokensUsed: integer("tokens_used").default(0), // Tokens consumed
  model: text("model").notNull(), // Model used
  responseSent: boolean("response_sent").default(false), // Whether the response was actually sent
  testMode: boolean("test_mode").default(false), // Whether this was a test
  errorMessage: text("error_message"), // If generation failed
  createdAt: timestamp("created_at").defaultNow(),
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
  targetGroup: text("target_group").notNull(), // "all", "with-balance", "decline", "recent-upload", "folder"
  folderIds: text("folder_ids").array().default(sql`ARRAY[]::text[]`), // Array of folder IDs for folder targeting
  sendToAllNumbers: boolean("send_to_all_numbers").default(false), // DEPRECATED: Use phonesToSend instead
  phonesToSend: text("phones_to_send", { enum: ['1', '2', '3', 'all'] }).default('1'), // How many phone numbers to send to per consumer
  status: text("status").default("pending_approval"), // "pending", "pending_approval", "sending", "completed", "failed", "cancelled"
  lastSentIndex: bigint("last_sent_index", { mode: "number" }).default(0), // Track progress for resume functionality
  totalRecipients: bigint("total_recipients", { mode: "number" }).default(0),
  totalSent: bigint("total_sent", { mode: "number" }).default(0),
  totalDelivered: bigint("total_delivered", { mode: "number" }).default(0),
  totalErrors: bigint("total_errors", { mode: "number" }).default(0),
  totalOptOuts: bigint("total_opt_outs", { mode: "number" }).default(0),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  // Source tracking for automation/sequence campaigns
  source: text("source", { enum: ['manual', 'automation', 'sequence'] }).default('manual'), // Where this campaign originated
  automationId: uuid("automation_id"), // Links to communication_automations if source='automation'
  sequenceId: uuid("sequence_id"), // Links to communication_sequences if source='sequence'
  sequenceStepId: uuid("sequence_step_id"), // Links to specific step if source='sequence'
});

// SMS tracking for individual SMS sends
export const smsTracking = pgTable("sms_tracking", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // Nullable temporarily for Railway compatibility
  campaignId: uuid("campaign_id").references(() => smsCampaigns.id, { onDelete: "cascade" }), // Nullable - not all SMS belong to campaigns
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }), // Nullable - allows tracking non-consumer SMS
  phoneNumber: text("phone_number").notNull(),
  messageBody: text("message_body"), // SMS message content
  status: text("status").notNull(), // "sent", "delivered", "failed", "opted_out"
  segments: integer("segments").default(1), // Number of SMS segments (updated from Twilio webhook)
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  errorMessage: text("error_message"),
  trackingData: jsonb("tracking_data").default(sql`'{}'::jsonb`),
});

// SMS blocked numbers - tracks undeliverable/invalid phone numbers per tenant
export const smsBlockedNumbers = pgTable("sms_blocked_numbers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  phoneNumber: text("phone_number").notNull(),
  reason: text("reason").notNull(), // "undeliverable", "invalid", "carrier_blocked", "opted_out"
  errorCode: text("error_code"), // Twilio error code if applicable
  errorMessage: text("error_message"), // Full error message
  failureCount: integer("failure_count").default(1), // Number of times this number has failed
  firstFailedAt: timestamp("first_failed_at").defaultNow(),
  lastFailedAt: timestamp("last_failed_at").defaultNow(),
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
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
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

// Signature requests (for document signing addon)
export const signatureRequests = pgTable("signature_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("pending"), // "pending", "viewed", "signed", "declined", "expired"
  signedAt: timestamp("signed_at"),
  declinedAt: timestamp("declined_at"),
  declineReason: text("decline_reason"),
  viewedAt: timestamp("viewed_at"),
  expiresAt: timestamp("expires_at"),
  signatureData: text("signature_data"), // Base64 encoded signature image
  initialsData: text("initials_data"), // Base64 encoded initials image
  ipAddress: text("ip_address"), // IP address when signed
  userAgent: text("user_agent"), // Browser/device info when signed
  legalConsent: boolean("legal_consent").default(false), // User agreed to legal terms
  consentText: text("consent_text"), // The actual consent text shown
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Signed documents (completed signature requests with full legal record)
export const signedDocuments = pgTable("signed_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  signatureRequestId: uuid("signature_request_id").references(() => signatureRequests.id, { onDelete: "cascade" }).notNull().unique(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  signatureData: text("signature_data").notNull(), // Base64 encoded signature image
  initialsData: text("initials_data"), // Base64 encoded initials image
  ipAddress: text("ip_address").notNull(), // IP address when signed (required for legal compliance)
  userAgent: text("user_agent").notNull(), // Browser/device info when signed
  legalConsent: boolean("legal_consent").notNull().default(true), // User agreed to legal terms
  consentText: text("consent_text").notNull(), // The actual consent text shown
  signedAt: timestamp("signed_at").notNull(), // When the document was signed
  documentHash: text("document_hash"), // Optional: hash of the original document for integrity verification
  createdAt: timestamp("created_at").defaultNow(),
});

// Signature audit trail (immutable log of all signature events)
export const signatureAuditTrail = pgTable("signature_audit_trail", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  signatureRequestId: uuid("signature_request_id").references(() => signatureRequests.id, { onDelete: "cascade" }).notNull(),
  eventType: text("event_type").notNull(), // "created", "sent", "viewed", "signed", "declined", "expired"
  eventData: jsonb("event_data").default(sql`'{}'::jsonb`), // Additional event context
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  occurredAt: timestamp("occurred_at").defaultNow(),
});

// Document templates (per tenant) - for creating documents with variable replacement
export const documentTemplates = pgTable("document_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  title: text("title").notNull(), // Document title, can include variables like {{consumer_name}}
  content: text("content").notNull(), // HTML content with variable placeholders
  description: text("description"),
  signaturePlacement: text("signature_placement").default("bottom"), // "bottom", "custom"
  legalDisclaimer: text("legal_disclaimer"), // Optional legal text shown above signature
  consentText: text("consent_text").default("I agree to the terms and conditions outlined in this document."),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Global document templates (system-wide, not tenant-specific)
// Used for onboarding documents like software proposals and payment authorization forms
export const globalDocumentTemplates = pgTable("global_document_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").unique().notNull(), // "software_proposal", "payment_authorization"
  name: text("name").notNull(),
  title: text("title").notNull(), // Document title template with variables
  content: text("content").notNull(), // HTML content with variable placeholders
  description: text("description"),
  version: integer("version").default(1), // Track template versions
  requiredTenantFields: text("required_tenant_fields").array(), // ["businessType", "subscriptionPlan", "ownerName"]
  availableVariables: text("available_variables").array(), // List of allowed variable names
  interactiveFields: jsonb("interactive_fields"), // User-fillable fields: [{name: "paymentAmount", type: "select", label: "Payment Amount", options: [...], required: true}]
  signaturePlacement: text("signature_placement").default("bottom"),
  legalDisclaimer: text("legal_disclaimer"),
  consentText: text("consent_text").default("I agree to the terms and conditions outlined in this document."),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Signature request fields (for collecting data during signing)
// Used for payment authorization forms where payment details are entered during signing
// SECURITY: All sensitive payment data MUST be stored encrypted in encryptedValue
// The tokenizedValue should contain payment gateway tokens only (last4, token ID, etc.)
export const signatureRequestFields = pgTable("signature_request_fields", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  signatureRequestId: uuid("signature_request_id").references(() => signatureRequests.id, { onDelete: "cascade" }).notNull(),
  fieldKey: text("field_key").notNull(), // "card_number", "card_exp", "bank_routing", "payment_method_type", etc.
  fieldType: text("field_type", { 
    enum: ['text', 'sensitive', 'checkbox', 'date', 'tokenized'] 
  }).notNull(), // "sensitive" requires encryption
  displayValue: text("display_value"), // Non-sensitive display text (e.g., "Visa ending in 1234", "weekly")
  encryptedValue: text("encrypted_value"), // Encrypted sensitive data (card numbers, routing numbers)
  tokenizedValue: text("tokenized_value"), // Payment gateway tokens only (safe to store)
  isSensitive: boolean("is_sensitive").default(false), // Flag for PCI-sensitive fields
  createdAt: timestamp("created_at").defaultNow(),
});

// Tenant admin agreements (global admin sends agreements to tenants)
// Separate from consumer signature requests to avoid complexity
export const tenantAgreements = pgTable("tenant_agreements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  globalDocumentId: uuid("global_document_id").references(() => globalDocumentTemplates.id, { onDelete: "cascade" }).notNull(),
  agreementType: text("agreement_type").notNull(), // 'software_proposal', 'payment_authorization'
  agreementMetadata: jsonb("agreement_metadata").notNull(), // {companyName, module, pricing, contact, paymentDetails, etc.}
  documentContent: text("document_content"), // Full contract content for signing page (separate from email template)
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ['pending', 'viewed', 'agreed', 'declined']
  }).default("pending").notNull(),
  viewedAt: timestamp("viewed_at"),
  agreedAt: timestamp("agreed_at"),
  declinedAt: timestamp("declined_at"),
  declineReason: text("decline_reason"),
  ipAddress: text("ip_address"), // IP when agreed
  userAgent: text("user_agent"), // Browser info when agreed
  adminNotified: boolean("admin_notified").default(false), // Has admin been emailed with details?
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Arrangement/Settlement options (per tenant)
export const arrangementPlanTypes = [
  "range",
  "fixed_monthly",
  "settlement",
  "custom_terms",
  "one_time_payment",
  "pay_in_full",
] as const;

export type ArrangementPlanType = (typeof arrangementPlanTypes)[number];

export const balanceTiers = [
  "under_3000",      // < $3,000
  "3000_to_5000",    // $3,000 - $5,000
  "5000_to_10000",   // $5,000 - $10,000
  "over_10000",      // > $10,000
] as const;

export type BalanceTier = (typeof balanceTiers)[number];

// Helper to map balance tiers to min/max values (in cents)
export function getBalanceRangeFromTier(tier: BalanceTier): { minBalance: number; maxBalance: number } {
  switch (tier) {
    case "under_3000":
      return { minBalance: 0, maxBalance: 299999 }; // $0 - $2,999.99
    case "3000_to_5000":
      return { minBalance: 300000, maxBalance: 499999 }; // $3,000 - $4,999.99
    case "5000_to_10000":
      return { minBalance: 500000, maxBalance: 999999 }; // $5,000 - $9,999.99
    case "over_10000":
      return { minBalance: 1000000, maxBalance: 999999999 }; // $10,000+
  }
}

// Helper to get display name for balance tier
export function getBalanceTierLabel(tier: BalanceTier): string {
  switch (tier) {
    case "under_3000":
      return "Under $3,000";
    case "3000_to_5000":
      return "$3,000 - $5,000";
    case "5000_to_10000":
      return "$5,000 - $10,000";
    case "over_10000":
      return "Over $10,000";
  }
}

export const arrangementOptions = pgTable("arrangement_options", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(), // e.g., "Standard Payment Plan"
  description: text("description"),
  balanceTier: text("balance_tier", { enum: balanceTiers }), // Tier-based balance ranges
  minBalance: bigint("min_balance", { mode: "number" }).notNull(), // In cents (computed from balanceTier or custom)
  maxBalance: bigint("max_balance", { mode: "number" }).notNull(), // In cents (computed from balanceTier or custom)
  planType: text("plan_type", { enum: arrangementPlanTypes }).default("range").notNull(),
  monthlyPaymentMin: bigint("monthly_payment_min", { mode: "number" }), // In cents
  monthlyPaymentMax: bigint("monthly_payment_max", { mode: "number" }), // In cents
  fixedMonthlyPayment: bigint("fixed_monthly_payment", { mode: "number" }), // In cents
  payInFullAmount: bigint("pay_in_full_amount", { mode: "number" }), // In cents
  oneTimePaymentMin: bigint("one_time_payment_min", { mode: "number" }), // In cents - minimum for one-time payments
  payoffText: text("payoff_text"),
  payoffPercentageBasisPoints: integer("payoff_percentage_basis_points"),
  payoffDueDate: date("payoff_due_date"),
  settlementPaymentCounts: integer("settlement_payment_counts").array(), // Array of payment count options (e.g., [1, 3, 6] creates 3 options)
  settlementPaymentFrequency: text("settlement_payment_frequency"), // "monthly", "weekly", "biweekly"
  settlementOfferExpiresDate: date("settlement_offer_expires_date"), // Optional expiration date for settlement offers
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
  businessType: text("business_type").default("call_center"), // call_center, property_management, subscription_provider, freelancer_consultant, billing_service
  privacyPolicy: text("privacy_policy"),
  termsOfService: text("terms_of_service"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  showPaymentPlans: boolean("show_payment_plans").default(true),
  showDocuments: boolean("show_documents").default(true),
  allowSettlementRequests: boolean("allow_settlement_requests").default(true),
  customBranding: jsonb("custom_branding").default(sql`'{}'::jsonb`),
  consumerPortalSettings: jsonb("consumer_portal_settings").default(sql`'{}'::jsonb`),
  enabledModules: text("enabled_modules").array().default(sql`ARRAY[]::text[]`), // Business service modules enabled for this tenant
  enabledAddons: text("enabled_addons").array().default(sql`ARRAY[]::text[]`), // Optional add-on features (document_signing, advanced_reporting, etc.)
  smsThrottleLimit: bigint("sms_throttle_limit", { mode: "number" }).default(10), // SMS per minute limit
  minimumMonthlyPayment: bigint("minimum_monthly_payment", { mode: "number" }).default(5000), // In cents - global minimum for payment arrangements
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Payment processor fields (USAePay, Authorize.net, or NMI)
  merchantProvider: text("merchant_provider"), // 'usaepay', 'authorize_net', or 'nmi'
  // USAePay fields
  merchantAccountId: text("merchant_account_id"),
  merchantApiKey: text("merchant_api_key"),
  merchantApiPin: text("merchant_api_pin"),
  merchantName: text("merchant_name"),
  merchantType: text("merchant_type"),
  // Authorize.net fields
  authnetApiLoginId: text("authnet_api_login_id"),
  authnetTransactionKey: text("authnet_transaction_key"),
  authnetPublicClientKey: text("authnet_public_client_key"),
  // NMI fields
  nmiSecurityKey: text("nmi_security_key"),
  // Common fields
  useSandbox: boolean("use_sandbox").default(true),
  enableOnlinePayments: boolean("enable_online_payments").default(false),
  // SMAX integration fields
  smaxEnabled: boolean("smax_enabled").default(false),
  smaxApiKey: text("smax_api_key"),
  smaxPin: text("smax_pin"),
  smaxBaseUrl: text("smax_base_url").default("https://api.smaxcollectionsoftware.com:8000"),
  // Collection Max integration fields
  collectionMaxEnabled: boolean("collection_max_enabled").default(false),
  blockedAccountStatuses: text("blocked_account_statuses").array().default(sql`ARRAY['inactive', 'recalled', 'closed']::text[]`), // Account statuses that block communications and payments
  forceArrangement: boolean("force_arrangement").default(false), // When true, consumers must set up payment arrangement (no one-time payments)
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
  status: text("status").default("pending"), // "pending", "called", "no_answer", "scheduled", "in_progress", "completed", "cancelled"
  priority: text("priority").default("normal"), // "low", "normal", "high", "urgent"
  assignedTo: text("assigned_to"), // Admin user who took the request
  adminNotes: text("admin_notes"),
  scheduledFor: timestamp("scheduled_for"), // For scheduled callbacks
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

// Consumer saved payment methods (tokenized cards)
export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  paymentToken: text("payment_token").notNull(), // USAePay token or similar (never store raw card data)
  cardLast4: text("card_last4").notNull(), // Last 4 digits for display
  cardBrand: text("card_brand"), // "Visa", "Mastercard", "Amex", "Discover"
  cardholderName: text("cardholder_name"),
  expiryMonth: text("expiry_month"), // MM
  expiryYear: text("expiry_year"), // YYYY
  billingZip: text("billing_zip"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Recurring payment schedules for arrangements
export const paymentSchedules = pgTable("payment_schedules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }).notNull(),
  paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id, { onDelete: "cascade" }).notNull(),
  arrangementType: text("arrangement_type").notNull(), // "fixed_monthly", "range", "settlement", etc.
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(), // Amount to charge each period
  frequency: text("frequency").default("monthly"), // "weekly", "biweekly", "monthly"
  startDate: date("start_date").notNull(),
  endDate: date("end_date"), // Null for indefinite
  nextPaymentDate: date("next_payment_date").notNull(),
  remainingPayments: integer("remaining_payments"), // Null for indefinite
  status: text("status").default("active"), // "active", "paused", "completed", "cancelled", "failed"
  source: text("source").default("chain"), // "chain" or "smax" - tracks where this arrangement came from
  smaxSynced: boolean("smax_synced").default(false), // Whether this has been synced to SMAX
  processor: text("processor").default("chain"), // "chain" or "smax" - which processor handles the payments
  smaxArrangementId: text("smax_arrangement_id"), // SMAX arrangement ID for linking
  smaxLastSyncAt: timestamp("smax_last_sync_at"), // Last time we synced with SMAX
  smaxNextPaymentDate: date("smax_next_payment_date"), // Next payment date from SMAX
  smaxExpectedAmountCents: bigint("smax_expected_amount_cents", { mode: "number" }), // Expected payment amount from SMAX
  smaxStatus: text("smax_status"), // Status from SMAX
  failedAttempts: integer("failed_attempts").default(0),
  lastFailureReason: text("last_failure_reason"), // Reason for the last payment failure
  lastProcessedAt: timestamp("last_processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payment approvals for SMAX updates and card changes
export const paymentApprovals = pgTable("payment_approvals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  approvalType: text("approval_type").default("payment"), // "payment", "card_change"
  scheduleId: uuid("schedule_id").references(() => paymentSchedules.id, { onDelete: "cascade" }).notNull(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  filenumber: text("filenumber"), // SMAX filenumber (nullable for non-SMAX tenants)
  paymentDate: date("payment_date"), // Scheduled payment date (nullable for card changes)
  amountCents: bigint("amount_cents", { mode: "number" }), // Payment amount (nullable for card changes)
  transactionId: text("transaction_id"), // Payment processor transaction ID
  oldPaymentMethodId: uuid("old_payment_method_id").references(() => paymentMethods.id), // For card changes
  newPaymentMethodId: uuid("new_payment_method_id").references(() => paymentMethods.id), // For card changes
  paymentData: jsonb("payment_data").default(sql`'{}'::jsonb`), // Additional data (SMAX comparison results, etc.)
  status: text("status").default("pending"), // "pending", "approved", "rejected", "auto_approved"
  approvedBy: text("approved_by"), // Admin username who approved/rejected
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Subscription plans (platform-level plan definitions)
export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // "Launch", "Growth", "Pro", "Enterprise"
  slug: text("slug").notNull().unique(), // "launch", "growth", "pro", "enterprise"
  monthlyPriceCents: bigint("monthly_price_cents", { mode: "number" }).notNull(),
  setupFeeCents: bigint("setup_fee_cents", { mode: "number" }).default(10000), // $100 setup fee
  includedEmails: integer("included_emails").notNull(),
  includedSms: integer("included_sms").notNull(),
  emailOverageRatePer1000: integer("email_overage_rate_per_1000").default(250), // $2.50 per 1000 = 250 cents
  smsOverageRatePerSegment: integer("sms_overage_rate_per_segment").default(3), // $0.03 per segment = 3 cents
  features: text("features"), // JSON stringified array of feature descriptions
  isActive: boolean("is_active").default(true),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tenant subscriptions (for billing agencies)
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull().unique(),
  planId: uuid("plan_id").references(() => subscriptionPlans.id).notNull(),
  status: text("status").default("pending_approval"), // "pending_approval", "active", "cancelled", "suspended", "past_due", "trial", "rejected"
  billingEmail: text("billing_email"),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  emailsUsedThisPeriod: integer("emails_used_this_period").default(0),
  smsUsedThisPeriod: integer("sms_used_this_period").default(0),
  setupFeeWaived: boolean("setup_fee_waived").default(false),
  setupFeePaidAt: timestamp("setup_fee_paid_at"),
  requestedBy: text("requested_by"), // Username/email of person who requested
  requestedAt: timestamp("requested_at").defaultNow(),
  approvedBy: text("approved_by"), // Admin who approved/rejected
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
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

// Service activation requests (for à la carte service approvals)
export const serviceActivationRequests = pgTable("service_activation_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  serviceType: text("service_type").notNull(), // "portal_processing", "email_service", "sms_service"
  status: text("status").notNull().default("pending"), // "pending", "approved", "rejected"
  requestedBy: text("requested_by"), // Email/username of person who requested
  requestedAt: timestamp("requested_at").defaultNow(),
  approvedBy: text("approved_by"), // Admin who approved/rejected
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Prevent duplicate pending requests for the same service
  uniquePendingRequest: uniqueIndex("service_activation_requests_unique_pending_idx")
    .on(table.tenantId, table.serviceType)
    .where(sql`status = 'pending'`),
  // Index for querying pending requests by tenant
  tenantStatusIdx: index("service_activation_requests_tenant_status_idx").on(table.tenantId, table.status),
  // Index for global admin to query all pending requests
  statusIdx: index("service_activation_requests_status_idx").on(table.status),
}));

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
export const documentsRelations = relations(documents, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [documents.tenantId],
    references: [tenants.id],
  }),
  account: one(accounts, {
    fields: [documents.accountId],
    references: [accounts.id],
  }),
  signatureRequests: many(signatureRequests),
}));

export const documentTemplatesRelations = relations(documentTemplates, ({ one }) => ({
  tenant: one(tenants, {
    fields: [documentTemplates.tenantId],
    references: [tenants.id],
  }),
}));

export const signatureRequestsRelations = relations(signatureRequests, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [signatureRequests.tenantId],
    references: [tenants.id],
  }),
  consumer: one(consumers, {
    fields: [signatureRequests.consumerId],
    references: [consumers.id],
  }),
  account: one(accounts, {
    fields: [signatureRequests.accountId],
    references: [accounts.id],
  }),
  document: one(documents, {
    fields: [signatureRequests.documentId],
    references: [documents.id],
  }),
  auditTrail: many(signatureAuditTrail),
  signedDocument: one(signedDocuments, {
    fields: [signatureRequests.id],
    references: [signedDocuments.signatureRequestId],
  }),
}));

export const signedDocumentsRelations = relations(signedDocuments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [signedDocuments.tenantId],
    references: [tenants.id],
  }),
  consumer: one(consumers, {
    fields: [signedDocuments.consumerId],
    references: [consumers.id],
  }),
  account: one(accounts, {
    fields: [signedDocuments.accountId],
    references: [accounts.id],
  }),
  document: one(documents, {
    fields: [signedDocuments.documentId],
    references: [documents.id],
  }),
  signatureRequest: one(signatureRequests, {
    fields: [signedDocuments.signatureRequestId],
    references: [signatureRequests.id],
  }),
}));

export const signatureAuditTrailRelations = relations(signatureAuditTrail, ({ one }) => ({
  signatureRequest: one(signatureRequests, {
    fields: [signatureAuditTrail.signatureRequestId],
    references: [signatureRequests.id],
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

export const paymentMethodsRelations = relations(paymentMethods, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [paymentMethods.tenantId],
    references: [tenants.id],
  }),
  consumer: one(consumers, {
    fields: [paymentMethods.consumerId],
    references: [consumers.id],
  }),
  schedules: many(paymentSchedules),
}));

export const paymentSchedulesRelations = relations(paymentSchedules, ({ one }) => ({
  tenant: one(tenants, {
    fields: [paymentSchedules.tenantId],
    references: [tenants.id],
  }),
  consumer: one(consumers, {
    fields: [paymentSchedules.consumerId],
    references: [consumers.id],
  }),
  account: one(accounts, {
    fields: [paymentSchedules.accountId],
    references: [accounts.id],
  }),
  paymentMethod: one(paymentMethods, {
    fields: [paymentSchedules.paymentMethodId],
    references: [paymentMethods.id],
  }),
}));

export const subscriptionPlansRelations = relations(subscriptionPlans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [subscriptions.tenantId],
    references: [tenants.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [subscriptions.planId],
    references: [subscriptionPlans.id],
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

// Communication Automations (Simplified - each automation is a single scheduled send)
export const communicationAutomations = pgTable("communication_automations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type", { enum: ['email', 'sms'] }).notNull(),
  templateId: uuid("template_id").notNull(), // Single template for this scheduled send
  isActive: boolean("is_active").default(true),
  
  // Schedule settings - specific date and time
  scheduledDate: timestamp("scheduled_date").notNull(), // Exact date to send
  scheduleTime: text("schedule_time").notNull(), // Format: "HH:MM" (24-hour)
  
  // Target audience - which folder(s) to send to
  targetType: text("target_type").notNull().default('folders'), // 'folders', 'all', 'consumers'
  targetFolderIds: uuid("target_folder_ids").array(), // Empty array means send to all
  
  // SMS-specific settings
  phonesToSend: text("phones_to_send", { enum: ['1', '2', '3', 'all'] }).default('1'), // How many phone numbers to send to per consumer (SMS only)
  
  // Execution tracking
  nextExecution: timestamp("next_execution"), // When the automation should run next (used by processor)
  lastExecuted: timestamp("last_executed"),
  totalSent: bigint("total_sent", { mode: "number" }).default(0),
  
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

// Communication sequences for multi-day automation (supports email and SMS)
export const communicationSequences = pgTable("communication_sequences", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  
  // Trigger settings
  triggerType: text("trigger_type", { enum: ['immediate', 'scheduled', 'event'] }).notNull().default('immediate'),
  triggerEvent: text("trigger_event", { enum: ['account_created', 'payment_received', 'payment_overdue', 'payment_failed', 'one_time_payment'] }),
  triggerDelay: bigint("trigger_delay", { mode: "number" }).default(0), // Days to wait after event before starting sequence
  
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

// Individual steps in a communication sequence (can be email, SMS, or signature request)
export const communicationSequenceSteps = pgTable("communication_sequence_steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: uuid("sequence_id").references(() => communicationSequences.id, { onDelete: "cascade" }).notNull(),
  stepType: text("step_type", { enum: ['email', 'sms', 'signature_request'] }).notNull(), // Type of this step
  templateId: uuid("template_id"), // References emailTemplates, smsTemplates, or documentTemplates depending on stepType
  
  stepOrder: bigint("step_order", { mode: "number" }).notNull(), // 1, 2, 3, etc.
  delayDays: bigint("delay_days", { mode: "number" }).default(0), // Days to wait before sending (from previous step or enrollment)
  delayHours: bigint("delay_hours", { mode: "number" }).default(0), // Additional hours to wait
  
  // Step conditions (optional)
  conditions: jsonb("conditions"), // JSON for advanced conditions
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Track individual consumer progress through sequences
export const communicationSequenceEnrollments = pgTable("communication_sequence_enrollments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: uuid("sequence_id").references(() => communicationSequences.id, { onDelete: "cascade" }).notNull(),
  consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }).notNull(),
  
  // Progress tracking
  currentStepId: uuid("current_step_id").references(() => communicationSequenceSteps.id),
  currentStepOrder: bigint("current_step_order", { mode: "number" }).default(1),
  status: text("status", { enum: ['active', 'completed', 'paused', 'cancelled'] }).notNull().default('active'),
  
  // Timing
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  nextMessageAt: timestamp("next_message_at"), // When the next message should be sent
  completedAt: timestamp("completed_at"),
  lastMessageSentAt: timestamp("last_message_sent_at"),
  
  // Tracking
  messagesSent: bigint("messages_sent", { mode: "number" }).default(0),
  messagesOpened: bigint("messages_opened", { mode: "number" }).default(0),
  messagesClicked: bigint("messages_clicked", { mode: "number" }).default(0),
  
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

// Communication sequence relations
export const communicationSequencesRelations = relations(communicationSequences, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [communicationSequences.tenantId],
    references: [tenants.id],
  }),
  steps: many(communicationSequenceSteps),
  enrollments: many(communicationSequenceEnrollments),
}));

export const communicationSequenceStepsRelations = relations(communicationSequenceSteps, ({ one }) => ({
  sequence: one(communicationSequences, {
    fields: [communicationSequenceSteps.sequenceId],
    references: [communicationSequences.id],
  }),
}));

export const communicationSequenceEnrollmentsRelations = relations(communicationSequenceEnrollments, ({ one }) => ({
  sequence: one(communicationSequences, {
    fields: [communicationSequenceEnrollments.sequenceId],
    references: [communicationSequences.id],
  }),
  consumer: one(consumers, {
    fields: [communicationSequenceEnrollments.consumerId],
    references: [consumers.id],
  }),
  currentStep: one(communicationSequenceSteps, {
    fields: [communicationSequenceEnrollments.currentStepId],
    references: [communicationSequenceSteps.id],
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
export const insertDocumentTemplateSchema = createInsertSchema(documentTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGlobalDocumentTemplateSchema = createInsertSchema(globalDocumentTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSignatureRequestSchema = createInsertSchema(signatureRequests).omit({ id: true, createdAt: true, updatedAt: true, signedAt: true, declinedAt: true, viewedAt: true });
export const insertSignatureRequestFieldSchema = createInsertSchema(signatureRequestFields).omit({ id: true, createdAt: true });
export const insertSignedDocumentSchema = createInsertSchema(signedDocuments).omit({ id: true, createdAt: true });
export const insertSignatureAuditTrailSchema = createInsertSchema(signatureAuditTrail).omit({ id: true, occurredAt: true });
export const insertTenantAgreementSchema = createInsertSchema(tenantAgreements).omit({ id: true, createdAt: true, updatedAt: true, viewedAt: true, agreedAt: true, declinedAt: true });
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
      case "settlement": {
        if (data.payoffPercentageBasisPoints == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["payoffPercentageBasisPoints"],
            message: "Settlement percentage is required",
          });
        } else if (data.payoffPercentageBasisPoints <= 0 || data.payoffPercentageBasisPoints > 10000) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["payoffPercentageBasisPoints"],
            message: "Settlement percentage must be between 0 and 100",
          });
        }

        if (!data.settlementPaymentCounts || !Array.isArray(data.settlementPaymentCounts) || data.settlementPaymentCounts.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["settlementPaymentCounts"],
            message: "At least one settlement payment count option is required",
          });
        } else if (data.settlementPaymentCounts.some((count: number) => count < 1)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["settlementPaymentCounts"],
            message: "All payment count options must be at least 1",
          });
        }

        if (!data.settlementPaymentFrequency || !['weekly', 'biweekly', 'monthly'].includes(data.settlementPaymentFrequency)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["settlementPaymentFrequency"],
            message: "Payment frequency is required for settlement arrangements",
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
      case "one_time_payment": {
        // One-time payment has no additional validation requirements
        // It just needs the base fields (minBalance, maxBalance, name)
        break;
      }
      case "pay_in_full": {
        // Pay in full has no additional validation requirements
        // Consumer pays their entire balance
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
export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({ id: true, sentAt: true, deliveredAt: true, openedAt: true, bouncedAt: true, complainedAt: true });
export const insertEmailReplySchema = createInsertSchema(emailReplies).omit({ id: true, createdAt: true, receivedAt: true, readAt: true });
export const insertSmsReplySchema = createInsertSchema(smsReplies).omit({ id: true, createdAt: true, receivedAt: true, readAt: true });
export const insertAutoResponseConfigSchema = createInsertSchema(autoResponseConfig).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAutoResponseUsageSchema = createInsertSchema(autoResponseUsage).omit({ id: true, createdAt: true });
export const insertConsumerNotificationSchema = createInsertSchema(consumerNotifications).omit({ id: true, createdAt: true });
export const insertCallbackRequestSchema = createInsertSchema(callbackRequests).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentScheduleSchema = createInsertSchema(paymentSchedules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentApprovalSchema = createInsertSchema(paymentApprovals).omit({ id: true, createdAt: true });
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertServiceActivationRequestSchema = createInsertSchema(serviceActivationRequests).omit({ id: true, createdAt: true });
export const insertMessagingUsageEventSchema = createInsertSchema(messagingUsageEvents).omit({ id: true, createdAt: true });
export const insertFolderSchema = createInsertSchema(folders).omit({ id: true, createdAt: true });
export const insertSmsTemplateSchema = createInsertSchema(smsTemplates).omit({ id: true, createdAt: true });
export const insertSmsCampaignSchema = createInsertSchema(smsCampaigns).omit({ id: true, createdAt: true, completedAt: true });
export const insertSmsTrackingSchema = createInsertSchema(smsTracking).omit({ id: true });
export const insertCommunicationAutomationSchema = createInsertSchema(communicationAutomations).omit({ id: true, createdAt: true, updatedAt: true, lastExecuted: true, totalSent: true });
export const insertAutomationExecutionSchema = createInsertSchema(automationExecutions).omit({ id: true, executedAt: true });
export const insertCommunicationSequenceSchema = createInsertSchema(communicationSequences).omit({ id: true, createdAt: true, updatedAt: true, totalEnrolled: true, totalCompleted: true });
export const insertCommunicationSequenceStepSchema = createInsertSchema(communicationSequenceSteps).omit({ id: true, createdAt: true });
export const insertCommunicationSequenceEnrollmentSchema = createInsertSchema(communicationSequenceEnrollments).omit({ id: true, createdAt: true, updatedAt: true, messagesSent: true, messagesOpened: true, messagesClicked: true });

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
export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type GlobalDocumentTemplate = typeof globalDocumentTemplates.$inferSelect;
export type InsertGlobalDocumentTemplate = z.infer<typeof insertGlobalDocumentTemplateSchema>;
export type SignatureRequest = typeof signatureRequests.$inferSelect;
export type InsertSignatureRequest = z.infer<typeof insertSignatureRequestSchema>;
export type SignatureRequestField = typeof signatureRequestFields.$inferSelect;
export type InsertSignatureRequestField = z.infer<typeof insertSignatureRequestFieldSchema>;
export type SignedDocument = typeof signedDocuments.$inferSelect;
export type InsertSignedDocument = z.infer<typeof insertSignedDocumentSchema>;
export type SignatureAuditTrail = typeof signatureAuditTrail.$inferSelect;
export type InsertSignatureAuditTrail = z.infer<typeof insertSignatureAuditTrailSchema>;
export type TenantAgreement = typeof tenantAgreements.$inferSelect;
export type InsertTenantAgreement = z.infer<typeof insertTenantAgreementSchema>;
export type ArrangementOption = typeof arrangementOptions.$inferSelect;
export type InsertArrangementOption = z.infer<typeof insertArrangementOptionSchema>;
export type TenantSettings = typeof tenantSettings.$inferSelect;
export type InsertTenantSettings = z.infer<typeof insertTenantSettingsSchema>;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type EmailTracking = typeof emailTracking.$inferSelect;
export type InsertEmailTracking = z.infer<typeof insertEmailTrackingSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailReply = typeof emailReplies.$inferSelect;
export type InsertEmailReply = z.infer<typeof insertEmailReplySchema>;
export type SmsReply = typeof smsReplies.$inferSelect;
export type AutoResponseConfig = typeof autoResponseConfig.$inferSelect;
export type InsertAutoResponseConfig = z.infer<typeof insertAutoResponseConfigSchema>;
export type AutoResponseUsage = typeof autoResponseUsage.$inferSelect;
export type InsertAutoResponseUsage = z.infer<typeof insertAutoResponseUsageSchema>;
export type InsertSmsReply = z.infer<typeof insertSmsReplySchema>;
export type ConsumerNotification = typeof consumerNotifications.$inferSelect;
export type InsertConsumerNotification = z.infer<typeof insertConsumerNotificationSchema>;
export type CallbackRequest = typeof callbackRequests.$inferSelect;
export type InsertCallbackRequest = z.infer<typeof insertCallbackRequestSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;
export type PaymentSchedule = typeof paymentSchedules.$inferSelect;
export type InsertPaymentSchedule = z.infer<typeof insertPaymentScheduleSchema>;
export type PaymentApproval = typeof paymentApprovals.$inferSelect;
export type InsertPaymentApproval = z.infer<typeof insertPaymentApprovalSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type ServiceActivationRequest = typeof serviceActivationRequests.$inferSelect;
export type InsertServiceActivationRequest = z.infer<typeof insertServiceActivationRequestSchema>;
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
export type CommunicationSequence = typeof communicationSequences.$inferSelect;
export type InsertCommunicationSequence = z.infer<typeof insertCommunicationSequenceSchema>;
export type CommunicationSequenceStep = typeof communicationSequenceSteps.$inferSelect;
export type InsertCommunicationSequenceStep = z.infer<typeof insertCommunicationSequenceStepSchema>;
export type CommunicationSequenceEnrollment = typeof communicationSequenceEnrollments.$inferSelect;
export type InsertCommunicationSequenceEnrollment = z.infer<typeof insertCommunicationSequenceEnrollmentSchema>;
