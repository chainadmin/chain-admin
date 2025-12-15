import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { storage, type IStorage } from "./storage";
import { authenticateUser, authenticateConsumer, getCurrentUser, requireEmailService, requireSmsService, requirePortalAccess, requirePaymentProcessing } from "./authMiddleware";
import { postmarkServerService } from "./postmarkServerService";
import {
  insertConsumerSchema,
  insertAccountSchema,
  insertArrangementOptionSchema,
  arrangementPlanTypes,
  agencyTrialRegistrationSchema,
  platformUsers,
  tenants,
  tenantSettings,
  consumers,
  accounts as accountsTable,
  payments,
  agencyCredentials,
  users,
  subscriptionPlans,
  subscriptions,
  invoices,
  emailLogs,
  emailCampaigns,
  serviceActivationRequests,
  autoResponseConfig,
  autoResponseUsage,
  messagingUsageEvents,
  type Account,
  type Consumer,
  type Tenant,
  type InsertArrangementOption,
  type SmsTracking,
} from "@shared/schema";
import { db } from "./db";
import { and, eq, sql, desc, gte, lte } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import express from "express";
import { emailService } from "./emailService";
import { smsService } from "./smsService";
import { smaxService } from "./smaxService";
import { eventService } from "./eventService";
import { uploadLogo } from "./r2Storage";
import { AuthnetService } from "./authnetService";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { subdomainMiddleware } from "./middleware/subdomain";
import {
  messagingPlanList,
  messagingPlans,
  EMAIL_OVERAGE_RATE_PER_THOUSAND,
  SMS_OVERAGE_RATE_PER_SEGMENT,
  type MessagingPlanId,
} from "@shared/billing-plans";
import { listConsumers, updateConsumer, deleteConsumers, ConsumerNotFoundError } from "@shared/server/consumers";
import { resolveConsumerPortalUrl } from "@shared/utils/consumerPortal";
import { finalizeEmailHtml } from "@shared/utils/emailTemplate";
import { ensureBaseUrl, getKnownDomainOrigins } from "@shared/utils/baseUrl";
import { isOriginOnKnownDomain } from "@shared/utils/domains";
import { 
  getModuleNameForBusinessType, 
  getModuleDescriptionForBusinessType, 
  getPlanPricingForTenant,
  formatDollarAmount 
} from "@shared/globalDocumentHelpers";

// Lenient CSV schema - allows any string for email, we filter invalid ones later
const csvUploadSchema = z.object({
  consumers: z.array(z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(), // Accept any string, we'll filter invalid emails
    phone: z.string().optional(),
    dateOfBirth: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    ssnLast4: z.string().optional(),
    additionalData: z.record(z.any()).optional(),
  })),
  accounts: z.array(z.object({
    accountNumber: z.string().optional(), // Allow missing account numbers
    creditor: z.string(),
    balanceCents: z.number(),
    dueDate: z.string().optional(),
    consumerEmail: z.string(), // Accept any string, we'll filter invalid emails
    filenumber: z.string().optional(),
    status: z.string().optional(),
    additionalData: z.record(z.any()).optional(),
  })),
  folderId: z.string().optional(),
  clearExistingPhones: z.boolean().optional(),
});

// Helper function to validate email format
function isValidEmail(email: string): boolean {
  if (!email || !email.trim()) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// Multer configuration for image uploads - using memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

// Multer configuration for document uploads - accepts PDFs, images, Word docs, etc.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for documents
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. Accepted types: PDF, Word, Excel, Images, and Text files`));
    }
  }
});

// Helper utilities for template variable replacement
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatCurrency(cents: number | string | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const numericValue = typeof cents === 'number' ? cents : Number(cents);
  if (Number.isNaN(numericValue)) return '';
  return `$${(numericValue / 100).toFixed(2)}`;
}

function applyTemplateReplacement(template: string, key: string, value: string): string {
  if (!template) return template;
  const sanitizedValue = value ?? '';
  const keyPattern = escapeRegExp(key);
  const patterns = [
    new RegExp(`\\{\\{\\s*${keyPattern}\\s*\\}\\}`, 'gi'),
    new RegExp(`\\{\\s*${keyPattern}\\s*\\}`, 'gi'),
  ];

  return patterns.reduce((result, pattern) => result.replace(pattern, sanitizedValue), template);
}

// Legal disclaimer constants for document templates
const FDCPA_DISCLAIMER = `This is an attempt to collect a debt and any information obtained will be used for that purpose. This communication is from a debt collector.`;

const VALIDATION_NOTICE = `Unless you notify this office within 30 days after receiving this notice that you dispute the validity of this debt or any portion thereof, this office will assume this debt is valid. If you notify this office in writing within 30 days from receiving this notice that you dispute the validity of this debt or any portion thereof, this office will obtain verification of the debt or obtain a copy of a judgment and mail you a copy of such judgment or verification. If you request this office in writing within 30 days after receiving this notice, this office will provide you with the name and address of the original creditor, if different from the current creditor.`;

const ESIGN_CONSENT = `By clicking "I Agree" and signing this document electronically, you consent to conduct this transaction by electronic means. You acknowledge that your electronic signature is the legal equivalent of your manual signature and that you intend to be legally bound by the terms of this agreement. You have the right to request a paper copy of this document.`;

// Helper function to replace template variables for both email and SMS content
function replaceTemplateVariables(
  template: string,
  consumer: any,
  account: any,
  tenant: any,
  baseUrl?: string
): string {
  if (!template) return template;

  const normalizedBaseUrl = ensureBaseUrl(baseUrl || process.env.REPLIT_DOMAINS, tenant?.slug);
  const sanitizedBaseUrl = normalizedBaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const baseProtocol = normalizedBaseUrl.startsWith('http://') ? 'http://' : 'https://';
  const consumerEmail = consumer?.email || '';
  const consumerSlug = tenant?.slug;

  const consumerPortalSettings =
    (tenant as any)?.consumerPortalSettings ||
    (tenant as any)?.settings?.consumerPortalSettings ||
    (tenant as any)?.tenantSettings?.consumerPortalSettings;

  const consumerPortalUrl = resolveConsumerPortalUrl({
    tenantSlug: consumerSlug,
    consumerPortalSettings,
    baseUrl: normalizedBaseUrl,
  });

  // App download URLs - platform-wide
  const ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=com.chainsoftware.platform';
  const IOS_APP_URL = ''; // Will be added when iOS app is ready
  const universalAppLink = sanitizedBaseUrl ? `${baseProtocol}${sanitizedBaseUrl}/app` : '';
  
  const unsubscribeBase = sanitizedBaseUrl ? `${baseProtocol}${sanitizedBaseUrl}/unsubscribe` : '';

  const firstName = consumer?.firstName || '';
  const lastName = consumer?.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const consumerPhone = consumer?.phone || '';
  const fileNumber = account?.filenumber || account?.accountNumber || '';
  const consumerAddress = consumer?.address || '';
  const consumerCity = consumer?.city || '';
  const consumerState = consumer?.state || '';
  const consumerZip = consumer?.zipCode || '';
  const fullAddressParts = [consumerAddress, consumerCity, consumerState, consumerZip].filter(part => part && String(part).trim().length > 0);
  const fullAddress = fullAddressParts.length > 0
    ? fullAddressParts
        .map((part, index) => {
          if (!part) return '';
          if (index === fullAddressParts.length - 2 && part === consumerState && consumerZip) {
            return `${consumerState} ${consumerZip}`.trim();
          }
          if (index === fullAddressParts.length - 1 && part === consumerZip && fullAddressParts.includes(consumerState)) {
            return '';
          }
          return String(part);
        })
        .filter(Boolean)
        .join(', ')
    : '';

  const unsubscribeUrl = unsubscribeBase
    ? `${unsubscribeBase}${consumerEmail ? `?email=${encodeURIComponent(consumerEmail)}` : ''}${tenant?.id ? `${consumerEmail ? '&' : '?'}tenant=${encodeURIComponent(tenant.id)}` : ''}`
    : '';
  const unsubscribeButtonHtml = unsubscribeUrl
    ? `<table class="body-action" align="center" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <table border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td>
            <a href="${unsubscribeUrl}" class="button" style="background-color:#6B7280;border-radius:4px;color:#ffffff;display:inline-block;padding:10px 18px;text-decoration:none;" target="_blank">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
    : '';

  const balanceCents = account?.balanceCents;
  const formattedBalance = formatCurrency(balanceCents);
  const formattedDueDate = account?.dueDate ? new Date(account.dueDate).toLocaleDateString() : '';
  const dueDateIso = account?.dueDate ? new Date(account.dueDate).toISOString().split('T')[0] : '';
  const todaysDate = new Date().toLocaleDateString();

  // Calculate date helpers
  const now = new Date();
  const currentYear = now.getFullYear().toString();
  const currentMonth = now.toLocaleDateString('en-US', { month: 'long' });
  const currentDatetime = now.toLocaleString();
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toLocaleDateString();
  
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekDate = nextWeek.toLocaleDateString();
  
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthDate = nextMonth.toLocaleDateString();

  // Consumer date of birth
  const dob = consumer?.dateOfBirth ? new Date(consumer.dateOfBirth).toLocaleDateString() : '';

  // Calculate balance percentages for settlement offers
  const balance50 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents * 0.5)) : '';
  const balance60 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents * 0.6)) : '';
  const balance70 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents * 0.7)) : '';
  const balance80 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents * 0.8)) : '';
  const balance90 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents * 0.9)) : '';
  const balance100 = formattedBalance; // Same as full balance

  // Get additional account fields from additionalData
  const accountData = account?.additionalData || {};
  const consumerData = consumer?.additionalData || {};
  
  // Smart SSN extraction - check consumer.ssnLast4 first, then additionalData fields
  let ssnLast4 = '';
  // First check the consumer's direct ssnLast4 field
  if (consumer?.ssnLast4 && String(consumer.ssnLast4).trim()) {
    const ssnStr = String(consumer.ssnLast4).replace(/\D/g, '');
    if (ssnStr.length >= 4) {
      ssnLast4 = ssnStr.slice(-4);
    }
  }
  // If not found, check additionalData fields in consumer and account
  if (!ssnLast4) {
    const ssnFieldNames = ['ssnLast4', 'ssn_last_4', 'ssn', 'socialSecurityNumber', 'social_security_number', 'socialsecuritynumber'];
    for (const fieldName of ssnFieldNames) {
      const ssnValue = consumerData?.[fieldName] || accountData?.[fieldName];
      if (ssnValue && String(ssnValue).trim()) {
        const ssnStr = String(ssnValue).replace(/\D/g, ''); // Remove non-digits
        if (ssnStr.length >= 4) {
          ssnLast4 = ssnStr.slice(-4); // Get last 4 digits
          break;
        }
      }
    }
  }
  
  const originalCreditor = accountData?.originalCreditor || accountData?.original_creditor || account?.creditor || '';
  const chargeOffDate = accountData?.chargeOffDate || accountData?.charge_off_date || '';
  const accountStatus = account?.status || '';
  const lastPaymentDate = accountData?.lastPaymentDate || accountData?.last_payment_date || '';
  const clientReference = accountData?.clientReference || accountData?.client_reference || account?.accountNumber || '';

  // Get arrangement settings from tenant
  const tenantSettings = (tenant as any)?.tenantSettings || (tenant as any)?.settings || {};
  const settlementPaymentCounts = tenantSettings?.settlementPaymentCounts || [];
  const settlementPaymentFrequency = tenantSettings?.settlementPaymentFrequency || '';
  const minimumMonthlyPayment = tenantSettings?.minimumMonthlyPayment ? formatCurrency(tenantSettings.minimumMonthlyPayment) : '';
  const settlementOfferExpiresDate = tenantSettings?.settlementOfferExpiresDate ? new Date(tenantSettings.settlementOfferExpiresDate).toLocaleDateString() : '';

  // Get active arrangement for this account (if exists)
  const activeArrangement = account?.activeArrangement || (account as any)?.arrangement || null;
  const monthlyPayment = activeArrangement?.monthlyPaymentCents ? formatCurrency(activeArrangement.monthlyPaymentCents) : '';
  const numberOfPayments = activeArrangement?.numberOfPayments ? String(activeArrangement.numberOfPayments) : '';
  const arrangementStart = activeArrangement?.startDate ? new Date(activeArrangement.startDate).toLocaleDateString() : '';
  const arrangementStartIso = activeArrangement?.startDate ? new Date(activeArrangement.startDate).toISOString().split('T')[0] : '';
  const arrangementNextPayment = activeArrangement?.nextPaymentDate ? new Date(activeArrangement.nextPaymentDate).toLocaleDateString() : '';
  const arrangementPaymentFrequency = activeArrangement?.frequency || '';
  
  // Calculate balance divisions for flexible payment plans
  const balanceDiv2 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents / 2)) : '';
  const balanceDiv3 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents / 3)) : '';
  const balanceDiv4 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents / 4)) : '';
  const balanceDiv6 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents / 6)) : '';
  const balanceDiv12 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents / 12)) : '';

  const replacements: Record<string, string> = {
    // Primary camelCase format (matching email templates exactly)
    firstName,
    lastName,
    fullName,
    consumerName: fullName,
    name: fullName,
    email: consumerEmail,
    consumerEmail,
    phone: consumerPhone,
    consumerPhone,
    phoneNumber: consumerPhone,
    consumerId: consumer?.id || '',
    accountId: account?.id || '',
    accountNumber: account?.accountNumber || '',
    fileNumber,
    creditor: account?.creditor || '',
    balance: formattedBalance,
    balanceCents: balanceCents !== undefined && balanceCents !== null ? String(balanceCents) : '',
    dueDate: formattedDueDate,
    dueDateIso,
    address: consumerAddress,
    consumerAddress,
    city: consumerCity,
    consumerCity,
    state: consumerState,
    consumerState,
    zip: consumerZip,
    zipCode: consumerZip,
    fullAddress,
    consumerPortalLink: consumerPortalUrl,
    portalLink: consumerPortalUrl,
    // App download variables
    universalAppLink,
    androidDownload: ANDROID_APP_URL,
    iosDownload: IOS_APP_URL || '#',
    // Legacy support for old variable name
    appDownloadLink: ANDROID_APP_URL,
    agencyName: tenant?.name || '',
    agencyEmail: (tenant as any)?.contactEmail || tenant?.email || '',
    agencyPhone: (tenant as any)?.contactPhone || tenant?.phoneNumber || tenant?.twilioPhoneNumber || '',
    privacyNotice: (tenant as any)?.privacyPolicy || '',
    termsOfService: (tenant as any)?.termsOfService || '',
    ssnLast4,
    originalCreditor,
    chargeOffDate,
    status: accountStatus,
    accountStatus,
    lastPaymentDate,
    clientReference,
    signature: '______________',
    SIGNATURE_LINE: '______________',
    dateSigned: todaysDate,
    initial: '____',
    initials: '____',
    INITIAL: '____',
    INITIALS: '____',
    // Legal disclaimers
    fdcpaDisclaimer: FDCPA_DISCLAIMER,
    validationNotice: VALIDATION_NOTICE,
    esignConsent: ESIGN_CONSENT,
    unsubscribeLink: unsubscribeUrl,
    unsubscribeUrl,
    unsubscribeButton: unsubscribeButtonHtml,
    todaysDate: todaysDate,
    dateOfBirth: dob,
    dob,
    originalBalance: formattedBalance,
    currentYear,
    currentMonth,
    currentDatetime,
    tomorrowDate,
    nextWeekDate,
    nextMonthDate,
    settlementPaymentCounts: Array.isArray(settlementPaymentCounts) ? settlementPaymentCounts.join(', ') : '',
    settlementPaymentFrequency,
    minimumMonthlyPayment,
    settlementOfferExpiresDate,
    'balance50%': balance50,
    'balance60%': balance60,
    'balance70%': balance70,
    'balance80%': balance80,
    'balance90%': balance90,
    'balance100%': balance100,
    'balance/2': balanceDiv2,
    'balance/3': balanceDiv3,
    'balance/4': balanceDiv4,
    'balance/6': balanceDiv6,
    'balance/12': balanceDiv12,
    monthlyPayment,
    numberOfPayments,
    arrangementStart,
    arrangementStartIso,
    arrangementNextPayment,
    arrangementPaymentFrequency,
    
    // Snake_case aliases for all variables to match email/SMS templates
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    consumer_name: fullName,
    consumer_email: consumerEmail,
    consumer_phone: consumerPhone,
    phone_number: consumerPhone,
    consumer_id: consumer?.id || '',
    account_id: account?.id || '',
    account_number: account?.accountNumber || '',
    file_number: fileNumber,
    balance_cents: balanceCents !== undefined && balanceCents !== null ? String(balanceCents) : '',
    due_date: formattedDueDate,
    due_date_iso: dueDateIso,
    consumer_address: consumerAddress,
    consumer_city: consumerCity,
    consumer_state: consumerState,
    consumer_zip: consumerZip,
    zip_code: consumerZip,
    full_address: fullAddress,
    consumer_portal_link: consumerPortalUrl,
    portal_link: consumerPortalUrl,
    // App download variables (snake_case aliases)
    universal_app_link: universalAppLink,
    android_download: ANDROID_APP_URL,
    ios_download: IOS_APP_URL || '#',
    app_download_link: ANDROID_APP_URL, // Legacy
    agency_name: tenant?.name || '',
    agency_email: (tenant as any)?.contactEmail || tenant?.email || '',
    agency_phone: (tenant as any)?.contactPhone || tenant?.phoneNumber || tenant?.twilioPhoneNumber || '',
    privacy_notice: (tenant as any)?.privacyPolicy || '',
    terms_of_service: (tenant as any)?.termsOfService || '',
    ssn_last_4: ssnLast4,
    original_creditor: originalCreditor,
    charge_off_date: chargeOffDate,
    account_status: accountStatus,
    last_payment_date: lastPaymentDate,
    client_reference: clientReference,
    date_signed: todaysDate,
    // Legal disclaimers (snake_case aliases)
    fdcpa_disclaimer: FDCPA_DISCLAIMER,
    validation_notice: VALIDATION_NOTICE,
    esign_consent: ESIGN_CONSENT,
    unsubscribe_link: unsubscribeUrl,
    unsubscribe_url: unsubscribeUrl,
    unsubscribe_button: unsubscribeButtonHtml,
    todays_date: todaysDate,
    today_date: todaysDate,
    date_of_birth: dob,
    original_balance: formattedBalance,
    current_year: currentYear,
    current_month: currentMonth,
    current_datetime: currentDatetime,
    tomorrow_date: tomorrowDate,
    next_week_date: nextWeekDate,
    next_month_date: nextMonthDate,
    settlement_payment_counts: Array.isArray(settlementPaymentCounts) ? settlementPaymentCounts.join(', ') : '',
    settlement_payment_frequency: settlementPaymentFrequency,
    minimum_monthly_payment: minimumMonthlyPayment,
    settlement_offer_expires_date: settlementOfferExpiresDate,
    monthly_payment: monthlyPayment,
    number_of_payments: numberOfPayments,
    arrangement_start: arrangementStart,
    arrangement_start_iso: arrangementStartIso,
    arrangement_next_payment: arrangementNextPayment,
    arrangement_payment_frequency: arrangementPaymentFrequency,
  };

  let processedTemplate = template;

  Object.entries(replacements).forEach(([key, value]) => {
    processedTemplate = applyTemplateReplacement(processedTemplate, key, value || '');
  });

  // Replace company logo
  const logoUrl = (tenant as any)?.customBranding?.logoUrl;
  if (logoUrl) {
    const logoHtml = `<div style="text-align: center; margin-bottom: 30px;"><img src="${logoUrl}" alt="Company Logo" style="max-width: 200px; height: auto;" /></div>`;
    processedTemplate = processedTemplate.replace(/\{\{COMPANY_LOGO\}\}/g, logoHtml);
  } else {
    processedTemplate = processedTemplate.replace(/\{\{COMPANY_LOGO\}\}/g, '');
  }

  const additionalSources = [consumer?.additionalData, account?.additionalData];
  additionalSources.forEach(source => {
    if (source && typeof source === 'object') {
      Object.entries(source).forEach(([key, value]) => {
        const stringValue =
          value === null || value === undefined
            ? ''
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value);
        processedTemplate = applyTemplateReplacement(processedTemplate, key, stringValue);
      });
    }
  });

  return processedTemplate;
}

  async function notifyTenantAdmins(options: {
    tenantId: string;
    subject: string;
    eventType: 'consumer_registered' | 'payment_made' | 'arrangement_setup';
    consumer?: { firstName: string; lastName: string; email: string };
    amount?: number;
    arrangementType?: string;
  }) {
    try {
      // Get tenant information
      const tenant = await storage.getTenant(options.tenantId);
      if (!tenant) {
        console.error(`[Notification] Tenant ${options.tenantId} not found`);
        return;
      }

      // Get all admin users for this tenant
      const platformUsers = await storage.getPlatformUsersByTenant(options.tenantId);
      
      if (platformUsers.length === 0) {
        console.log(`[Notification] No admin users found for tenant ${tenant.name}`);
        return;
      }

      // Build email body based on event type
      let emailBody = '';
      const consumerName = options.consumer ? `${options.consumer.firstName} ${options.consumer.lastName}` : 'A consumer';
      
      if (options.eventType === 'consumer_registered') {
        emailBody = `
          <h2>New Consumer Registration</h2>
          <p>${consumerName} has successfully registered for the consumer portal.</p>
          <p><strong>Email:</strong> ${options.consumer?.email || 'N/A'}</p>
          <p>They can now view their accounts and make payments through the portal.</p>
        `;
      } else if (options.eventType === 'payment_made') {
        const amountFormatted = options.amount ? `$${(options.amount / 100).toFixed(2)}` : 'N/A';
        emailBody = `
          <h2>New Payment Received</h2>
          <p>${consumerName} has made a payment.</p>
          <p><strong>Amount:</strong> ${amountFormatted}</p>
          <p><strong>Consumer Email:</strong> ${options.consumer?.email || 'N/A'}</p>
        `;
      } else if (options.eventType === 'arrangement_setup') {
        emailBody = `
          <h2>New Payment Arrangement</h2>
          <p>${consumerName} has set up a payment arrangement.</p>
          <p><strong>Arrangement Type:</strong> ${options.arrangementType || 'N/A'}</p>
          <p><strong>Consumer Email:</strong> ${options.consumer?.email || 'N/A'}</p>
        `;
      }

      // Add footer
      emailBody += `
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">
          This is an automated notification from ${tenant.name}.<br>
          To manage your notification preferences, please log in to your admin dashboard.
        </p>
      `;

      // Send email to all admins
      const emailPromises = platformUsers.map(async (platformUser) => {
        const userEmail = platformUser.userDetails?.email;
        if (!userEmail) {
          console.warn(`[Notification] Platform user has no email address`);
          return;
        }

        try {
          await emailService.sendEmail({
            to: userEmail,
            from: `notifications@chainsoftwaregroup.com`,
            subject: `[${tenant.name}] ${options.subject}`,
            html: emailBody,
            tenantId: options.tenantId,
          });
        } catch (error) {
          console.error(`[Notification] Failed to send ${options.eventType} notification to admin`, error);
        }
      });

      const results = await Promise.allSettled(emailPromises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      console.log(`[Notification] Sent ${options.eventType} notifications to ${successCount}/${platformUsers.length} admins`);
    } catch (error) {
      console.error('[Notification] Error sending tenant admin notifications:', error);
    }
  }

  /**
   * Validates if a payment is allowed based on account status
   * Checks SMAX statusname (if SMAX enabled) or Chain account status against tenant's blocked list
   * Uses case-insensitive comparison to prevent mismatches
   */
  async function validatePaymentStatus(
    account: Account,
    tenantId: string,
    tenantSettings: any
  ): Promise<{ isBlocked: boolean; status: string | null; reason: string }> {
    const blockedStatuses = tenantSettings?.blockedAccountStatuses || [];
    
    // If no blocked statuses configured, allow payment
    if (blockedStatuses.length === 0) {
      return { isBlocked: false, status: null, reason: '' };
    }
    
    let currentStatus: string | null = null;
    
    // Check SMAX for current status if enabled and account has filenumber
    if (tenantSettings?.smaxEnabled && account.filenumber) {
      try {
        const smaxAccount = await smaxService.getAccount(tenantId, account.filenumber);
        if (smaxAccount?.statusname) {
          currentStatus = smaxAccount.statusname;
          console.log(`📋 Using SMAX status for payment validation: "${currentStatus}"`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to get SMAX status for ${account.filenumber}, falling back to Chain status`, error);
      }
    }
    
    // Fall back to Chain's account status if SMAX status not available
    if (!currentStatus && account.status) {
      currentStatus = account.status;
      console.log(`📋 Using Chain account status for payment validation: "${currentStatus}"`);
    }
    
    // Check if status is in blocked list (case-insensitive comparison)
    if (currentStatus) {
      const currentStatusLower = currentStatus.toLowerCase();
      const blockedStatusesLower = blockedStatuses.map((s: string) => s.toLowerCase());
      
      if (blockedStatusesLower.includes(currentStatusLower)) {
        return {
          isBlocked: true,
          status: currentStatus,
          reason: `Account status "${currentStatus}" is blocked by tenant settings`
        };
      }
    }
    
    return { isBlocked: false, status: currentStatus, reason: '' };
  }

  async function resolveEmailCampaignAudience(
    tenantId: string,
    targetGroup: string,
    folderSelection?: string | string[] | null,
  ) {
    const consumersList = await storage.getConsumersByTenant(tenantId);
    const accountsData = await storage.getAccountsByTenant(tenantId);
    const tenantSettings = await storage.getTenantSettings(tenantId);

    // Filter out accounts with blocked statuses (configured per tenant) to prevent communications
    // Use case-insensitive comparison
    const blockedStatuses = tenantSettings?.blockedAccountStatuses || [];
    const blockedStatusesLower = blockedStatuses.map((s: string) => s.toLowerCase());
    const activeAccountsData = accountsData.filter(acc => 
      !acc.status || !blockedStatusesLower.includes(acc.status.toLowerCase())
    );

    const folderIds = Array.isArray(folderSelection)
      ? folderSelection.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : typeof folderSelection === 'string' && folderSelection.trim().length > 0
        ? [folderSelection]
        : [];

    console.log(
      `🎯 Resolving campaign audience - targetGroup: "${targetGroup}", folders: ${folderIds.length > 0 ? folderIds.join(', ') : 'none'}`,
    );
    console.log(`📊 Total consumers in tenant: ${consumersList.length}, Total accounts: ${accountsData.length}, Active accounts: ${activeAccountsData.length}`);

    let targetedConsumers = consumersList;

    if (targetGroup === 'folder' && folderIds.length > 0) {
      const folderSet = new Set(folderIds);

      console.log(`🔍 Filtering for folders: ${folderIds.join(', ')}`);
      const accountsInFolder = activeAccountsData.filter(acc => {
        const accountFolderMatch = acc.folderId && folderSet.has(acc.folderId);
        const consumerFolderMatch = acc.consumer?.folderId && folderSet.has(acc.consumer.folderId);
        return accountFolderMatch || consumerFolderMatch;
      });
      console.log(`📁 Found ${accountsInFolder.length} active accounts matching selected folders`);

      if (accountsInFolder.length === 0) {
        const totalAccountsWithFolder = activeAccountsData.filter(acc => acc.folderId).length;
        const uniqueFolderCount = new Set(activeAccountsData.map(a => a.folderId).filter(Boolean)).size;
        console.warn(`⚠️ WARNING: No active accounts found with this folder ID`);
        console.log(`   Total active accounts with folders: ${totalAccountsWithFolder}, Unique folders: ${uniqueFolderCount}`);
        console.log(`   Sample folder IDs from active accounts:`, Array.from(new Set(activeAccountsData.slice(0, 5).map(a => a.folderId).filter(Boolean))));
      }

      const consumerIds = new Set(
        accountsInFolder.map(acc => acc.consumerId)
      );
      targetedConsumers = consumersList.filter(c => consumerIds.has(c.id) || (c.folderId && folderSet.has(c.folderId)));
      console.log(
        `✅ FOLDER FILTER RESULT: Started with ${consumersList.length} total consumers, filtered to ${targetedConsumers.length} consumers in folders [${folderIds.join(', ')}]`,
      );
      console.log(`   Targeted consumer emails (first 3):`, targetedConsumers.slice(0, 3).map(c => c.email));
    } else if (targetGroup === 'with-balance') {
      const consumerIds = new Set(
        activeAccountsData
          .filter(acc => (acc.balanceCents || 0) > 0)
          .map(acc => acc.consumerId)
      );
      targetedConsumers = consumersList.filter(c => consumerIds.has(c.id));
    } else if (targetGroup === 'decline') {
      targetedConsumers = consumersList.filter(c =>
        (c.additionalData && (c.additionalData as any).status === 'decline') ||
        (c.additionalData && (c.additionalData as any).folder === 'decline')
      );
    } else if (targetGroup === 'recent-upload') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      targetedConsumers = consumersList.filter(c =>
        c.createdAt && new Date(c.createdAt) > yesterday
      );
    }

    // Filter consumers to only those with at least one active account
    const consumersWithActiveAccounts = new Set(
      activeAccountsData.map(acc => acc.consumerId)
    );
    targetedConsumers = targetedConsumers.filter(c => consumersWithActiveAccounts.has(c.id));
    
    console.log(`🔒 Account status filter: ${targetedConsumers.length} consumers have active accounts (excluded inactive/recalled/closed)`);

    return { targetedConsumers, accountsData: activeAccountsData };
  }

  async function buildTenantEmailContext(tenantId: string) {
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const tenantSettings = await storage.getTenantSettings(tenantId);
    const tenantBranding = {
      ...(((tenant as any)?.brand) || {}),
      ...(((tenantSettings?.customBranding as any) || {})),
    };

    const tenantWithSettings = {
      ...tenant,
      contactEmail: tenantSettings?.contactEmail,
      contactPhone: tenantSettings?.contactPhone,
      consumerPortalSettings: tenantSettings?.consumerPortalSettings,
      customBranding: tenantBranding,
    };

    return { tenant, tenantSettings, tenantBranding, tenantWithSettings };
  }

  async function getEmailTemplateOrThrow(tenantId: string, templateId: string) {
    const templates = await storage.getEmailTemplatesByTenant(tenantId);
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      throw new Error('Email template not found');
    }

    return template;
  }

  function buildCampaignEmails(options: {
    campaignId: string;
    tenantId: string;
    template: any;
    targetedConsumers: Consumer[];
    accountsData: Account[];
    tenantWithSettings: any;
    tenantBranding: any;
    tenant: Tenant;
  }) {
    const {
      campaignId,
      tenantId,
      template,
      targetedConsumers,
      accountsData,
      tenantWithSettings,
      tenantBranding,
      tenant,
    } = options;

    // Deduplicate by email address, keeping the most recent consumer record for each email
    const emailToConsumerMap = new Map<string, Consumer>();
    
    for (const consumer of targetedConsumers) {
      if (!consumer.email) continue;
      
      const normalizedEmail = consumer.email.toLowerCase().trim();
      const existing = emailToConsumerMap.get(normalizedEmail);
      
      if (!existing) {
        emailToConsumerMap.set(normalizedEmail, consumer);
        continue;
      }
      
      // Determine which consumer to keep based on available timestamps or ID
      let shouldReplace = false;
      
      if (consumer.createdAt && existing.createdAt) {
        // Both have createdAt - use the most recent
        shouldReplace = new Date(consumer.createdAt) > new Date(existing.createdAt);
      } else if (consumer.createdAt && !existing.createdAt) {
        // Consumer has timestamp, existing doesn't - prefer consumer
        shouldReplace = true;
      } else if (!consumer.createdAt && existing.createdAt) {
        // Existing has timestamp, consumer doesn't - keep existing
        shouldReplace = false;
      } else {
        // Neither has createdAt - use consumer ID as tiebreaker (higher ID = more recent)
        // This handles legacy records without timestamps
        shouldReplace = consumer.id > existing.id;
      }
      
      if (shouldReplace) {
        emailToConsumerMap.set(normalizedEmail, consumer);
      }
    }

    const emails: any[] = [];
    const uniqueConsumers = Array.from(emailToConsumerMap.values());
    
    for (const consumer of uniqueConsumers) {
      const consumerAccount = accountsData.find(acc => acc.consumerId === consumer.id);

      const processedSubject = replaceTemplateVariables(
        template.subject || '',
        consumer,
        consumerAccount,
        tenantWithSettings
      );
      const processedHtml = replaceTemplateVariables(
        template.html || '',
        consumer,
        consumerAccount,
        tenantWithSettings
      );

      const finalizedHtml =
        finalizeEmailHtml(processedHtml, {
          logoUrl: tenantBranding?.logoUrl,
          agencyName: tenant?.name,
          primaryColor: tenantBranding?.primaryColor || tenantBranding?.buttonColor,
          accentColor: tenantBranding?.secondaryColor || tenantBranding?.linkColor,
          backgroundColor:
            tenantBranding?.emailBackgroundColor || tenantBranding?.backgroundColor,
          contentBackgroundColor:
            tenantBranding?.emailContentBackgroundColor ||
            tenantBranding?.cardBackgroundColor ||
            tenantBranding?.panelBackgroundColor,
          textColor: tenantBranding?.emailTextColor || tenantBranding?.textColor,
          previewText: tenantBranding?.emailPreheader || tenantBranding?.preheaderText,
        }) || processedHtml;

      const metadata: Record<string, string> = {
        campaignId,
        tenantId,
        consumerId: consumer.id,
        templateId: template.id,
      };

      if (consumerAccount?.accountNumber) {
        metadata.accountNumber = consumerAccount.accountNumber;
        metadata.filenumber = consumerAccount.filenumber || '';
      }

      emails.push({
        to: consumer.email,
        from: `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>`,
        subject: processedSubject,
        html: finalizedHtml,
        tag: `campaign-${campaignId}`,
        metadata,
        tenantId,
      });
    }

    return emails;
  }

function normalizeDateString(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.toString().trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashOrDashMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (slashOrDashMatch) {
    let [, month, day, year] = slashOrDashMatch;
    if (year.length === 2) {
      const currentCentury = Math.floor(new Date().getFullYear() / 100) * 100;
      year = String(currentCentury + Number(year));
    }
    return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 8) {
    const yearFirstCandidate = `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4, 6)}-${digitsOnly.slice(6, 8)}`;
    if (!Number.isNaN(new Date(yearFirstCandidate).getTime())) {
      return yearFirstCandidate;
    }

    const monthFirstCandidate = `${digitsOnly.slice(4, 8)}-${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2, 4)}`;
    if (!Number.isNaN(new Date(monthFirstCandidate).getTime())) {
      return monthFirstCandidate;
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function normalizeLowercase(value?: string | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function datesMatch(provided: string, stored?: string | null): boolean {
  if (!provided) return false;

  const normalizedProvided = normalizeDateString(provided);
  const normalizedStored = normalizeDateString(stored);

  if (normalizedProvided && normalizedStored) {
    return normalizedProvided === normalizedStored;
  }

  const digitsProvided = provided.replace(/\D/g, '');
  const digitsStored = (stored ?? '').replace(/\D/g, '');
  return Boolean(digitsProvided && digitsStored && digitsProvided === digitsStored);
}

// Helper function to get tenantId from JWT auth
async function getTenantId(req: any, storage: IStorage): Promise<string | null> {
  // JWT auth - tenantId is directly in the token
  if (req.user?.tenantId) {
    return req.user.tenantId;
  }

  // Replit / session-based auth - look up the platform user to determine tenant
  const potentialAuthIds = new Set<string>();

  const maybeAuthId = req.user?.id ?? req.user?.authId ?? req.user?.userId;
  if (maybeAuthId) {
    potentialAuthIds.add(String(maybeAuthId));
  }

  const sessionAuthId = req.session?.user?.id ?? req.session?.authId;
  if (sessionAuthId) {
    potentialAuthIds.add(String(sessionAuthId));
  }

  for (const authId of Array.from(potentialAuthIds)) {
    const platformUser = await storage.getPlatformUserWithTenant(authId);
    if (platformUser?.tenantId) {
      req.user = {
        ...(req.user ?? {}),
        tenantId: platformUser.tenantId,
        tenantSlug: req.user?.tenantSlug ?? platformUser.tenant?.slug,
      };
      return platformUser.tenantId;
    }
  }

  const sessionTenantId = req.session?.tenantId;
  if (sessionTenantId) {
    return sessionTenantId;
  }

  return null;
}

// Chain Software Group contact information (hardcoded)
const CHAIN_CONTACT_EMAIL = 'support@chainsoftwaregroup.com';
const CHAIN_CONTACT_PHONE = '(716) 534-3086';

// Add-on pricing constants
const ADDON_PRICES: Record<string, { name: string; monthly: number }> = {
  'document_signing': { name: 'Document Signing', monthly: 40 },
  'ai_auto_response': { name: 'AI Auto-Response', monthly: 50 },
  'mobile_app_branding': { name: 'Mobile App Branding', monthly: 50 },
};

// Build complete agreement variables from tenant and subscription data
async function buildAgreementVariables(
  tenant: any,
  tenantId: string,
  storage: IStorage,
  baseUrl: string
): Promise<Record<string, any>> {
  // Get tenant settings and subscription
  const settings = await storage.getTenantSettings(tenantId);
  const subscription = await storage.getSubscriptionByTenant(tenantId);
  
  // Get business type and determine module info
  const businessType = settings?.businessType || 'call_center';
  const moduleName = getModuleNameForBusinessType(businessType as any);
  const moduleDescription = getModuleDescriptionForBusinessType(businessType as any);
  
  // Get enabled add-ons and calculate add-on costs
  const enabledAddons = settings?.enabledAddons || [];
  let addonsTotal = 0;
  const addonsList: string[] = [];
  
  for (const addonKey of enabledAddons) {
    const addon = ADDON_PRICES[addonKey];
    if (addon) {
      addonsTotal += addon.monthly;
      addonsList.push(`${addon.name} ($${addon.monthly}/mo)`);
    }
  }
  
  // Get actual plan details from subscription or fallback to defaults
  let basePriceCents: number;
  let monthlyPrice: string;
  let pricingTier: string;
  let billingStartDate: string;
  
  if (subscription && subscription.planId) {
    // Use actual subscription pricing if available, otherwise use plan defaults
    const plan = getPlanPricingForTenant(businessType as any, subscription.planId as MessagingPlanId);
    
    // Prefer subscription.priceCents for negotiated/custom rates, fallback to plan price
    if (subscription.priceCents !== undefined && subscription.priceCents !== null) {
      basePriceCents = subscription.priceCents;
    } else {
      basePriceCents = plan.price * 100;
    }
    pricingTier = plan.name;
    
    // Use real billing dates from subscription (currentPeriodStart is the start of current billing cycle)
    if (subscription.currentPeriodStart) {
      billingStartDate = new Date(subscription.currentPeriodStart).toLocaleDateString();
    } else if (subscription.createdAt) {
      billingStartDate = new Date(subscription.createdAt).toLocaleDateString();
    } else {
      billingStartDate = new Date().toLocaleDateString();
    }
  } else {
    // No subscription - use Launch plan defaults
    const launchPlan = getPlanPricingForTenant(businessType as any, 'launch');
    basePriceCents = launchPlan.price * 100;
    pricingTier = launchPlan.name;
    billingStartDate = new Date().toLocaleDateString();
  }
  
  // Calculate total monthly amount (base plan + add-ons)
  const totalMonthlyCents = basePriceCents + (addonsTotal * 100);
  monthlyPrice = formatCurrency(basePriceCents);
  const totalMonthlyPrice = formatCurrency(totalMonthlyCents);
  
  return {
    companyName: tenant.name,
    moduleName,
    moduleDescription,
    pricingTier,
    monthlyPrice,
    totalMonthlyPrice,
    addonsTotal: addonsTotal > 0 ? `$${addonsTotal}` : '$0',
    addonsList: addonsList.length > 0 ? addonsList.join(', ') : 'None',
    enabledAddons: enabledAddons,
    billingStartDate,
    contactEmail: CHAIN_CONTACT_EMAIL,
    contactPhone: CHAIN_CONTACT_PHONE,
    sentBy: 'Platform Administrator',
    sentAt: new Date().toISOString(),
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Request/Response logger - log all incoming requests and outgoing responses for debugging
  app.use((req, res, next) => {
    const startTime = Date.now();
    console.log(`📨 [REQUEST] ${req.method} ${req.path}`, {
      origin: req.headers.origin || 'none',
      contentType: req.headers['content-type'] || 'none',
      userAgent: req.headers['user-agent']?.substring(0, 50) || 'none'
    });
    
    // Capture the original send and json methods to log responses
    const originalSend = res.send;
    const originalJson = res.json;
    const originalSendFile = res.sendFile;
    
    res.send = function(data) {
      const duration = Date.now() - startTime;
      console.log(`📤 [RESPONSE] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`, {
        contentType: res.getHeader('content-type') || 'unknown',
        bodyType: typeof data,
        bodyPreview: typeof data === 'string' ? data.substring(0, 100) : 'not-string'
      });
      return originalSend.call(this, data);
    };
    
    res.json = function(data) {
      const duration = Date.now() - startTime;
      console.log(`📤 [RESPONSE-JSON] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`, {
        dataKeys: data && typeof data === 'object' ? Object.keys(data).join(', ') : 'not-object'
      });
      return originalJson.call(this, data);
    };
    
    res.sendFile = function(filePath: string, ...args: any[]) {
      const duration = Date.now() - startTime;
      console.log(`📤 [RESPONSE-FILE] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`, {
        file: filePath.includes('index.html') ? 'index.html' : 'other'
      });
      return originalSendFile.apply(this, [filePath, ...args] as any);
    };
    
    next();
  });
  
  // CORS middleware - Allow web, mobile apps, and Vercel frontend to connect
  app.use((req, res, next) => {
    const allowedOrigins = new Set([
      'http://localhost:5173',
      'http://localhost:5000',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:3000',
      ...(process.env.REPLIT_DOMAINS ? [process.env.REPLIT_DOMAINS] : []),
      ...getKnownDomainOrigins(),
    ]);

    const origin = req.headers.origin as string | undefined;

    // Helper to check if origin ends with a trusted domain
    const isTrustedDomain = (origin: string, domain: string): boolean => {
      try {
        const url = new URL(origin);
        return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
      } catch {
        return false;
      }
    };

    // Helper to check if origin is from localhost or development IP
    const isLocalhost = (origin: string): boolean => {
      try {
        const url = new URL(origin);
        const hostname = url.hostname;
        return hostname === 'localhost' || 
               hostname === '127.0.0.1' ||
               hostname === '10.0.2.2' ||  // Android emulator
               hostname === '10.0.3.2' ||  // Android emulator alternative
               hostname === '[::1]';        // IPv6 localhost
      } catch {
        return false;
      }
    };

    // Check if origin is allowed
    const isAllowed = !origin ||
        allowedOrigins.has(origin) ||
        isTrustedDomain(origin, 'vercel.app') ||
        isTrustedDomain(origin, 'vercel.sh') ||
        isTrustedDomain(origin, 'replit.dev') ||
        isTrustedDomain(origin, 'replit.app') ||
        isTrustedDomain(origin, 'repl.co') ||
        isTrustedDomain(origin, 'railway.app') || // Railway production
        origin.startsWith('capacitor://') || // Capacitor mobile apps (old scheme)
        origin.startsWith('ionic://') || // Ionic mobile apps (old scheme)
        origin.startsWith('https://localhost') || // Capacitor mobile apps (https scheme)
        origin.startsWith('http://localhost') || // Capacitor mobile apps (http scheme fallback)
        isLocalhost(origin) || // Localhost and emulator IPs
        isOriginOnKnownDomain(origin);
    
    if (isAllowed) {
      res.header('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    
    next();
  });

  // Body parser middleware with increased limits for CSV imports
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Subdomain detection middleware
  app.use(subdomainMiddleware);

  // Explicit SPA fallback for the platform admin entry point to avoid 404s
  app.get(
    ["/admin", "/admin/", "/admin/*", "/Admin", "/Admin/", "/Admin/*"],
    (req, res, next) => {
    // Let Vite handle this route in development so HMR continues to work
    if (process.env.NODE_ENV !== "production") {
      return next();
    }

    const candidateIndexFiles = [
      path.resolve(process.cwd(), "dist/public/index.html"),
      path.resolve(process.cwd(), "client/index.html"),
    ];

    const spaIndex = candidateIndexFiles.find(filePath => fs.existsSync(filePath));

    if (!spaIndex) {
      return next();
    }

    res.sendFile(spaIndex, sendError => {
      if (sendError) {
        next(sendError);
      }
    });
  });

  // Health check endpoint (no auth required)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Debug endpoint for webhook configuration
  app.get('/api/debug/webhook-config', (req, res) => {
    const baseUrl = process.env.APP_URL 
      || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
      || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : null)
      || 'http://localhost:5000';
    
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    
    res.json({
      webhookUrls: {
        twilioDelivery: `${cleanBaseUrl}/api/webhooks/twilio`,
        twilioInbound: `${cleanBaseUrl}/api/webhooks/twilio-inbound`,
        postmarkTracking: `${cleanBaseUrl}/api/webhooks/postmark`,
        postmarkInbound: `${cleanBaseUrl}/api/webhooks/postmark-inbound`,
      },
      environment: {
        APP_URL: process.env.APP_URL || 'NOT SET',
        RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || 'NOT SET',
        REPLIT_DOMAINS: process.env.REPLIT_DOMAINS || 'NOT SET',
        NODE_ENV: process.env.NODE_ENV || 'NOT SET',
      },
      usedBaseUrl: baseUrl,
      cleanedBaseUrl: cleanBaseUrl,
      instructions: 'Use these URLs to configure your Twilio and Postmark webhooks'
    });
  });

  // Note: Logos are now served from Cloudflare R2 via public URLs

  // Auth routes - Updated to support both JWT and Replit auth
  app.get('/api/auth/user', authenticateUser, async (req: any, res) => {
    try {
      const userInfo = await getCurrentUser(req);
      res.json(userInfo);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Consumer routes - Protected by consumer JWT authentication
  app.get('/api/consumer/accounts/:email', authenticateConsumer, requirePortalAccess, async (req: any, res) => {
    try {
      // Get consumer info from JWT token (already verified by authenticateConsumer)
      const { email: tokenEmail, tenantId, tenantSlug } = req.consumer;
      const requestedEmail = req.params.email;

      const normalizedTokenEmail = (tokenEmail || '').trim().toLowerCase();
      const normalizedRequestedEmail = (requestedEmail || '').trim().toLowerCase();

      // Ensure consumer can only access their own data (case-insensitive)
      if (!normalizedTokenEmail || normalizedTokenEmail !== normalizedRequestedEmail) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get consumer record
      const tenantIdentifier = tenantId ?? tenantSlug;
      if (!tenantIdentifier) {
        return res.status(400).json({ message: "Tenant information is missing" });
      }

      const consumer = await storage.getConsumerByEmailAndTenant(tokenEmail, tenantIdentifier);
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      // Get consumer's accounts
      let accountsList = await storage.getAccountsByConsumer(consumer.id);

      // Get tenant info for display
      const tenant = tenantId
        ? await storage.getTenant(tenantId)
        : tenantSlug
          ? await storage.getTenantBySlug(tenantSlug)
          : undefined;

      // Get tenant settings
      const tenantSettings = tenant?.id ? await storage.getTenantSettings(tenant.id) : undefined;

      // SMAX SYNC: If SMAX is enabled, pull fresh account data from SMAX
      if (tenant?.id && tenantSettings?.smaxEnabled) {
        console.log('🔄 SMAX enabled - syncing account data for consumer portal access');
        
        for (const account of accountsList) {
          // Prefer filenumber, fall back to accountNumber for legacy data
          const smaxIdentifier = account.filenumber || account.accountNumber;
          if (smaxIdentifier) {
            try {
              // Get fresh account data from SMAX
              console.log(`🔍 Calling SMAX getAccount for: ${smaxIdentifier}`);
              const smaxAccount = await smaxService.getAccount(tenant.id, smaxIdentifier);
              
              if (smaxAccount) {
                // Handle array response - SMAX may return [account] or account
                const accountData = Array.isArray(smaxAccount) ? smaxAccount[0] : smaxAccount;
                
                if (!accountData) {
                  console.log(`⚠️ SMAX returned empty array for ${smaxIdentifier}`);
                  continue;
                }
                
                console.log(`✅ SMAX getAccount returned data for ${smaxIdentifier}, currentbalance: ${accountData.currentbalance}`);
                
                // Extract currentbalance directly (case-insensitive lookup as fallback)
                let rawBalance = accountData.currentbalance || accountData.CurrentBalance || accountData.balance || accountData.Balance || '0';
                
                // If still not found, do case-insensitive search
                if (rawBalance === '0') {
                  for (const [key, value] of Object.entries(accountData)) {
                    const lowerKey = key.toLowerCase();
                    if ((lowerKey === 'currentbalance' || lowerKey === 'balance' || 
                         lowerKey === 'balancedue' || lowerKey === 'totalbalance') && 
                        value !== null && value !== undefined) {
                      rawBalance = String(value);
                      console.log(`💰 Found SMAX balance field "${key}" = "${value}"`);
                      break;
                    }
                  }
                } else {
                  console.log(`💰 SMAX currentbalance = "${rawBalance}"`);
                }
                
                const balanceFloat = parseFloat(rawBalance.toString().replace(/[^0-9.-]/g, ''));
                
                // Guard against NaN/invalid values - skip balance update if SMAX returns garbage
                if (!Number.isFinite(balanceFloat)) {
                  console.warn('⚠️ SMAX returned invalid balance, skipping balance sync:', {
                    smaxIdentifier,
                    rawSmaxBalance: rawBalance,
                    parsedValue: balanceFloat
                  });
                  // Still update status if available
                  if (accountData.statusname && accountData.statusname !== account.status) {
                    await storage.updateAccount(account.id, {
                      status: accountData.statusname,
                    });
                    account.status = accountData.statusname;
                    console.log('✅ Account status updated from SMAX (balance skipped):', {
                      smaxIdentifier,
                      newStatus: accountData.statusname
                    });
                  }
                  continue;
                }
                
                // Normalize to cents - SMAX may return dollars or cents
                // Clamp to non-negative to prevent invalid negative balances
                const balanceCents = Math.max(0, rawBalance.toString().includes('.')
                  ? Math.round(balanceFloat * 100)
                  : Math.round(balanceFloat));
                
                console.log('💰 SMAX Balance Sync:', {
                  smaxIdentifier,
                  rawSmaxBalance: rawBalance,
                  normalizedCents: balanceCents,
                  currentLocalBalance: account.balanceCents,
                  smaxStatus: accountData.statusname || accountData.status
                });
                
                // Update local account with SMAX data if different
                if (balanceCents !== account.balanceCents || 
                    (accountData.statusname && accountData.statusname !== account.status)) {
                  await storage.updateAccount(account.id, {
                    balanceCents: balanceCents,
                    status: accountData.statusname || account.status,
                  });
                  
                  // Update the account in the list for immediate response
                  account.balanceCents = balanceCents;
                  if (accountData.statusname) {
                    account.status = accountData.statusname;
                  }
                  
                  console.log('✅ Account updated from SMAX:', {
                    smaxIdentifier,
                    newBalance: balanceCents,
                    newStatus: accountData.statusname
                  });
                }
              } else {
                console.warn(`⚠️ SMAX getAccount returned null for ${smaxIdentifier} - /getaccount endpoint may not exist or returned no data`);
              }
            } catch (smaxError) {
              console.error('⚠️ SMAX sync error for:', smaxIdentifier, smaxError);
              // Non-blocking - continue with local data if SMAX fails
            }
          }
        }
      }

      // Get payment schedules for this consumer
      const paymentSchedules = tenant?.id ? await storage.getPaymentSchedulesByConsumer(consumer.id, tenant.id) : [];
      const activeSchedules = paymentSchedules.filter(s => s.status === 'active');

      res.json({
        consumer: {
          id: consumer.id,
          firstName: consumer.firstName,
          lastName: consumer.lastName,
          email: consumer.email,
          phone: consumer.phone,
          address: consumer.address,
          city: consumer.city,
          state: consumer.state,
          zipCode: consumer.zipCode
        },
        accounts: accountsList,
        tenant: {
          id: tenant?.id,
          name: tenant?.name,
          slug: tenant?.slug,
          businessType: tenant?.businessType || 'call_center'
        },
        tenantSettings: tenantSettings,
        paymentSchedules: activeSchedules
      });
    } catch (error) {
      console.error("Error fetching consumer accounts:", error);
      res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

  // Consumer profile update endpoint
  app.patch('/api/consumer/profile', authenticateConsumer, async (req: any, res) => {
    try {
      const { email: tokenEmail, tenantId, tenantSlug } = req.consumer;
      const { firstName, lastName, phone, address, city, state, zipCode } = req.body;

      // Get tenant identifier
      const tenantIdentifier = tenantId ?? tenantSlug;
      if (!tenantIdentifier) {
        return res.status(400).json({ message: "Tenant information is missing" });
      }

      // Get consumer record
      const consumer = await storage.getConsumerByEmailAndTenant(tokenEmail, tenantIdentifier);
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      // Update consumer profile
      const updatedConsumer = await storage.updateConsumer(consumer.id, {
        firstName: firstName || consumer.firstName,
        lastName: lastName || consumer.lastName,
        phone: phone || consumer.phone,
        address: address || consumer.address,
        city: city || consumer.city,
        state: state || consumer.state,
        zipCode: zipCode || consumer.zipCode,
      });

      res.json({
        message: "Profile updated successfully",
        consumer: {
          id: updatedConsumer.id,
          firstName: updatedConsumer.firstName,
          lastName: updatedConsumer.lastName,
          email: updatedConsumer.email,
          phone: updatedConsumer.phone,
          address: updatedConsumer.address,
          city: updatedConsumer.city,
          state: updatedConsumer.state,
          zipCode: updatedConsumer.zipCode,
        }
      });
    } catch (error) {
      console.error("Error updating consumer profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Tenant routes
  app.get('/api/tenants/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenant = await storage.getTenant(req.params.id);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      res.json(tenant);
    } catch (error) {
      console.error("Error fetching tenant:", error);
      res.status(500).json({ message: "Failed to fetch tenant" });
    }
  });

  // Get tenant by slug (for subdomain detection)
  app.get('/api/tenants/by-slug/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);
      
      if (!tenant) {
        return res.status(404).json({ message: "Agency not found" });
      }
      
      res.json(tenant);
    } catch (error) {
      console.error("Error fetching tenant by slug:", error);
      res.status(500).json({ message: "Failed to fetch agency" });
    }
  });

  app.post('/api/folders', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { name, color, description } = req.body;

      if (!name || !color) {
        return res.status(400).json({ message: "Name and color are required" });
      }

      // Get current folder count for sort order
      const existingFolders = await storage.getFoldersByTenant(tenantId);
      const sortOrder = existingFolders.length;

      const folder = await storage.createFolder({
        tenantId: tenantId,
        name,
        color,
        description: description || null,
        isDefault: false,
        sortOrder,
      });

      res.status(201).json(folder);
    } catch (error) {
      console.error("Error creating folder:", error);
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  const deleteFolderHandler = async (
    req: any,
    res: Response,
    folderIdOverride?: unknown,
  ) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const folderId =
        typeof folderIdOverride === "string" && folderIdOverride.length > 0
          ? folderIdOverride
          : req.params.id;

      if (!folderId || typeof folderId !== "string") {
        return res.status(400).json({ message: "Folder ID is required" });
      }

      await storage.deleteFolder(folderId, tenantId);

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting folder:", error);
      res.status(500).json({ message: "Failed to delete folder" });
    }
  };

  app.delete('/api/folders/:id', authenticateUser, (req, res) =>
    deleteFolderHandler(req, res),
  );
  app.post('/api/folders/:id/delete', authenticateUser, (req, res) =>
    deleteFolderHandler(req, res),
  );
  app.post('/api/folders/delete', authenticateUser, (req, res) =>
    deleteFolderHandler(req, res, req.body?.folderId),
  );

  // Consumer routes
  app.get('/api/consumers', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const consumers = await listConsumers(db, tenantId);
      res.json(consumers);
    } catch (error) {
      console.error("Error fetching consumers:", error);
      res.status(500).json({ message: "Failed to fetch consumers" });
    }
  });

  // Consumer lookup by email
  app.get('/api/consumers/lookup', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { email } = req.query;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Email parameter is required" });
      }

      // Look up consumer by email within this tenant
      const consumer = await storage.getConsumerByEmailAndTenant(email, tenantId);
      
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found", found: false });
      }

      // Get consumer's accounts
      const accounts = await storage.getAccountsByConsumer(consumer.id);

      res.json({
        found: true,
        consumer: {
          id: consumer.id,
          firstName: consumer.firstName,
          lastName: consumer.lastName,
          email: consumer.email,
          phone: consumer.phone,
        },
        accounts: accounts.map(account => ({
          id: account.id,
          accountNumber: account.accountNumber,
          creditor: account.creditor,
          balanceCents: account.balanceCents,
          dueDate: account.dueDate,
          status: account.status,
        })),
      });
    } catch (error) {
      console.error("Error looking up consumer:", error);
      res.status(500).json({ message: "Failed to lookup consumer" });
    }
  });

  // Consumer lookup by phone
  app.get('/api/consumers/lookup-by-phone', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { phone } = req.query;
      
      if (!phone || typeof phone !== 'string') {
        return res.status(400).json({ message: "Phone parameter is required" });
      }

      // Normalize phone number (strip non-digits)
      const normalizedPhone = phone.replace(/\D/g, '');

      // Look up consumer by phone within this tenant
      const consumer = await storage.getConsumerByPhoneAndTenant(normalizedPhone, tenantId);
      
      if (!consumer) {
        return res.json({ message: "Consumer not found", found: false });
      }

      // Get consumer's accounts
      const accounts = await storage.getAccountsByConsumer(consumer.id);

      res.json({
        found: true,
        consumer: {
          id: consumer.id,
          firstName: consumer.firstName,
          lastName: consumer.lastName,
          email: consumer.email,
          phone: consumer.phone,
          smsOptedOut: consumer.smsOptedOut,
        },
        accounts: accounts.map(account => ({
          id: account.id,
          accountNumber: account.accountNumber,
          creditor: account.creditor,
          balanceCents: account.balanceCents,
          dueDate: account.dueDate,
          status: account.status,
        })),
      });
    } catch (error) {
      console.error("Error looking up consumer by phone:", error);
      res.status(500).json({ message: "Failed to lookup consumer" });
    }
  });

  // Global search endpoint
  app.get('/api/search', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { q } = req.query;
      
      if (!q || typeof q !== 'string' || q.length < 2) {
        return res.json({ consumers: [], accounts: [] });
      }

      const searchPattern = `%${q}%`;

      // Get tenant settings to check if SMAX is enabled
      const tenantSettingsData = await storage.getTenantSettings(tenantId);
      const smaxEnabled = tenantSettingsData?.smaxEnabled ?? false;

      // Database-level search for consumers (LIMIT 5 for performance)
      // Search by name, email, phone, and any field in additionalData
      const matchingConsumers = await db
        .select({
          id: consumers.id,
          firstName: consumers.firstName,
          lastName: consumers.lastName,
          email: consumers.email,
          phone: consumers.phone,
        })
        .from(consumers)
        .where(
          and(
            eq(consumers.tenantId, tenantId),
            sql`(
              LOWER(${consumers.firstName}) LIKE LOWER(${searchPattern}) OR
              LOWER(${consumers.lastName}) LIKE LOWER(${searchPattern}) OR
              LOWER(${consumers.email}) LIKE LOWER(${searchPattern}) OR
              LOWER(COALESCE(${consumers.phone}, '')) LIKE LOWER(${searchPattern}) OR
              LOWER(COALESCE(${consumers.additionalData}::text, '')) LIKE LOWER(${searchPattern})
            )`
          )
        )
        .limit(5);

      // Database-level search for accounts with consumer names (LIMIT 5 for performance)
      // Search by account number, creditor, filenumber, consumer name, phone, and email
      const matchingAccountsRaw = await db
        .select({
          id: accountsTable.id,
          accountNumber: accountsTable.accountNumber,
          creditor: accountsTable.creditor,
          balanceCents: accountsTable.balanceCents,
          originalBalanceCents: accountsTable.originalBalanceCents,
          filenumber: accountsTable.filenumber,
          firstName: consumers.firstName,
          lastName: consumers.lastName,
          consumerPhone: consumers.phone,
          consumerEmail: consumers.email,
        })
        .from(accountsTable)
        .leftJoin(consumers, eq(accountsTable.consumerId, consumers.id))
        .where(
          and(
            eq(accountsTable.tenantId, tenantId),
            sql`(
              LOWER(${accountsTable.accountNumber}) LIKE LOWER(${searchPattern}) OR
              LOWER(${accountsTable.creditor}) LIKE LOWER(${searchPattern}) OR
              LOWER(COALESCE(${accountsTable.filenumber}, '')) LIKE LOWER(${searchPattern}) OR
              LOWER(${consumers.firstName}) LIKE LOWER(${searchPattern}) OR
              LOWER(${consumers.lastName}) LIKE LOWER(${searchPattern}) OR
              LOWER(COALESCE(${consumers.phone}, '')) LIKE LOWER(${searchPattern}) OR
              LOWER(COALESCE(${consumers.email}, '')) LIKE LOWER(${searchPattern})
            )`
          )
        )
        .limit(5);

      // Process accounts with balance recalculation
      const matchingAccounts = await Promise.all(matchingAccountsRaw.map(async (row) => {
        let calculatedBalance = row.balanceCents || 0;
        
        // If balance is 0 and we have original balance, try to calculate actual balance
        if (calculatedBalance === 0 && row.originalBalanceCents) {
          let shouldCalculateFromPayments = false;
          
          if (smaxEnabled && row.filenumber) {
            // SMAX is enabled and account has filenumber - try to fetch from SMAX
            try {
              const smaxAccount = await smaxService.getAccount(tenantId, row.filenumber);
              if (smaxAccount) {
                // Try common SMAX balance field names (case-insensitive)
                const balanceField = Object.keys(smaxAccount).find(key => 
                  key.toLowerCase() === 'currentbalance' || 
                  key.toLowerCase() === 'balancedue' || 
                  key.toLowerCase() === 'balance'
                );
                if (balanceField && smaxAccount[balanceField] !== null && smaxAccount[balanceField] !== undefined) {
                  // SMAX returns balance in dollars, convert to cents
                  const smaxBalanceDollars = parseFloat(smaxAccount[balanceField]) || 0;
                  calculatedBalance = Math.round(smaxBalanceDollars * 100);
                } else {
                  // SMAX returned account but no balance field - fall back
                  shouldCalculateFromPayments = true;
                }
              } else {
                // SMAX returned no data - fall back to payment calculation
                shouldCalculateFromPayments = true;
              }
            } catch (smaxError) {
              // SMAX failed - fall back to payment calculation
              console.log(`SMAX balance fetch failed for ${row.filenumber}, falling back to payment calculation`);
              shouldCalculateFromPayments = true;
            }
          } else {
            // SMAX not enabled OR account has no filenumber - use payment calculation
            shouldCalculateFromPayments = true;
          }
          
          if (shouldCalculateFromPayments) {
            // Calculate from original balance minus completed/approved payments
            const paymentSumResult = await db
              .select({
                totalPaid: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
              })
              .from(payments)
              .where(
                and(
                  eq(payments.accountId, row.id),
                  sql`${payments.status} IN ('completed', 'approved')`
                )
              );
            
            const totalPaid = Number(paymentSumResult[0]?.totalPaid || 0);
            calculatedBalance = Math.max(0, (row.originalBalanceCents || 0) - totalPaid);
          }
        }
        
        return {
          id: row.id,
          accountNumber: row.accountNumber,
          creditor: row.creditor,
          balanceCents: calculatedBalance,
          firstName: row.firstName || '',
          lastName: row.lastName || '',
        };
      }));

      res.json({
        consumers: matchingConsumers,
        accounts: matchingAccounts,
      });
    } catch (error) {
      console.error("Error performing search:", error);
      res.status(500).json({ message: "Failed to perform search" });
    }
  });

  app.patch('/api/consumers/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      try {
        const updatedConsumer = await updateConsumer(db, tenantId, id, req.body);
        res.json(updatedConsumer);
      } catch (error) {
        if (error instanceof ConsumerNotFoundError) {
          return res.status(404).json({ message: error.message });
        }
        throw error;
      }
    } catch (error) {
      console.error("Error updating consumer:", error);
      res.status(500).json({ message: "Failed to update consumer" });
    }
  });

  app.delete('/api/consumers/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      try {
        const result = await deleteConsumers(db, tenantId, [id]);
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof ConsumerNotFoundError) {
          return res.status(404).json({ message: error.message });
        }
        throw error;
      }
    } catch (error) {
      console.error("Error deleting consumer:", error);
      res.status(500).json({ message: "Failed to delete consumer" });
    }
  });

  // Get consumer conversation (emails + SMS)
  app.get('/api/consumers/:id/conversation', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const conversation = await storage.getConsumerConversation(req.params.id, tenantId);
      
      // Combine and sort all messages chronologically
      const allMessages = [
        ...conversation.emails.sent.map((m: any) => ({ ...m, channel: 'email', direction: 'outbound' })),
        ...conversation.emails.received.map((m: any) => ({ ...m, channel: 'email', direction: 'inbound' })),
        ...conversation.sms.sent.map((m: any) => ({ ...m, channel: 'sms', direction: 'outbound' })),
        ...conversation.sms.received.map((m: any) => ({ ...m, channel: 'sms', direction: 'inbound' })),
      ].sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeB - timeA; // Most recent first
      });

      res.json({
        messages: allMessages,
        summary: {
          totalEmails: conversation.emails.sent.length + conversation.emails.received.length,
          totalSms: conversation.sms.sent.length + conversation.sms.received.length,
          emailsSent: conversation.emails.sent.length,
          emailsReceived: conversation.emails.received.length,
          smsSent: conversation.sms.sent.length,
          smsReceived: conversation.sms.received.length,
        },
      });
    } catch (error) {
      console.error("Error fetching consumer conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // Account routes
  app.get('/api/accounts', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const accounts = await storage.getAccountsByTenant(tenantId);
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

  // Folder routes
  app.get('/api/folders', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Ensure default folders exist for this tenant
      await storage.ensureDefaultFolders(tenantId);
      
      const folders = await storage.getFoldersByTenant(tenantId);
      res.json(folders);
    } catch (error) {
      console.error("Error fetching folders:", error);
      res.status(500).json({ message: "Failed to fetch folders" });
    }
  });

  app.get('/api/folders/:folderId/accounts', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const accounts = await storage.getAccountsByFolder(req.params.folderId);
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching accounts by folder:", error);
      res.status(500).json({ message: "Failed to fetch accounts by folder" });
    }
  });

  // Stats routes
  app.get('/api/stats', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const stats = await storage.getTenantStats(tenantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // CSV Import route
  app.post('/api/import/csv', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { consumers: consumersData, accounts: accountsData, folderId, clearExistingPhones } = req.body;
      
      // Basic array validation
      if (!consumersData || !Array.isArray(consumersData)) {
        return res.status(400).json({ message: "Invalid consumer data format" });
      }
      
      if (!accountsData || !Array.isArray(accountsData)) {
        return res.status(400).json({ message: "Invalid account data format" });
      }
      
      if (consumersData.length === 0) {
        return res.status(400).json({ message: "No consumer data found in CSV" });
      }
      
      if (accountsData.length === 0) {
        return res.status(400).json({ message: "No account data found in CSV" });
      }
      
      // Check if SMAX is enabled for this tenant
      const tenantSettings = await storage.getTenantSettings(tenantId);
      const smaxEnabled = tenantSettings?.smaxEnabled ?? false;
      
      // Track skipped rows
      const skippedRows: { row: number; reason: string }[] = [];
      
      // Filter consumers - skip invalid ones instead of failing
      const validConsumers = consumersData.filter((consumer: any, index: number) => {
        // Check for valid email
        if (!isValidEmail(consumer.email)) {
          skippedRows.push({ row: index + 2, reason: `Invalid or missing email: "${consumer.email || ''}"` });
          return false;
        }
        // Check for required name fields
        if (!consumer.firstName || !consumer.firstName.trim()) {
          skippedRows.push({ row: index + 2, reason: `Missing first name for ${consumer.email}` });
          return false;
        }
        if (!consumer.lastName || !consumer.lastName.trim()) {
          skippedRows.push({ row: index + 2, reason: `Missing last name for ${consumer.email}` });
          return false;
        }
        return true;
      });
      
      // Get emails of valid consumers for filtering accounts
      const validEmailsSet = new Set(validConsumers.map((c: any) => c.email.toLowerCase()));
      
      // Filter accounts - skip ones with invalid consumer emails or missing required fields
      const validAccounts = accountsData.filter((account: any, index: number) => {
        // Skip accounts for consumers that were filtered out
        if (!account.consumerEmail || !validEmailsSet.has(account.consumerEmail.toLowerCase())) {
          // Only add to skipped if it wasn't already skipped due to consumer validation
          if (account.consumerEmail && !skippedRows.some(s => s.row === index + 2)) {
            skippedRows.push({ row: index + 2, reason: `Consumer with email "${account.consumerEmail}" was skipped` });
          }
          return false;
        }
        // Check filenumber if SMAX is enabled
        if (smaxEnabled && (!account.filenumber || !account.filenumber.trim())) {
          skippedRows.push({ row: index + 2, reason: `Missing filenumber (required for SMAX)` });
          return false;
        }
        // Check creditor
        if (!account.creditor || !account.creditor.trim()) {
          skippedRows.push({ row: index + 2, reason: `Missing creditor` });
          return false;
        }
        // Check balance
        if (account.balanceCents === undefined || account.balanceCents === null || isNaN(account.balanceCents)) {
          skippedRows.push({ row: index + 2, reason: `Invalid or missing balance` });
          return false;
        }
        return true;
      });
      
      // If all rows were skipped, return an error
      if (validConsumers.length === 0) {
        return res.status(400).json({ 
          message: "No valid records to import. All rows were skipped.",
          skippedRows: skippedRows.slice(0, 10), // Show first 10 skipped rows
          totalSkipped: skippedRows.length
        });
      }
      
      console.log(`[CSV Import] Processing ${validConsumers.length} valid consumers, ${validAccounts.length} valid accounts. Skipped ${skippedRows.length} rows.`);
      
      // Get default folder if no folder is specified
      let targetFolderId = folderId;
      if (!targetFolderId) {
        await storage.ensureDefaultFolders(tenantId);
        const defaultFolder = await storage.getDefaultFolder(tenantId);
        targetFolderId = defaultFolder?.id;
      }
      
      // Find or create consumers (using filtered valid consumers)
      const createdConsumers = new Map();
      const consumerErrors: string[] = [];
      for (const consumerData of validConsumers) {
        try {
          // Normalize dateOfBirth to YYYY-MM-DD format before saving
          const normalizedDOB = consumerData.dateOfBirth 
            ? normalizeDateString(consumerData.dateOfBirth) 
            : null;
          
          const consumer = await storage.findOrCreateConsumer({
            ...consumerData,
            dateOfBirth: normalizedDOB,
            tenantId: tenantId,
            folderId: targetFolderId,
          }, { clearExistingPhones: clearExistingPhones === true });
          if (consumer.email) {
            createdConsumers.set(consumer.email.toLowerCase(), consumer);
          }
        } catch (consumerError: any) {
          console.error(`Error creating consumer ${consumerData.email}:`, consumerError);
          consumerErrors.push(`${consumerData.email}: ${consumerError.message}`);
          // Continue processing other consumers instead of failing
        }
      }

      // Create or update accounts (with deduplication, using filtered valid accounts)
      const createdAccounts = [];
      const accountErrors: string[] = [];
      for (let index = 0; index < validAccounts.length; index++) {
        const accountData = validAccounts[index];
        
        // Skip if no consumer email
        if (!accountData.consumerEmail) {
          accountErrors.push(`Row ${index + 2}: Missing consumer email`);
          continue;
        }
        
        const consumerEmailLower = accountData.consumerEmail.toLowerCase();
        const consumer = createdConsumers.get(consumerEmailLower);
        if (!consumer) {
          // Skip accounts for consumers that failed to create
          accountErrors.push(`Row ${index + 2}: Consumer not found for ${accountData.consumerEmail}`);
          continue;
        }

        try {
          const accountToCreate = {
            tenantId: tenantId,
            consumerId: consumer.id,
            folderId: targetFolderId,
            accountNumber: accountData.accountNumber || null,
            filenumber: accountData.filenumber,
            creditor: accountData.creditor,
            balanceCents: accountData.balanceCents,
            // Note: originalBalanceCents is set automatically in createAccount for new accounts only
            dueDate: accountData.dueDate || null,
            status: accountData.status || null,
            additionalData: accountData.additionalData || {},
          };
          
          console.log(`[CSV Import] Row ${index + 2}: Creating/updating account with filenumber: ${accountData.filenumber}`);
          
          // Use findOrCreateAccount to prevent duplicates
          const account = await storage.findOrCreateAccount(accountToCreate);
          
          console.log(`[CSV Import] Row ${index + 2}: Account saved with ID ${account.id}`);
          
          createdAccounts.push(account);
        } catch (accountError: any) {
          console.error(`Error creating account for ${accountData.consumerEmail}:`, accountError);
          accountErrors.push(`Row ${index + 2}: ${accountError.message}`);
          // Continue processing other accounts
        }
      }
      
      // Calculate total issues (skipped + errors)
      const totalIssues = skippedRows.length + consumerErrors.length + accountErrors.length;
      
      // Build success message with skipped info
      let message = "Import successful";
      if (totalIssues > 0) {
        message = `Import completed. ${totalIssues} row(s) had issues and were skipped.`;
      }
      
      res.json({
        message,
        consumersCreated: createdConsumers.size,
        accountsCreated: createdAccounts.length,
        skippedRows: skippedRows.length > 0 ? skippedRows.slice(0, 10) : undefined,
        totalSkipped: totalIssues > 0 ? totalIssues : undefined,
        consumerErrors: consumerErrors.length > 0 ? consumerErrors.slice(0, 5) : undefined,
        accountErrors: accountErrors.length > 0 ? accountErrors.slice(0, 5) : undefined,
      });
    } catch (error: any) {
      console.error("Error importing CSV:", error);
      const errorMessage = error.message || "Failed to import CSV data";
      res.status(500).json({ message: errorMessage });
    }
  });

  // Account management routes
  app.post('/api/accounts', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const {
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        filenumber,
        accountNumber,
        creditor,
        balanceCents,
        folderId,
        address,
        city,
        state,
        zipCode,
        dueDate,
      } = req.body;

      if (!firstName || !lastName || !email || !filenumber || !creditor || balanceCents === undefined) {
        return res.status(400).json({ message: "Missing required fields (filenumber is required for SMAX integration)" });
      }

      // Find or create consumer with date of birth for better matching
      const consumer = await storage.findOrCreateConsumer({
        tenantId: tenantId,
        firstName,
        lastName,
        email,
        phone: phone || null,
        dateOfBirth: dateOfBirth || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        folderId: folderId || null,
        isRegistered: true,  // Mark as registered when created from admin panel
        registrationDate: new Date(),
      });

      // Create account (originalBalanceCents is set automatically in createAccount)
      const account = await storage.createAccount({
        tenantId: tenantId,
        consumerId: consumer.id,
        folderId: folderId || null,
        accountNumber: accountNumber || null,
        filenumber: filenumber,
        creditor,
        balanceCents,
        status: 'active',
        additionalData: {},
        dueDate: dueDate || null,
      });

      // Trigger account_created event for sequence enrollment
      await eventService.emitSystemEvent('account_created', {
        tenantId,
        consumerId: consumer.id,
        accountId: account.id,
      });

      res.status(201).json(account);
    } catch (error) {
      console.error("Error creating account:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.patch('/api/accounts/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const account = await storage.getAccount(id);

      if (!account || account.tenantId !== tenantId) {
        return res.status(404).json({ message: "Account not found" });
      }

      const {
        firstName,
        lastName,
        email,
        phone,
        accountNumber,
        creditor,
        balanceCents,
        folderId,
        status,
        dateOfBirth,
        address,
        city,
        state,
        zipCode,
        dueDate,
      } = req.body;

      const consumerUpdates: any = {};
      if (firstName !== undefined) consumerUpdates.firstName = firstName;
      if (lastName !== undefined) consumerUpdates.lastName = lastName;
      if (email !== undefined) consumerUpdates.email = email;
      if (phone !== undefined) consumerUpdates.phone = phone;
      if (folderId !== undefined) consumerUpdates.folderId = folderId || null;
      if (dateOfBirth !== undefined) consumerUpdates.dateOfBirth = dateOfBirth || null;
      if (address !== undefined) consumerUpdates.address = address || null;
      if (city !== undefined) consumerUpdates.city = city || null;
      if (state !== undefined) consumerUpdates.state = state || null;
      if (zipCode !== undefined) consumerUpdates.zipCode = zipCode || null;

      if (Object.keys(consumerUpdates).length > 0) {
        await storage.updateConsumer(account.consumerId, consumerUpdates);
      }

      const accountUpdates: any = {};
      if (accountNumber !== undefined) accountUpdates.accountNumber = accountNumber || null;
      if (creditor !== undefined) accountUpdates.creditor = creditor;
      if (balanceCents !== undefined && !Number.isNaN(Number(balanceCents))) {
        accountUpdates.balanceCents = Number(balanceCents);
      }
      if (folderId !== undefined) accountUpdates.folderId = folderId || null;
      if (status !== undefined) accountUpdates.status = status;
      if (dueDate !== undefined) {
        accountUpdates.dueDate = dueDate || null;
      }

      // Auto-change status and set returnedAt when account is moved to "Returned" folder
      if (folderId !== undefined && folderId) {
        const returnedFolder = await storage.getReturnedFolder(tenantId);
        if (returnedFolder && folderId === returnedFolder.id) {
          // Only auto-change if status isn't already terminal (recalled/closed)
          const currentStatus = account.status?.toLowerCase();
          if (currentStatus !== 'recalled' && currentStatus !== 'closed') {
            accountUpdates.status = "recalled";
            console.log(`🔄 Auto-changing account ${id} status to "recalled" (moved to Returned folder)`);
          }
          // Set returnedAt timestamp for auto-deletion after 7 days
          if (!account.returnedAt) {
            accountUpdates.returnedAt = new Date();
            console.log(`📅 Setting returnedAt timestamp for account ${id} (will be auto-deleted in 7 days)`);
          }
        }
      }
      
      // Clear returnedAt if account is moved out of Returned folder
      if (folderId !== undefined) {
        const returnedFolder = await storage.getReturnedFolder(tenantId);
        if (returnedFolder && folderId !== returnedFolder.id && account.returnedAt) {
          accountUpdates.returnedAt = null;
          console.log(`🔄 Clearing returnedAt timestamp for account ${id} (moved out of Returned folder)`);
        }
      }

      if (Object.keys(accountUpdates).length > 0) {
        await storage.updateAccount(id, accountUpdates);
      }

      const updatedAccount = await storage.getAccount(id);
      res.json(updatedAccount);
    } catch (error) {
      console.error("Error updating account:", error);
      res.status(500).json({ message: "Failed to update account" });
    }
  });

  app.delete('/api/accounts/bulk-delete', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { ids } = req.body ?? {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Account IDs array is required" });
      }

      const deletedCount = await storage.bulkDeleteAccounts(ids, tenantId);

      if (deletedCount === 0) {
        return res.status(404).json({ message: "No accounts found to delete" });
      }

      return res.status(200).json({
        success: true,
        message: `${deletedCount} accounts deleted successfully`,
        deletedCount,
      });
    } catch (error) {
      console.error("Error bulk deleting accounts:", error);
      return res.status(500).json({ message: "Failed to delete accounts" });
    }
  });

  // Cleanup expired returned accounts (called by cron job daily at 2 AM ET)
  app.post('/api/accounts/cleanup-returned', async (req: any, res) => {
    try {
      console.log('🗑️ [CLEANUP] Starting expired returned accounts cleanup...');
      
      const result = await storage.deleteExpiredReturnedAccounts();
      
      if (result.deletedCount > 0) {
        console.log(`🗑️ [CLEANUP] Deleted ${result.deletedCount} expired returned accounts:`);
        result.deletedAccounts.forEach(acc => {
          console.log(`   - Account ${acc.accountNumber || acc.id} (Tenant: ${acc.tenantId})`);
        });
      } else {
        console.log('🗑️ [CLEANUP] No expired returned accounts found');
      }
      
      return res.status(200).json({
        success: true,
        message: `Cleanup complete: ${result.deletedCount} accounts deleted`,
        deletedCount: result.deletedCount,
        deletedAccounts: result.deletedAccounts,
      });
    } catch (error) {
      console.error("Error cleaning up returned accounts:", error);
      return res.status(500).json({ message: "Failed to cleanup returned accounts" });
    }
  });

  // Cleanup old tracking data (called by cron job daily at 3 AM ET)
  // Deletes sms_tracking, email_tracking, automation_executions older than 2 days
  // Also cleans up expired sessions
  app.post('/api/system/cleanup-tracking', async (req: any, res) => {
    try {
      console.log('🗑️ [CLEANUP] Starting old tracking data cleanup...');
      
      const result = await storage.cleanupOldTrackingData(2); // 2 days
      
      console.log(`🗑️ [CLEANUP] Cleanup complete:`);
      console.log(`   - SMS tracking deleted: ${result.smsTrackingDeleted}`);
      console.log(`   - Email tracking deleted: ${result.emailTrackingDeleted}`);
      console.log(`   - Automation executions deleted: ${result.automationExecutionsDeleted}`);
      console.log(`   - Expired sessions deleted: ${result.sessionsDeleted}`);
      
      return res.status(200).json({
        success: true,
        message: 'Tracking data cleanup complete',
        ...result,
      });
    } catch (error) {
      console.error("Error cleaning up tracking data:", error);
      return res.status(500).json({ message: "Failed to cleanup tracking data" });
    }
  });

  app.patch('/api/accounts/bulk-update-status', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { ids, status } = req.body ?? {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Account IDs array is required" });
      }
      
      if (!status || !['active', 'inactive', 'recalled', 'closed'].includes(status)) {
        return res.status(400).json({ message: "Valid status is required (active, inactive, recalled, or closed)" });
      }

      // Get all accounts for this tenant
      const allAccounts = await storage.getAccountsByTenant(tenantId);
      const accountsToUpdate = allAccounts.filter(acc => ids.includes(acc.id));
      
      if (accountsToUpdate.length === 0) {
        return res.status(404).json({ message: "No accounts found to update" });
      }

      // Update each account's status
      let updatedCount = 0;
      for (const account of accountsToUpdate) {
        await storage.updateAccount(account.id, { status });
        updatedCount++;
      }

      console.log(`📝 Bulk status update: ${updatedCount} accounts set to "${status}" by tenant ${tenantId}`);

      return res.status(200).json({
        success: true,
        message: `${updatedCount} accounts updated to status: ${status}`,
        updatedCount,
      });
    } catch (error) {
      console.error("Error bulk updating account status:", error);
      return res.status(500).json({ message: "Failed to update account status" });
    }
  });

  app.delete('/api/accounts/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const accountId = req.params.id;
      await storage.deleteAccount(accountId, tenantId);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Email template routes
  app.get('/api/email-templates', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const templates = await storage.getEmailTemplatesByTenant(tenantId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching email templates:", error);
      res.status(500).json({ message: "Failed to fetch email templates" });
    }
  });

  app.post('/api/email-templates', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { name, subject, html, designType } = req.body;
      
      if (!name || !subject || !html) {
        return res.status(400).json({ message: "Name, subject, and HTML content are required" });
      }

      const template = await storage.createEmailTemplate({
        tenantId: tenantId,
        name,
        subject,
        html,
        designType: designType || 'custom',
        status: 'draft',
      });
      
      res.json(template);
    } catch (error) {
      console.error("Error creating email template:", error);
      res.status(500).json({ message: "Failed to create email template" });
    }
  });

  app.put('/api/email-templates/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const { name, subject, html, designType } = req.body;
      
      const updates: Partial<any> = {};
      if (name !== undefined) updates.name = name;
      if (subject !== undefined) updates.subject = subject;
      if (html !== undefined) updates.html = html;
      if (designType !== undefined) updates.designType = designType;

      const updatedTemplate = await storage.updateEmailTemplate(id, tenantId, updates);
      
      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error updating email template:", error);
      res.status(500).json({ message: "Failed to update email template" });
    }
  });

  app.delete('/api/email-templates/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      await storage.deleteEmailTemplate(id, tenantId);
      
      res.json({ message: "Email template deleted successfully" });
    } catch (error) {
      console.error("Error deleting email template:", error);
      res.status(500).json({ message: "Failed to delete email template" });
    }
  });

  // Document template routes
  app.get('/api/document-templates', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const templates = await storage.getDocumentTemplatesByTenant(tenantId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching document templates:", error);
      res.status(500).json({ message: "Failed to fetch document templates" });
    }
  });

  app.get('/api/document-templates/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const template = await storage.getDocumentTemplateById(id, tenantId);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.json(template);
    } catch (error) {
      console.error("Error fetching document template:", error);
      res.status(500).json({ message: "Failed to fetch document template" });
    }
  });

  app.post('/api/document-templates', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { name, title, content, description, signaturePlacement, legalDisclaimer, consentText } = req.body;
      
      if (!name || !title || !content) {
        return res.status(400).json({ message: "Name, title, and content are required" });
      }

      const template = await storage.createDocumentTemplate({
        tenantId,
        name,
        title,
        content,
        description,
        signaturePlacement: signaturePlacement || 'bottom',
        legalDisclaimer,
        consentText: consentText || 'I agree to the terms and conditions outlined in this document.',
      });
      
      res.json(template);
    } catch (error) {
      console.error("Error creating document template:", error);
      res.status(500).json({ message: "Failed to create document template" });
    }
  });

  app.put('/api/document-templates/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const { name, title, content, description, signaturePlacement, legalDisclaimer, consentText } = req.body;
      
      const updates: Partial<any> = {};
      if (name !== undefined) updates.name = name;
      if (title !== undefined) updates.title = title;
      if (content !== undefined) updates.content = content;
      if (description !== undefined) updates.description = description;
      if (signaturePlacement !== undefined) updates.signaturePlacement = signaturePlacement;
      if (legalDisclaimer !== undefined) updates.legalDisclaimer = legalDisclaimer;
      if (consentText !== undefined) updates.consentText = consentText;

      const updatedTemplate = await storage.updateDocumentTemplate(id, tenantId, updates);
      
      if (!updatedTemplate) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error updating document template:", error);
      res.status(500).json({ message: "Failed to update document template" });
    }
  });

  app.delete('/api/document-templates/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const deleted = await storage.deleteDocumentTemplate(id, tenantId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.json({ message: "Document template deleted successfully" });
    } catch (error) {
      console.error("Error deleting document template:", error);
      res.status(500).json({ message: "Failed to delete document template" });
    }
  });

  // Send document template to consumer for signature
  app.post('/api/document-templates/:id/send', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const { consumerId, accountId, expiresInDays = 7, message } = req.body;

      if (!consumerId) {
        return res.status(400).json({ message: "Consumer ID is required" });
      }

      // Get the template
      const template = await storage.getDocumentTemplateById(id, tenantId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Get consumer data
      const consumer = await storage.getConsumer(consumerId);
      if (!consumer || consumer.tenantId !== tenantId) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      // Get account data if provided
      let account = null;
      if (accountId) {
        account = await storage.getAccount(accountId);
        if (!account || account.consumerId !== consumerId || account.tenantId !== tenantId) {
          return res.status(400).json({ message: "Invalid account for this consumer" });
        }
      }

      // Get tenant data for variable replacement
      const tenant = await storage.getTenant(tenantId);
      const settings = await storage.getTenantSettings(tenantId);

      // Safe diagnostic logging (no PII)
      console.log('📄 Document Template Processing:');
      console.log('- Template name:', template.name);
      console.log('- Has consumer data:', !!consumer);
      console.log('- Has account data:', !!account);
      console.log('- Template content length:', template.content?.length || 0);
      
      // Show sample of template content (first 300 chars) to see variable format
      if (template.content) {
        console.log('- Template preview:', template.content.substring(0, 300).replace(/\s+/g, ' '));
      }

      // Replace variables in template content using existing shared function
      const processedContent = replaceTemplateVariables(template.content, consumer, account, { ...tenant, ...settings }, undefined);
      const processedTitle = replaceTemplateVariables(template.title, consumer, account, { ...tenant, ...settings }, undefined);
      
      // Check if any replacement happened
      const replacementOccurred = processedContent !== template.content;
      console.log('- Variable replacement occurred:', replacementOccurred);
      if (replacementOccurred) {
        console.log('- Processed content preview:', processedContent.substring(0, 300).replace(/\s+/g, ' '));
      } else {
        console.log('⚠️ WARNING: No variables were replaced! Template might not contain valid variable placeholders.');
      }

      // Create a document record (HTML content stored as data URL)
      const htmlContent = `data:text/html;charset=utf-8,${encodeURIComponent(processedContent)}`;
      const document = await storage.createDocument({
        tenantId,
        accountId: accountId || null,
        title: processedTitle,
        description: template.description || `Generated from template: ${template.name}`,
        fileName: `${processedTitle}.html`,
        fileUrl: htmlContent,
        fileSize: processedContent.length,
        mimeType: 'text/html',
        isPublic: false,
      });

      // Create signature request
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const signatureRequest = await storage.createSignatureRequest({
        tenantId,
        consumerId,
        accountId: accountId || null,
        documentId: document.id,
        title: processedTitle,
        description: message || null,
        status: 'pending',
        expiresAt,
        consentText: template.consentText,
      });

      // Send email notification
      const customBranding = settings?.customBranding as any;
      const consumerPortalSettings = settings?.consumerPortalSettings;
      
      console.log(`🔍 Generating sign URL - Tenant: ${tenant?.slug}, BaseURL: ${process.env.REPLIT_DOMAINS}`);
      console.log(`🔍 Consumer Portal Settings:`, consumerPortalSettings);
      
      const portalUrl = resolveConsumerPortalUrl({
        tenantSlug: tenant?.slug,
        consumerPortalSettings,
        baseUrl: process.env.REPLIT_DOMAINS,
      });
      
      console.log(`🔍 Portal URL (with /consumer-login): ${portalUrl}`);
      
      // Remove /consumer-login suffix and add /sign path
      const basePortalUrl = portalUrl.replace(/\/consumer-login$/, '');
      const signUrl = `${basePortalUrl}/sign/${signatureRequest.id}`;
      
      console.log(`✅ Final sign URL: ${signUrl}`);
      
      // Use safe name handling
      const consumerFirstName = consumer.firstName || 'there';
      const companyName = customBranding?.companyName || 'Our Company';
      
      try {
        console.log(`📧 Sending signature request email to ${consumer.email} for request ${signatureRequest.id}`);
        await emailService.sendEmail({
          to: consumer.email!,
          subject: `Document Signature Request - ${processedTitle}`,
          html: `
            <h2>Document Signature Request</h2>
            <p>Hi ${consumerFirstName},</p>
            <p>You have a document that requires your signature.</p>
            <p><strong>Document:</strong> ${processedTitle}</p>
            ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
            <p><strong>Expires:</strong> ${expiresAt.toLocaleDateString()}</p>
            <p><a href="${signUrl}" style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Sign Document</a></p>
            <p>Or copy this link: ${signUrl}</p>
            <p>Best regards,<br/>${companyName}</p>
          `,
          tenantId,
        });
        console.log(`✅ Email sent successfully to ${consumer.email}`);
      } catch (emailError) {
        console.error(`❌ Failed to send email to ${consumer.email}:`, emailError);
        // Continue anyway - signature request was created, just email failed
      }

      res.json({ 
        message: "Signature request sent successfully",
        signatureRequest 
      });
    } catch (error) {
      console.error("Error sending document template:", error);
      res.status(500).json({ message: "Failed to send document template" });
    }
  });

  // Email campaign routes
  app.get('/api/email-campaigns', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const campaigns = await storage.getEmailCampaignsByTenant(tenantId);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching email campaigns:", error);
      res.status(500).json({ message: "Failed to fetch email campaigns" });
    }
  });

  app.post('/api/email-campaigns', authenticateUser, requireEmailService, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { name, templateId, targetGroup, folderId, targetFolderIds } = req.body;

      const folderIds = Array.isArray(targetFolderIds) && targetFolderIds.length > 0
        ? targetFolderIds
        : folderId
          ? [folderId]
          : [];

      console.log(
        `📧 Creating campaign - name: "${name}", targetGroup: "${targetGroup}", folders: ${folderIds.length > 0 ? folderIds.join(', ') : 'none'}`,
      );

      if (!name || !templateId || !targetGroup) {
        return res.status(400).json({ message: "Name, template ID, and target group are required" });
      }

      const { targetedConsumers } = await resolveEmailCampaignAudience(tenantId, targetGroup, folderIds);

      let template;
      try {
        template = await getEmailTemplateOrThrow(tenantId, templateId);
      } catch (error) {
        return res.status(404).json({ message: "Email template not found" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const campaign = await storage.createEmailCampaign({
        tenantId: tenantId,
        name,
        templateId,
        targetGroup,
        folderId: folderIds[0] || null,
        totalRecipients: targetedConsumers.length,
        status: 'pending_approval',
      });

      console.log(`📧 Email campaign "${campaign.name}" created with ${targetedConsumers.length} targeted recipients. Awaiting approval to send.`);

      res.json({
        ...campaign,
        totalRecipients: targetedConsumers.length,
        templateName: template.name,
        message: 'Campaign created and awaiting approval',
      });
    } catch (error) {
      console.error("Error creating email campaign:", error);
      res.status(500).json({ message: "Failed to create email campaign" });
    }
  });

  app.post('/api/email-campaigns/:id/approve', authenticateUser, requireEmailService, async (req: any, res) => {
    let campaign: any;
    let targetedConsumers: Consumer[] = [];
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      campaign = await storage.getEmailCampaignById(id, tenantId);

      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      console.log(
        `🚀 Approving campaign "${campaign.name}" - targetGroup: "${campaign.targetGroup}", folderId: "${campaign.folderId || 'none'}"`,
      );

      const normalizedStatus = (campaign.status || '').toLowerCase();
      if (!['pending', 'pending_approval'].includes(normalizedStatus)) {
        return res.status(400).json({ message: "Campaign is not awaiting approval" });
      }

      let template;
      try {
        template = await getEmailTemplateOrThrow(tenantId, campaign.templateId);
      } catch (error) {
        return res.status(404).json({ message: "Email template not found" });
      }

      let tenantContext;
      try {
        tenantContext = await buildTenantEmailContext(tenantId);
      } catch (contextError) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const audience = await resolveEmailCampaignAudience(
        tenantId,
        campaign.targetGroup,
        campaign.folderId ? [campaign.folderId] : [],
      );
      targetedConsumers = audience.targetedConsumers;
      const { accountsData } = audience;

      const processedEmails = buildCampaignEmails({
        campaignId: campaign.id,
        tenantId,
        template,
        targetedConsumers,
        accountsData,
        tenantWithSettings: tenantContext.tenantWithSettings,
        tenantBranding: tenantContext.tenantBranding,
        tenant: tenantContext.tenant,
      });

      await storage.updateEmailCampaign(campaign.id, {
        status: 'sending',
        totalRecipients: targetedConsumers.length,
        totalSent: 0,
        totalErrors: 0,
        completedAt: null,
      });

      console.log(`✅ Email campaign "${campaign.name}" approved. Sending ${processedEmails.length} emails via Postmark...`);

      let emailResults = { successful: 0, failed: 0, results: [] as any[] };
      if (processedEmails.length > 0) {
        emailResults = await emailService.sendBulkEmails(processedEmails);
      }

      const updatedCampaign = await storage.updateEmailCampaign(campaign.id, {
        status: 'completed',
        totalSent: emailResults.successful,
        totalErrors: emailResults.failed,
        totalRecipients: processedEmails.length,
        completedAt: new Date(),
      });

      res.json({
        ...updatedCampaign,
        emailResults,
      });
    } catch (error) {
      console.error("Error approving email campaign:", error);

      if (campaign?.id) {
        try {
          await storage.updateEmailCampaign(campaign.id, {
            status: 'failed',
            totalRecipients: targetedConsumers.length || campaign.totalRecipients || 0,
            completedAt: new Date(),
          });
        } catch (updateError) {
          console.error('Error updating campaign status after failure:', updateError);
        }
      }

      res.status(500).json({ message: "Failed to approve email campaign" });
    }
  });

  app.delete('/api/email-campaigns/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const campaign = await storage.getEmailCampaignById(id, tenantId);

      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      if (!['pending', 'pending_approval'].includes((campaign.status || '').toLowerCase())) {
        return res.status(400).json({ message: "Only pending campaigns can be deleted" });
      }

      await storage.deleteEmailCampaign(id, tenantId);

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting email campaign:", error);
      res.status(500).json({ message: "Failed to delete email campaign" });
    }
  });

  // Production email sending route (for individual emails to consumers)
  app.post('/api/send-email', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { to, subject, message } = req.body;
      
      if (!to || !subject || !message) {
        return res.status(400).json({ message: "To, subject, and message are required" });
      }

      const tenant = await storage.getTenant(tenantId);
      
      // Get tenant branding for email template
      const tenantBranding = (tenant as any)?.brand || {};
      
      // Use custom sender email if configured, otherwise use branded slug email
      let fromEmail;
      if (tenant?.customSenderEmail) {
        fromEmail = `${tenant.name} <${tenant.customSenderEmail}>`;
      } else {
        fromEmail = tenant ? `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>` : 'support@chainsoftwaregroup.com';
      }

      // Build unsubscribe URL for compliance
      const baseUrl = ensureBaseUrl();
      const sanitizedBaseUrl = baseUrl ? baseUrl.replace(/^https?:\/\//, '') : '';
      const baseProtocol = baseUrl && baseUrl.startsWith('https') ? 'https://' : 'http://';
      const unsubscribeBase = sanitizedBaseUrl ? `${baseProtocol}${sanitizedBaseUrl}/unsubscribe` : '';
      const unsubscribeUrl = unsubscribeBase
        ? `${unsubscribeBase}?email=${encodeURIComponent(to)}&tenant=${encodeURIComponent(tenant.id)}`
        : '';
      
      // Build message with compliance footer
      const unsubscribeFooter = unsubscribeUrl
        ? `<hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
           <p style="color: #999; font-size: 12px; text-align: center;">
             <a href="${unsubscribeUrl}" style="color: #999;">Unsubscribe</a> from future emails
           </p>`
        : '';
      
      const messageWithFooter = `<p>${message}</p>${unsubscribeFooter}`;

      // Wrap message with professional email template using finalizeEmailHtml
      const finalizedHtml = finalizeEmailHtml(
        messageWithFooter,
        {
          logoUrl: tenantBranding?.logoUrl,
          agencyName: tenant?.name,
          primaryColor: tenantBranding?.primaryColor || tenantBranding?.buttonColor,
          accentColor: tenantBranding?.secondaryColor || tenantBranding?.linkColor,
          backgroundColor: tenantBranding?.emailBackgroundColor || tenantBranding?.backgroundColor,
          contentBackgroundColor: tenantBranding?.emailContentBackgroundColor || tenantBranding?.cardBackgroundColor || tenantBranding?.panelBackgroundColor,
          textColor: tenantBranding?.textColor,
          previewText: subject, // Use subject as preview text
        }
      );

      const result = await emailService.sendEmail({
        to,
        from: fromEmail,
        subject,
        html: finalizedHtml,
        tag: 'individual-email',
        metadata: {
          type: 'individual',
          tenantId: tenantId,
        },
        tenantId: tenantId, // Track email usage by tenant
      });

      res.json(result);
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  });

  // Test email route (for testing only - adds test tags)
  app.post('/api/test-email', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { to, subject, message } = req.body;
      
      if (!to || !subject || !message) {
        return res.status(400).json({ message: "To, subject, and message are required" });
      }

      const tenant = await storage.getTenant(tenantId);
      
      // Use custom sender email if configured, otherwise use branded slug email
      let fromEmail;
      if (tenant?.customSenderEmail) {
        fromEmail = `${tenant.name} <${tenant.customSenderEmail}>`;
      } else {
        fromEmail = tenant ? `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>` : 'support@chainsoftwaregroup.com';
      }

      const result = await emailService.sendEmail({
        to,
        from: fromEmail,
        subject,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Test Email from ${tenant?.name || 'Chain Platform'}</h2>
          <p>${message}</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This is a test email sent from the Chain platform.
          </p>
        </div>`,
        tag: 'test-email',
        metadata: {
          type: 'test',
          tenantId: tenantId,
        },
        tenantId: tenantId, // Track email usage by tenant
      });

      res.json(result);
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({ message: "Failed to send test email" });
    }
  });

  // Email metrics route
  app.get('/api/email-metrics', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const metrics = await storage.getEmailMetricsByTenant(tenantId);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching email metrics:", error);
      res.status(500).json({ message: "Failed to fetch email metrics" });
    }
  });

  // Email usage stats route
  app.get('/api/email-usage-stats', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      // Get email stats from email_logs table
      const stats = await db
        .select({
          total: sql<number>`COUNT(*)`,
          sent: sql<number>`COUNT(CASE WHEN status = 'sent' THEN 1 END)`,
          delivered: sql<number>`COUNT(CASE WHEN status = 'delivered' THEN 1 END)`,
          opened: sql<number>`COUNT(CASE WHEN status = 'opened' THEN 1 END)`,
          bounced: sql<number>`COUNT(CASE WHEN status = 'bounced' THEN 1 END)`,
          complained: sql<number>`COUNT(CASE WHEN status = 'complained' THEN 1 END)`,
        })
        .from(emailLogs)
        .where(eq(emailLogs.tenantId, tenantId));

      res.json(stats[0] || { total: 0, sent: 0, delivered: 0, opened: 0, bounced: 0, complained: 0 });
    } catch (error) {
      console.error("Error fetching email usage stats:", error);
      res.status(500).json({ message: "Failed to fetch email usage stats" });
    }
  });

  // Email reply routes
  app.get('/api/email-replies', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const replies = await storage.getEmailRepliesByTenant(tenantId);
      res.json(replies);
    } catch (error) {
      console.error("Error fetching email replies:", error);
      res.status(500).json({ message: "Failed to fetch email replies" });
    }
  });

  app.get('/api/email-replies/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const reply = await storage.getEmailReplyById(req.params.id, tenantId);
      if (!reply) {
        return res.status(404).json({ message: "Email reply not found" });
      }
      
      res.json(reply);
    } catch (error) {
      console.error("Error fetching email reply:", error);
      res.status(500).json({ message: "Failed to fetch email reply" });
    }
  });

  app.patch('/api/email-replies/:id/read', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const reply = await storage.markEmailReplyAsRead(req.params.id, tenantId);
      res.json(reply);
    } catch (error) {
      console.error("Error marking email reply as read:", error);
      res.status(500).json({ message: "Failed to mark email reply as read" });
    }
  });

  // Delete email reply
  app.delete('/api/email-replies/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const reply = await storage.getEmailReplyById(id, tenantId);
      if (!reply) {
        return res.status(404).json({ message: "Email reply not found" });
      }

      await storage.deleteEmailReply(id, tenantId);
      res.json({ message: "Email reply deleted successfully" });
    } catch (error) {
      console.error("Error deleting email reply:", error);
      res.status(500).json({ message: "Failed to delete email reply" });
    }
  });

  // Send response to an email reply
  app.post('/api/email-replies/:id/respond', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const { subject, message } = req.body;

      if (!subject || !message) {
        return res.status(400).json({ message: "Subject and message are required" });
      }

      // Get the original email
      const originalEmail = await storage.getEmailReplyById(id, tenantId);
      if (!originalEmail) {
        return res.status(404).json({ message: "Email reply not found" });
      }

      // Get tenant info for sender email
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      // Build sender email address
      let fromEmail;
      if (tenant.customSenderEmail) {
        fromEmail = `${tenant.name} <${tenant.customSenderEmail}>`;
      } else {
        fromEmail = `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>`;
      }

      // Send the response via Postmark
      const result = await emailService.sendEmail({
        to: originalEmail.fromEmail,
        from: fromEmail,
        subject,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</div>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This is a response from ${tenant.name}.
          </p>
        </div>`,
        tag: 'email-reply-response',
        metadata: {
          type: 'reply-response',
          tenantId: tenantId,
          originalEmailId: id,
        },
        tenantId: tenantId,
        consumerId: originalEmail.consumerId || undefined, // Link reply to consumer for conversation tracking
      });

      console.log('📧 Email reply sent:', {
        to: originalEmail.fromEmail,
        subject,
        consumerId: originalEmail.consumerId,
        messageId: result.messageId,
        success: result.success
      });

      res.json({ 
        message: 'Response sent successfully',
        success: result.success
      });
    } catch (error) {
      console.error("Error sending email response:", error);
      res.status(500).json({ message: "Failed to send email response" });
    }
  });

  // SMS reply routes
  app.get('/api/sms-replies', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const replies = await storage.getSmsRepliesByTenant(tenantId);
      res.json(replies);
    } catch (error) {
      console.error("Error fetching SMS replies:", error);
      res.status(500).json({ message: "Failed to fetch SMS replies" });
    }
  });

  app.get('/api/sms-replies/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const reply = await storage.getSmsReplyById(req.params.id, tenantId);
      if (!reply) {
        return res.status(404).json({ message: "SMS reply not found" });
      }
      
      res.json(reply);
    } catch (error) {
      console.error("Error fetching SMS reply:", error);
      res.status(500).json({ message: "Failed to fetch SMS reply" });
    }
  });

  app.patch('/api/sms-replies/:id/read', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const reply = await storage.markSmsReplyAsRead(req.params.id, tenantId);
      res.json(reply);
    } catch (error) {
      console.error("Error marking SMS reply as read:", error);
      res.status(500).json({ message: "Failed to mark SMS reply as read" });
    }
  });

  // Delete SMS reply
  app.delete('/api/sms-replies/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const reply = await storage.getSmsReplyById(id, tenantId);
      if (!reply) {
        return res.status(404).json({ message: "SMS reply not found" });
      }

      await storage.deleteSmsReply(id, tenantId);
      res.json({ message: "SMS reply deleted successfully" });
    } catch (error) {
      console.error("Error deleting SMS reply:", error);
      res.status(500).json({ message: "Failed to delete SMS reply" });
    }
  });

  // Send response to an SMS reply
  app.post('/api/sms-replies/:id/respond', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }

      // Get the original SMS
      const originalSms = await storage.getSmsReplyById(id, tenantId);
      if (!originalSms) {
        return res.status(404).json({ message: "SMS reply not found" });
      }

      // Send the response via SMS
      const { smsService } = await import('./smsService');
      await smsService.sendSms(
        originalSms.fromPhone,
        message,
        tenantId,
        undefined, // campaignId
        originalSms.consumerId || undefined
      );

      res.json({ 
        message: 'Response sent successfully',
      });
    } catch (error) {
      console.error("Error sending SMS response:", error);
      res.status(500).json({ message: "Failed to send SMS response" });
    }
  });

  // SMS template routes
  app.get('/api/sms-templates', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const templates = await storage.getSmsTemplatesByTenant(tenantId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching SMS templates:", error);
      res.status(500).json({ message: "Failed to fetch SMS templates" });
    }
  });

  app.post('/api/sms-templates', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const insertSmsTemplateSchema = z.object({
        name: z.string().min(1),
        message: z.string().min(1).max(1600), // SMS length limit
        status: z.string().optional().default("draft"),
      });

      const validatedData = insertSmsTemplateSchema.parse(req.body);
      
      const newTemplate = await storage.createSmsTemplate({
        ...validatedData,
        tenantId: tenantId,
      });
      
      res.status(201).json(newTemplate);
    } catch (error) {
      console.error("Error creating SMS template:", error);
      res.status(500).json({ message: "Failed to create SMS template" });
    }
  });

  app.put('/api/sms-templates/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const { name, message } = req.body;
      
      const updates: Partial<any> = {};
      if (name !== undefined) updates.name = name;
      if (message !== undefined) updates.message = message;

      const updatedTemplate = await storage.updateSmsTemplate(id, tenantId, updates);
      
      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error updating SMS template:", error);
      res.status(500).json({ message: "Failed to update SMS template" });
    }
  });

  app.delete('/api/sms-templates/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      await storage.deleteSmsTemplate(req.params.id, tenantId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting SMS template:", error);
      res.status(500).json({ message: "Failed to delete SMS template" });
    }
  });

  // Helper function to resolve SMS campaign audience (mirrors email campaign logic)
  async function resolveSmsCampaignAudience(
    tenantId: string,
    targetGroup: string,
    folderSelection?: string | string[] | null,
  ) {
    const consumersList = await storage.getConsumersByTenant(tenantId);
    const accountsData = await storage.getAccountsByTenant(tenantId);
    const tenantSettings = await storage.getTenantSettings(tenantId);

    // Filter out accounts with blocked statuses (configured per tenant) to prevent communications
    // Use case-insensitive comparison
    const blockedStatuses = tenantSettings?.blockedAccountStatuses || [];
    const blockedStatusesLower = blockedStatuses.map((s: string) => s.toLowerCase());
    const activeAccountsData = accountsData.filter(acc => 
      !acc.status || !blockedStatusesLower.includes(acc.status.toLowerCase())
    );

    const folderIds = Array.isArray(folderSelection)
      ? folderSelection.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : typeof folderSelection === 'string' && folderSelection.trim().length > 0
        ? [folderSelection]
        : [];

    console.log(
      `📱 Resolving SMS audience - targetGroup: "${targetGroup}", folders: ${folderIds.length > 0 ? folderIds.join(', ') : 'none'}`,
    );
    console.log(`📊 Total consumers in tenant: ${consumersList.length}, Total accounts: ${accountsData.length}, Active accounts: ${activeAccountsData.length}`);

    let targetedConsumers = consumersList;

    if (targetGroup === 'folder' && folderIds.length > 0) {
      const folderSet = new Set(folderIds);

      console.log(`🔍 Filtering for folders: ${folderIds.join(', ')}`);
      const accountsInFolder = activeAccountsData.filter(acc => {
        const accountFolderMatch = acc.folderId && folderSet.has(acc.folderId);
        const consumerFolderMatch = acc.consumer?.folderId && folderSet.has(acc.consumer.folderId);
        return accountFolderMatch || consumerFolderMatch;
      });
      console.log(`📁 Found ${accountsInFolder.length} active accounts matching selected folders`);

      if (accountsInFolder.length === 0) {
        const totalAccountsWithFolder = activeAccountsData.filter(acc => acc.folderId).length;
        const uniqueFolderCount = new Set(activeAccountsData.map(a => a.folderId).filter(Boolean)).size;
        console.warn(`⚠️ WARNING: No active accounts found with this folder ID`);
        console.log(`   Total active accounts with folders: ${totalAccountsWithFolder}, Unique folders: ${uniqueFolderCount}`);
        console.log(`   Sample folder IDs from active accounts:`, Array.from(new Set(activeAccountsData.slice(0, 5).map(a => a.folderId).filter(Boolean))));
      }

      const consumerIds = new Set(
        accountsInFolder.map(acc => acc.consumerId)
      );
      targetedConsumers = consumersList.filter(c => consumerIds.has(c.id) || (c.folderId && folderSet.has(c.folderId)));
      console.log(
        `✅ FOLDER FILTER RESULT: Started with ${consumersList.length} total consumers, filtered to ${targetedConsumers.length} consumers in folders [${folderIds.join(', ')}]`,
      );
      console.log(`   Targeted consumer phones (first 3):`, targetedConsumers.slice(0, 3).map(c => c.phone));
    } else if (targetGroup === 'with-balance') {
      const consumerIds = new Set(
        activeAccountsData
          .filter(acc => (acc.balanceCents || 0) > 0)
          .map(acc => acc.consumerId)
      );
      targetedConsumers = consumersList.filter(c => consumerIds.has(c.id));
    } else if (targetGroup === 'decline') {
      targetedConsumers = consumersList.filter(c =>
        (c.additionalData && (c.additionalData as any).status === 'decline') ||
        (c.additionalData && (c.additionalData as any).folder === 'decline')
      );
    } else if (targetGroup === 'recent-upload') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      targetedConsumers = consumersList.filter(c =>
        c.createdAt && new Date(c.createdAt) > yesterday
      );
    }

    // Filter consumers to only those with at least one active account
    const consumersWithActiveAccounts = new Set(
      activeAccountsData.map(acc => acc.consumerId)
    );
    targetedConsumers = targetedConsumers.filter(c => consumersWithActiveAccounts.has(c.id));
    
    console.log(`🔒 Account status filter: ${targetedConsumers.length} consumers have active accounts (excluded inactive/recalled/closed)`);

    // SMS COMPLIANCE: Filter out consumers who have opted out of SMS (TCPA compliance)
    const beforeOptOutFilter = targetedConsumers.length;
    targetedConsumers = targetedConsumers.filter(c => !(c as any).smsOptedOut);
    const optedOutCount = beforeOptOutFilter - targetedConsumers.length;
    if (optedOutCount > 0) {
      console.log(`🛑 SMS opt-out filter: Excluded ${optedOutCount} consumers who opted out of SMS`);
    }

    // SMS COMPLIANCE: Filter out consumers with blocked phone numbers
    try {
      const blockedNumbers = await storage.getSmsBlockedNumbers(tenantId);
      if (blockedNumbers.length > 0) {
        const blockedSet = new Set(blockedNumbers.map(b => b.phoneNumber));
        const beforeBlockFilter = targetedConsumers.length;
        
        targetedConsumers = targetedConsumers.filter(c => {
          if (!c.phone) return true; // Keep consumers without phone (they'll be filtered later anyway)
          const normalizedPhone = c.phone.replace(/\D/g, '');
          // Check both full number and without country code
          const withoutCountryCode = normalizedPhone.startsWith('1') && normalizedPhone.length === 11 
            ? normalizedPhone.slice(1) 
            : normalizedPhone;
          return !blockedSet.has(normalizedPhone) && !blockedSet.has(withoutCountryCode);
        });
        
        const blockedCount = beforeBlockFilter - targetedConsumers.length;
        if (blockedCount > 0) {
          console.log(`🚫 Blocked number filter: Excluded ${blockedCount} consumers with undeliverable/blocked phone numbers`);
        }
      }
    } catch (blockedError) {
      console.error('Error checking blocked numbers (continuing without filter):', blockedError);
    }

    console.log(`✅ Final SMS audience: ${targetedConsumers.length} consumers after all compliance filters`);

    return { targetedConsumers, accountsData: activeAccountsData };
  }

  // SMS campaign routes
  app.get('/api/sms-campaigns', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const campaignsRaw = await storage.getSmsCampaignsByTenant(tenantId);
      console.log(`📋 Retrieved ${campaignsRaw.length} SMS campaigns for tenant ${tenantId}`);
      
      // Normalize status values to ensure consistent lowercase with no whitespace
      const campaigns = campaignsRaw.map(c => ({
        ...c,
        status: (c.status || 'pending_approval').trim().toLowerCase(),
      }));
      
      campaigns.forEach((c, index) => {
        console.log(`   Campaign ${index + 1}: "${c.name}"`);
        console.log(`      Status: "${c.status}" (normalized)`);
        console.log(`      Target: "${c.targetGroup}"`);
        console.log(`      Folders: ${JSON.stringify(c.folderIds)} (isArray: ${Array.isArray(c.folderIds)})`);
        console.log(`      Template: "${c.templateName}"`);
        console.log(`      Recipients: ${c.totalRecipients}`);
        console.log(`      📱 Phones To Send: "${c.phonesToSend}" (type: ${typeof c.phonesToSend})`);
      });
      
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching SMS campaigns:", error);
      res.status(500).json({ message: "Failed to fetch SMS campaigns" });
    }
  });

  app.post('/api/sms-campaigns', authenticateUser, requireSmsService, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const insertSmsCampaignSchema = z.object({
        templateId: z.string().uuid(),
        name: z.string().min(1),
        targetGroup: z.enum(["all", "with-balance", "decline", "recent-upload", "folder"]),
        folderIds: z.array(z.string()).optional(),
        phonesToSend: z.enum(['1', '2', '3', 'all']).optional().default('1'), // How many phone numbers per consumer
      });

      const { templateId, name, targetGroup, folderIds, phonesToSend } = insertSmsCampaignSchema.parse(req.body);

      console.log(`📱 Creating SMS campaign - name: "${name}", targetGroup: "${targetGroup}", folderIds:`, folderIds, `phonesToSend: "${phonesToSend}"`);
      console.log(`📱 Request body received:`, JSON.stringify(req.body, null, 2));

      // Use the shared audience resolution function
      const { targetedConsumers } = await resolveSmsCampaignAudience(tenantId, targetGroup, folderIds);

      // Count total phone numbers based on phonesToSend setting (same logic as approval)
      const countPhoneNumbers = (consumer: any): number => {
        const phones: string[] = [];
        
        // Add primary phone number first
        if (consumer.phone) {
          phones.push(consumer.phone);
        }
        
        // Collect additional phone numbers from additionalData
        if (consumer.additionalData) {
          const additionalData = consumer.additionalData as Record<string, any>;
          const phoneKeys = Object.keys(additionalData)
            .filter(key => key.toLowerCase().includes('phone'))
            .sort((a, b) => {
              const numA = parseInt(a.replace(/\D/g, '')) || 0;
              const numB = parseInt(b.replace(/\D/g, '')) || 0;
              return numA - numB;
            });
          
          for (const key of phoneKeys) {
            const value = additionalData[key];
            if (value && typeof value === 'string') {
              const trimmed = value.trim();
              if (trimmed) {
                const normalized = trimmed.replace(/\D/g, '');
                if (normalized.length >= 10) {
                  phones.push(trimmed);
                }
              }
            }
          }
        }
        
        // Deduplicate by normalized digits
        const uniquePhones = new Map<string, string>();
        for (const phone of phones) {
          const normalized = phone.replace(/\D/g, '');
          if (!uniquePhones.has(normalized)) {
            uniquePhones.set(normalized, phone);
          }
        }
        const allPhones = Array.from(uniquePhones.values());
        
        // Apply phonesToSend limit
        if (phonesToSend === 'all') {
          return allPhones.length;
        }
        const limit = parseInt(phonesToSend);
        return Math.min(allPhones.length, limit);
      };

      // Calculate total recipients as sum of phone numbers per consumer
      const totalRecipients = targetedConsumers.reduce((sum, consumer) => sum + countPhoneNumbers(consumer), 0);
      console.log(`📱 Total recipients based on phonesToSend="${phonesToSend}": ${totalRecipients}`);
      
      const campaignData = {
        tenantId,
        templateId,
        name,
        targetGroup,
        folderIds: folderIds || [],
        phonesToSend,
        totalRecipients,
        status: 'pending_approval',
      };
      
      console.log(`📱 Creating campaign with data:`, campaignData);
      const campaign = await storage.createSmsCampaign(campaignData);

      console.log(`📱 SMS campaign "${campaign.name}" created successfully`);
      console.log(`   Status: "${campaign.status}"`);
      console.log(`   Target Group: "${campaign.targetGroup}"`);
      console.log(`   Folder IDs: ${JSON.stringify(campaign.folderIds)}`);
      console.log(`   Phones To Send: "${phonesToSend}"`);
      console.log(`   Total Recipients: ${totalRecipients}`);
      console.log(`   Campaign ID: ${campaign.id}`);

      res.json({
        ...campaign,
        totalRecipients,
        message: 'Campaign created and awaiting approval',
      });
    } catch (error: any) {
      console.error("❌ Error creating SMS campaign:", {
        message: error.message,
        stack: error.stack,
        error: error
      });
      res.status(500).json({ 
        message: "Failed to create SMS campaign",
        error: error.message 
      });
    }
  });

  // Get single campaign with latest progress (for polling during sending)
  app.get('/api/sms-campaigns/:id/status', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const campaign = await storage.getSmsCampaignById(id, tenantId);

      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Get latest metrics for live progress tracking
      const metrics = await getSmsCampaignMetrics(campaign.id);

      res.json({
        id: campaign.id,
        status: campaign.status,
        totalRecipients: campaign.totalRecipients || 0,
        totalSent: metrics.totalSent || campaign.totalSent || 0,
        totalDelivered: metrics.totalDelivered || campaign.totalDelivered || 0,
        totalErrors: metrics.totalErrors || campaign.totalErrors || 0,
        totalOptOuts: metrics.totalOptOuts || campaign.totalOptOuts || 0,
        completedAt: campaign.completedAt,
      });
    } catch (error) {
      console.error("Error fetching SMS campaign status:", error);
      res.status(500).json({ message: "Failed to fetch SMS campaign status" });
    }
  });

  // In-memory lock to prevent concurrent campaign approvals
  const campaignProcessingLocks = new Map<string, boolean>();
  
  // Track cancelled campaigns so the SMS service can stop sending
  const cancelledCampaigns = new Set<string>();

  app.post('/api/sms-campaigns/:id/approve', authenticateUser, requireSmsService, async (req: any, res) => {
    let campaign: any;
    let targetedConsumers: any[] = [];
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      campaign = await storage.getSmsCampaignById(id, tenantId);

      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      console.log(`🚀 Approving SMS campaign "${campaign.name}" - targetGroup: "${campaign.targetGroup}"`);

      const normalizedStatus = (campaign.status || '').toLowerCase();
      if (!['pending', 'pending_approval'].includes(normalizedStatus)) {
        return res.status(400).json({ message: "Campaign is not awaiting approval" });
      }

      // Check if this campaign was cancelled (clear stale flag and reject)
      if (cancelledCampaigns.has(id)) {
        cancelledCampaigns.delete(id); // Clear stale cancelled flag
        return res.status(400).json({ message: "Campaign was previously cancelled and cannot be approved" });
      }

      // Check if this campaign is already being processed (idempotency guard)
      if (campaignProcessingLocks.get(id)) {
        return res.status(409).json({ message: "Campaign is already being processed" });
      }

      // Set processing lock
      campaignProcessingLocks.set(id, true);

      const templates = await storage.getSmsTemplatesByTenant(tenantId);
      const template = templates.find(t => t.id === campaign.templateId);
      if (!template) {
        return res.status(404).json({ message: "SMS template not found" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      // Get tenant settings for contact info (email/phone)
      const tenantSettings = await storage.getTenantSettings(tenantId);
      const tenantWithSettings = {
        ...tenant,
        contactEmail: tenantSettings?.contactEmail,
        contactPhone: tenantSettings?.contactPhone,
        consumerPortalSettings: tenantSettings?.consumerPortalSettings,
      };

      // Use the shared audience resolution function
      const audience = await resolveSmsCampaignAudience(
        tenantId,
        campaign.targetGroup,
        campaign.folderIds || [],
      );
      targetedConsumers = audience.targetedConsumers;
      const { accountsData } = audience;

      // Extract phone numbers for each consumer based on phonesToSend setting
      // phonesToSend can be '1', '2', '3', or 'all'
      const extractPhoneNumbers = (consumer: any): string[] => {
        const phones: string[] = [];
        
        // Add primary phone number first
        if (consumer.phone) {
          phones.push(consumer.phone);
        }
        
        // Collect additional phone numbers from additionalData
        if (consumer.additionalData) {
          const additionalData = consumer.additionalData as Record<string, any>;
          
          // Sort keys to get consistent ordering (phone1, phone2, phone3, etc.)
          const phoneKeys = Object.keys(additionalData)
            .filter(key => key.toLowerCase().includes('phone'))
            .sort((a, b) => {
              // Extract numeric suffix for proper ordering
              const numA = parseInt(a.replace(/\D/g, '')) || 0;
              const numB = parseInt(b.replace(/\D/g, '')) || 0;
              return numA - numB;
            });
          
          for (const key of phoneKeys) {
            const value = additionalData[key];
            if (value && typeof value === 'string') {
              const trimmed = value.trim();
              if (trimmed) {
                // Validate: phone numbers should have at least 10 digits
                const normalized = trimmed.replace(/\D/g, '');
                if (normalized.length >= 10) {
                  phones.push(trimmed);
                }
              }
            }
          }
        }
        
        // Deduplicate by normalized digits while maintaining order
        const uniquePhones = new Map<string, string>();
        for (const phone of phones) {
          const normalized = phone.replace(/\D/g, '');
          if (!uniquePhones.has(normalized)) {
            uniquePhones.set(normalized, phone);
          }
        }
        const allPhones = Array.from(uniquePhones.values());
        
        // Apply phonesToSend limit (supports legacy sendToAllNumbers for backward compatibility)
        const phonesToSend = campaign.phonesToSend || (campaign.sendToAllNumbers ? 'all' : '1');
        if (phonesToSend === 'all') {
          return allPhones;
        }
        const limit = parseInt(phonesToSend);
        return allPhones.slice(0, limit);
      };

      const processedMessages = targetedConsumers
        .flatMap(consumer => {
          const phoneNumbers = extractPhoneNumbers(consumer);
          const consumerAccount = accountsData.find(acc => acc.consumerId === consumer.id);
          const processedMessage = replaceTemplateVariables(template.message || '', consumer, consumerAccount, tenantWithSettings);
          
          // Create a message for each unique phone number
          return phoneNumbers.map(phoneNumber => ({
            to: phoneNumber,
            message: processedMessage,
            consumerId: consumer.id,
            accountId: consumerAccount?.id,
          }));
        });

      // Update campaign status to sending
      const updatedCampaign = await storage.updateSmsCampaign(campaign.id, {
        status: 'sending',
        totalRecipients: processedMessages.length,
        totalSent: 0,
        totalErrors: 0,
        completedAt: null,
      });

      console.log(`✅ SMS campaign "${campaign.name}" approved. Sending ${processedMessages.length} SMS messages in background...`);

      // Send messages in background (non-blocking)
      // This allows the frontend to poll for progress while messages are being sent
      if (processedMessages.length > 0) {
        (async () => {
          try {
            console.log(`📤 Starting background SMS send for campaign ${campaign.id}: ${processedMessages.length} messages`);
            
            // Pass the cancellation checker to the SMS service
            const isCancelled = () => cancelledCampaigns.has(campaign.id);
            const smsResults = await smsService.sendBulkSmsCampaign(processedMessages, tenantId, campaign.id, isCancelled);
            
            if (smsResults.wasCancelled) {
              console.log(`🛑 Campaign ${campaign.id} was cancelled: ${smsResults.totalSent} sent before cancellation`);
              // Update metrics for the partial send before cancellation
              try {
                await storage.updateSmsCampaign(campaign.id, {
                  totalSent: smsResults.totalSent,
                  totalErrors: smsResults.totalFailed,
                });
                console.log(`📊 Updated cancelled campaign metrics: ${smsResults.totalSent} sent, ${smsResults.totalFailed} failed`);
              } catch (err) {
                console.error('Error updating cancelled campaign metrics:', err);
              }
              return; // Status already set to 'cancelled' by the cancel endpoint
            }
            
            console.log(`✅ Bulk send completed for campaign ${campaign.id}: ${smsResults.totalSent} sent, ${smsResults.totalFailed} failed`);

            // Update campaign metrics from tracking records (more accurate than send results)
            console.log(`🔄 Updating campaign ${campaign.id} metrics from tracking records...`);
            await updateSmsCampaignMetrics(campaign.id, { tenantId, ensureStatus: true });
            console.log(`✅ Campaign ${campaign.id} metrics updated (with auto-completion check)`);

            // Mark campaign as completed - CRITICAL: This must succeed
            console.log(`🏁 Marking campaign ${campaign.id} as completed...`);
            const completedCampaign = await storage.updateSmsCampaign(campaign.id, {
              status: 'completed',
              totalRecipients: processedMessages.length,
              completedAt: new Date(),
            });
            console.log(`✅ Campaign ${campaign.id} marked as completed successfully`);
            console.log(
              `✅ SMS campaign "${campaign.name}" completed: ${smsResults.totalSent} sent, ${smsResults.totalFailed} failed`
            );
          } catch (error) {
            console.error(`❌ Error in background SMS campaign send for ${campaign.id}:`, error);
            console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
            
            // Mark campaign as failed
            try {
              console.log(`⚠️ Attempting to mark campaign ${campaign.id} as failed...`);
              await storage.updateSmsCampaign(campaign.id, {
                status: 'failed',
                completedAt: new Date(),
              });
              console.log(`✅ Campaign ${campaign.id} marked as failed`);
            } catch (updateError) {
              console.error(`❌ CRITICAL: Could not update campaign ${campaign.id} status after failure:`, updateError);
            }
          } finally {
            // Release the processing lock and clean up cancelled set
            console.log(`🔓 Releasing processing lock for campaign ${campaign.id}`);
            campaignProcessingLocks.delete(id);
            cancelledCampaigns.delete(campaign.id);
          }
        })();
      } else {
        // No messages to send - mark as completed and release lock immediately
        await storage.updateSmsCampaign(campaign.id, {
          status: 'completed',
          totalRecipients: 0,
          totalSent: 0,
          totalErrors: 0,
          totalDelivered: 0,
          totalOptOuts: 0,
          completedAt: new Date(),
        });
        console.log(`ℹ️ SMS campaign "${campaign.name}" had no recipients. Marking as completed.`);
        campaignProcessingLocks.delete(id);
      }

      // Return immediately with sending status so frontend can poll for progress
      res.json({
        ...updatedCampaign,
        message: 'Campaign approved and sending in background'
      });
    } catch (error) {
      console.error("Error approving SMS campaign:", error);

      if (campaign?.id) {
        try {
          await storage.updateSmsCampaign(campaign.id, {
            status: 'failed',
            totalRecipients: targetedConsumers.length || campaign.totalRecipients || 0,
            completedAt: new Date(),
          });
        } catch (updateError) {
          console.error('Error updating campaign status after failure:', updateError);
        }
      }

      res.status(500).json({ message: "Failed to approve SMS campaign" });
    }
  });

  // Cancel an active/sending SMS campaign
  app.post('/api/sms-campaigns/:id/cancel', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const campaign = await storage.getSmsCampaignById(id, tenantId);

      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const normalizedStatus = (campaign.status || '').trim().toLowerCase();
      
      // Can cancel pending, pending_approval, or sending campaigns
      if (!['pending', 'pending_approval', 'sending'].includes(normalizedStatus)) {
        return res.status(400).json({ message: "Campaign cannot be cancelled (already completed or failed)" });
      }

      // Add to cancelled set so background sending stops
      cancelledCampaigns.add(id);
      console.log(`🛑 Campaign ${id} marked for cancellation`);

      // Update campaign status to cancelled
      await storage.updateSmsCampaign(id, {
        status: 'cancelled',
        completedAt: new Date(),
      });

      // Release processing lock if exists
      campaignProcessingLocks.delete(id);

      console.log(`🛑 SMS campaign "${campaign.name}" cancelled by user`);
      
      res.json({ message: 'Campaign cancelled successfully', status: 'cancelled' });
    } catch (error) {
      console.error("Error cancelling SMS campaign:", error);
      res.status(500).json({ message: "Failed to cancel SMS campaign" });
    }
  });

  // Resume a stuck/cancelled SMS campaign from where it left off
  app.post('/api/sms-campaigns/:id/resume', authenticateUser, requireSmsService, async (req: any, res) => {
    let campaign: any;
    let targetedConsumers: any[] = [];
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      campaign = await storage.getSmsCampaignById(id, tenantId);

      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const normalizedStatus = (campaign.status || '').trim().toLowerCase();
      
      // Can resume campaigns that are stuck in sending, cancelled, or failed states
      if (!['sending', 'cancelled', 'failed'].includes(normalizedStatus)) {
        return res.status(400).json({ message: "Campaign cannot be resumed (only sending, cancelled, or failed campaigns can be resumed)" });
      }

      // Clear any cancellation flag for this campaign
      cancelledCampaigns.delete(id);

      // Check if campaign is already being processed
      if (campaignProcessingLocks.get(id)) {
        return res.status(409).json({ message: "Campaign is already being processed" });
      }

      // Set processing lock
      campaignProcessingLocks.set(id, true);

      console.log(`🔄 Resuming SMS campaign "${campaign.name}"`);

      const templates = await storage.getSmsTemplatesByTenant(tenantId);
      const template = templates.find(t => t.id === campaign.templateId);
      if (!template) {
        campaignProcessingLocks.delete(id);
        return res.status(404).json({ message: "SMS template not found" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        campaignProcessingLocks.delete(id);
        return res.status(404).json({ message: "Tenant not found" });
      }

      const tenantSettings = await storage.getTenantSettings(tenantId);
      const tenantWithSettings = {
        ...tenant,
        contactEmail: tenantSettings?.contactEmail,
        contactPhone: tenantSettings?.contactPhone,
        consumerPortalSettings: tenantSettings?.consumerPortalSettings,
      };

      // Get tracking records to find which consumers already received messages
      const existingTracking = await storage.getSmsTrackingByCampaign(id);
      const alreadySentSet = new Set<string>();
      for (const record of existingTracking) {
        // Create unique key from consumerId + normalized phone number
        const normalizedPhone = (record.phoneNumber || '').replace(/\D/g, '');
        if (record.consumerId && normalizedPhone) {
          alreadySentSet.add(`${record.consumerId}:${normalizedPhone}`);
        }
      }
      console.log(`📊 Found ${alreadySentSet.size} already-sent consumer+phone combinations`);

      // Get the same audience as original campaign
      const audience = await resolveSmsCampaignAudience(
        tenantId,
        campaign.targetGroup,
        campaign.folderIds || [],
      );
      targetedConsumers = audience.targetedConsumers;
      const { accountsData } = audience;

      // Same phone extraction logic as approve endpoint
      const extractPhoneNumbers = (consumer: any): string[] => {
        const phones: string[] = [];
        if (consumer.phone) phones.push(consumer.phone);
        if (consumer.additionalData) {
          const additionalData = consumer.additionalData as Record<string, any>;
          const phoneKeys = Object.keys(additionalData)
            .filter(key => key.toLowerCase().includes('phone'))
            .sort((a, b) => {
              const numA = parseInt(a.replace(/\D/g, '')) || 0;
              const numB = parseInt(b.replace(/\D/g, '')) || 0;
              return numA - numB;
            });
          for (const key of phoneKeys) {
            const value = additionalData[key];
            if (value && typeof value === 'string') {
              const trimmed = value.trim();
              if (trimmed) {
                const normalized = trimmed.replace(/\D/g, '');
                if (normalized.length >= 10) phones.push(trimmed);
              }
            }
          }
        }
        const uniquePhones = new Map<string, string>();
        for (const phone of phones) {
          const normalized = phone.replace(/\D/g, '');
          if (!uniquePhones.has(normalized)) uniquePhones.set(normalized, phone);
        }
        const allPhones = Array.from(uniquePhones.values());
        const phonesToSend = campaign.phonesToSend || (campaign.sendToAllNumbers ? 'all' : '1');
        if (phonesToSend === 'all') return allPhones;
        const limit = parseInt(phonesToSend);
        return allPhones.slice(0, limit);
      };

      // Build all messages, then filter out already-sent ones
      const allMessages = targetedConsumers.flatMap(consumer => {
        const phoneNumbers = extractPhoneNumbers(consumer);
        const consumerAccount = accountsData.find(acc => acc.consumerId === consumer.id);
        const processedMessage = replaceTemplateVariables(template.message || '', consumer, consumerAccount, tenantWithSettings);
        return phoneNumbers.map(phoneNumber => ({
          to: phoneNumber,
          message: processedMessage,
          consumerId: consumer.id,
          accountId: consumerAccount?.id,
        }));
      });

      // Filter out messages that were already sent (based on consumerId + phone)
      const remainingMessages = allMessages.filter(msg => {
        const normalizedPhone = (msg.to || '').replace(/\D/g, '');
        const key = `${msg.consumerId}:${normalizedPhone}`;
        return !alreadySentSet.has(key);
      });

      console.log(`📊 Total audience: ${allMessages.length}, Already sent: ${alreadySentSet.size}, Remaining: ${remainingMessages.length}`);

      if (remainingMessages.length === 0) {
        // Campaign was already complete
        await storage.updateSmsCampaign(id, {
          status: 'completed',
          completedAt: new Date(),
        });
        campaignProcessingLocks.delete(id);
        return res.json({ 
          message: 'Campaign already completed - all messages were already sent',
          totalSent: campaign.totalSent || alreadySentSet.size,
          totalRecipients: allMessages.length
        });
      }

      // Update campaign status to sending/resuming with correct recipient count
      await storage.updateSmsCampaign(id, {
        status: 'sending',
        totalRecipients: allMessages.length,
        completedAt: null,
      });

      console.log(`✅ SMS campaign "${campaign.name}" resuming. Total audience: ${allMessages.length}, sending ${remainingMessages.length} remaining messages...`);

      // Send remaining messages in background
      (async () => {
        try {
          console.log(`📤 Resuming background SMS send for campaign ${id}: ${remainingMessages.length} remaining messages`);
          
          const isCancelled = () => cancelledCampaigns.has(id);
          const smsResults = await smsService.sendBulkSmsCampaign(
            remainingMessages, // Only send to consumers who haven't received yet
            tenantId, 
            id, 
            isCancelled,
            0 // Start from beginning of the filtered list
          );
          
          if (smsResults.wasCancelled) {
            console.log(`🛑 Resumed campaign ${id} was cancelled at index ${smsResults.lastSentIndex}`);
            return;
          }
          
          console.log(`✅ Resume send completed for campaign ${id}: ${smsResults.totalSent} sent, ${smsResults.totalFailed} failed`);

          await updateSmsCampaignMetrics(id, { tenantId, ensureStatus: true });
          
          await storage.updateSmsCampaign(id, {
            status: 'completed',
            totalRecipients: allMessages.length,
            completedAt: new Date(),
            lastSentIndex: allMessages.length,
          });
          console.log(`✅ Resumed campaign ${id} completed successfully`);
        } catch (error) {
          console.error(`❌ Error in resumed SMS campaign send for ${id}:`, error);
          try {
            await storage.updateSmsCampaign(id, {
              status: 'failed',
              completedAt: new Date(),
            });
          } catch (updateError) {
            console.error(`❌ Could not update campaign ${id} status after resume failure:`, updateError);
          }
        } finally {
          campaignProcessingLocks.delete(id);
          cancelledCampaigns.delete(id);
        }
      })();

      res.json({
        message: `Campaign resuming - sending to ${remainingMessages.length} remaining recipients`,
        remainingMessages: remainingMessages.length,
        alreadySent: alreadySentSet.size,
        totalRecipients: allMessages.length,
      });
    } catch (error) {
      console.error("Error resuming SMS campaign:", error);
      if (campaign?.id) {
        campaignProcessingLocks.delete(campaign.id);
      }
      res.status(500).json({ message: "Failed to resume SMS campaign" });
    }
  });

  app.delete('/api/sms-campaigns/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const campaign = await storage.getSmsCampaignById(id, tenantId);

      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const normalizedStatus = (campaign.status || '').trim().toLowerCase();
      
      // If campaign is currently sending, cancel it first
      if (normalizedStatus === 'sending') {
        cancelledCampaigns.add(id);
        console.log(`🛑 Campaign ${id} marked for cancellation before deletion`);
        await storage.updateSmsCampaign(id, {
          status: 'cancelled',
          completedAt: new Date(),
        });
      }

      // Allow deleting campaigns in any status
      await storage.deleteSmsCampaign(id, tenantId);
      console.log(`🗑️ Campaign ${id} deleted (was in status: ${campaign.status})`);

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting SMS campaign:", error);
      res.status(500).json({ message: "Failed to delete SMS campaign" });
    }
  });

  // SMS metrics route
  app.get('/api/sms-metrics', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const metrics = await storage.getSmsMetricsByTenant(tenantId);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching SMS metrics:", error);
      res.status(500).json({ message: "Failed to fetch SMS metrics" });
    }
  });

  // Historical SMS sync - fetches Twilio message history to populate blocked numbers
  app.post('/api/sms-compliance/sync-historical', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { daysBack = 90 } = req.body;
      
      // Validate daysBack is reasonable (1-365 days)
      const days = Math.min(Math.max(parseInt(daysBack) || 90, 1), 365);

      console.log(`📱 Starting historical SMS sync for tenant ${tenantId}, ${days} days back`);

      const result = await smsService.syncHistoricalBlockedNumbers(tenantId, days);

      if (result.success) {
        res.json({
          message: 'Historical sync completed',
          ...result,
        });
      } else {
        res.status(500).json({
          message: 'Historical sync failed',
          ...result,
        });
      }
    } catch (error) {
      console.error("Error running historical SMS sync:", error);
      res.status(500).json({ message: "Failed to run historical SMS sync" });
    }
  });

  // Get blocked SMS numbers for tenant
  app.get('/api/sms-compliance/blocked-numbers', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const blockedNumbers = await storage.getSmsBlockedNumbers(tenantId);
      res.json(blockedNumbers);
    } catch (error) {
      console.error("Error fetching blocked numbers:", error);
      res.status(500).json({ message: "Failed to fetch blocked numbers" });
    }
  });

  // Unblock a phone number
  app.delete('/api/sms-compliance/blocked-numbers/:phoneNumber', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { phoneNumber } = req.params;
      await storage.removeSmsBlockedNumber(tenantId, phoneNumber);
      res.status(204).send();
    } catch (error) {
      console.error("Error unblocking phone number:", error);
      res.status(500).json({ message: "Failed to unblock phone number" });
    }
  });

  // SMS throttling and queue management routes
  app.get('/api/sms-rate-limit-status', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const rateLimitStatus = await smsService.getRateLimitStatus(tenantId);
      res.json(rateLimitStatus);
    } catch (error) {
      console.error("Error getting SMS rate limit status:", error);
      res.status(500).json({ message: "Failed to get rate limit status" });
    }
  });

  app.get('/api/sms-queue-status', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const queueStatus = smsService.getQueueStatus(tenantId);
      res.json(queueStatus);
    } catch (error) {
      console.error("Error getting SMS queue status:", error);
      res.status(500).json({ message: "Failed to get queue status" });
    }
  });

  app.post('/api/send-test-sms', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { phoneNumber, message } = req.body;

      if (!phoneNumber || !message) {
        return res.status(400).json({ message: "Phone number and message are required" });
      }

      const result = await smsService.sendSms(phoneNumber, message, tenantId);
      res.json(result);
    } catch (error) {
      console.error("Error sending test SMS:", error);
      res.status(500).json({ message: "Failed to send test SMS" });
    }
  });

  // Helper function to calculate next execution time for automations
  function calculateNextExecution(automation: any): Date | null {
    const triggerType = automation.triggerType || automation.trigger || 'schedule';
    if (triggerType !== 'schedule') {
      return null;
    }

    const scheduleType = automation.scheduleType || 'once';

    const parseTimeString = (value?: string | null) => {
      if (!value) {
        return null;
      }
      const [hoursStr, minutesStr] = value.split(':');
      const hours = Number(hoursStr);
      const minutes = Number(minutesStr);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return null;
      }
      return { hours, minutes };
    };

    const timeParts = parseTimeString(automation.scheduleTime || automation.scheduledTimeOfDay) || { hours: 9, minutes: 0 };

    const rawBaseDate = automation.scheduledDate || automation.scheduledTime || null;
    const baseDate = rawBaseDate ? new Date(rawBaseDate) : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      return null;
    }

    baseDate.setSeconds(0, 0);
    baseDate.setMilliseconds(0);
    baseDate.setHours(timeParts.hours, timeParts.minutes, 0, 0);

    const now = new Date();

    if (scheduleType === 'once') {
      return baseDate >= now ? new Date(baseDate) : null;
    }

    if (scheduleType === 'daily') {
      const candidate = new Date(baseDate);
      while (candidate <= now) {
        candidate.setDate(candidate.getDate() + 1);
      }
      return candidate;
    }

    if (scheduleType === 'weekly') {
      const weekdayMap: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      };

      const scheduleWeekdays = Array.isArray(automation.scheduleWeekdays)
        ? automation.scheduleWeekdays
        : [];

      const targetDays = scheduleWeekdays
        .map((day: unknown) => (typeof day === 'string' ? weekdayMap[day.toLowerCase()] : undefined))
        .filter((value: number | undefined): value is number => value !== undefined);

      const daysToEvaluate = targetDays.length > 0 ? targetDays : [baseDate.getDay()];

      let bestCandidate: Date | null = null;

      for (const dayIndex of daysToEvaluate) {
        const candidate = new Date(baseDate);
        const diff = (dayIndex - candidate.getDay() + 7) % 7;
        if (diff === 0 && candidate <= now) {
          candidate.setDate(candidate.getDate() + 7);
        } else {
          candidate.setDate(candidate.getDate() + diff);
        }

        if (!bestCandidate || candidate < bestCandidate) {
          bestCandidate = candidate;
        }
      }

      return bestCandidate;
    }

    if (scheduleType === 'monthly') {
      const desiredDayRaw = automation.scheduleDayOfMonth;
      const desiredDay = desiredDayRaw ? Number(desiredDayRaw) : baseDate.getDate();
      if (!Number.isFinite(desiredDay) || desiredDay < 1) {
        return null;
      }

      const candidate = new Date(baseDate);
      const applyDay = (date: Date) => {
        const maxDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(desiredDay, maxDay));
        date.setHours(timeParts.hours, timeParts.minutes, 0, 0);
      };

      applyDay(candidate);
      while (candidate <= now) {
        candidate.setMonth(candidate.getMonth() + 1);
        applyDay(candidate);
      }

      return candidate;
    }

    if (scheduleType === 'sequence') {
      const templateSchedule = Array.isArray(automation.templateSchedule)
        ? automation.templateSchedule
        : [];

      const sortedSchedule = templateSchedule
        .filter(
          (item: any) =>
            item && typeof item === 'object' && typeof item.templateId === 'string' && item.templateId.trim().length > 0,
        )
        .map((item: any) => ({
          templateId: item.templateId,
          dayOffset: Number(item.dayOffset) || 0,
        }))
        .sort((a: any, b: any) => a.dayOffset - b.dayOffset);

      if (sortedSchedule.length === 0) {
        return baseDate >= now ? new Date(baseDate) : null;
      }

      for (const scheduleItem of sortedSchedule) {
        const candidate = new Date(baseDate);
        candidate.setDate(candidate.getDate() + scheduleItem.dayOffset);
        if (candidate >= now) {
          return candidate;
        }
      }

      return null;
    }

    return baseDate >= now ? new Date(baseDate) : null;
  }

  // Communication Automation Routes
  app.get('/api/automations', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const automations = await storage.getAutomationsByTenant(tenantId);
      res.json(automations);
    } catch (error) {
      console.error("Error fetching automations:", error);
      res.status(500).json({ message: "Failed to fetch automations" });
    }
  });

  app.post('/api/automations', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      console.log('📝 Creating automation with body:', JSON.stringify(req.body, null, 2));

      // Simplified schema - each automation is a single scheduled send
      const insertAutomationSchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(['email', 'sms']),
        templateId: z.union([z.string(), z.number()]).transform(String), // Accept string or number, convert to string
        scheduledDate: z.string(), // ISO timestamp
        scheduleTime: z.string(), // HH:MM format
        targetFolderIds: z.array(z.union([z.string(), z.number()]).transform(String)).optional().default([]),
        phonesToSend: z.enum(['1', '2', '3', 'all']).optional().default('1'), // For SMS: how many phone numbers to send to
      });

      const validatedData = insertAutomationSchema.parse(req.body);
      console.log('✓ Validation passed:', validatedData);

      //  Convert scheduledDate to timestamp
      const scheduledDateTime = new Date(validatedData.scheduledDate);
      console.log('✓ Scheduled date time:', scheduledDateTime.toISOString());

      const automationData: any = {
        ...validatedData,
        tenantId: tenantId,
        scheduledDate: scheduledDateTime,
        nextExecution: scheduledDateTime, // CRITICAL: Set nextExecution so the processor knows when to run
        targetType: validatedData.targetFolderIds && validatedData.targetFolderIds.length > 0 ? 'folders' : 'all',
        isActive: true,
      };
      
      console.log('✓ Creating automation with data:', automationData);
      const newAutomation = await storage.createAutomation(automationData);
      
      console.log('✅ Automation created:', {
        id: newAutomation.id,
        name: newAutomation.name,
        scheduledDate: scheduledDateTime.toISOString(),
        nextExecution: scheduledDateTime.toISOString(),
        scheduleTime: validatedData.scheduleTime,
      });
      
      res.status(201).json(newAutomation);
    } catch (error: any) {
      console.error("❌ Error creating automation:", {
        message: error.message,
        stack: error.stack,
        validationErrors: error.errors,
        error: error
      });
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ 
        message: "Failed to create automation",
        error: error.message 
      });
    }
  });

  app.put('/api/automations/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const updateAutomationSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
        type: z.enum(['email', 'sms']).optional(),
        templateId: z.string().uuid().optional(),
        scheduledDate: z.string().optional(),
        scheduleTime: z.string().optional(),
        targetFolderIds: z.array(z.string().uuid()).optional(),
        phonesToSend: z.enum(['1', '2', '3', 'all']).optional(), // For SMS: how many phone numbers to send to
      });

      const validatedData = updateAutomationSchema.parse(req.body);
      
      const updateData: any = {
        ...validatedData,
        updatedAt: new Date(),
      };
      
      // Convert scheduledDate string to Date if provided and also set nextExecution
      if (updateData.scheduledDate) {
        const scheduledDateTime = new Date(updateData.scheduledDate);
        updateData.scheduledDate = scheduledDateTime;
        updateData.nextExecution = scheduledDateTime; // CRITICAL: Update nextExecution so the processor knows when to run
        console.log('✓ Updated automation schedule:', {
          scheduledDate: scheduledDateTime.toISOString(),
          nextExecution: scheduledDateTime.toISOString(),
        });
      }
      
      const updatedAutomation = await storage.updateAutomation(req.params.id, updateData);
      
      res.json(updatedAutomation);
    } catch (error) {
      console.error("Error updating automation:", error);
      res.status(500).json({ message: "Failed to update automation" });
    }
  });

  // Pause/deactivate an automation
  app.post('/api/automations/:id/pause', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const automation = await storage.getAutomationById(req.params.id, tenantId);
      if (!automation) {
        return res.status(404).json({ message: "Automation not found" });
      }

      // Set isActive to false to pause the automation
      await storage.updateAutomation(req.params.id, {
        isActive: false,
      });

      console.log(`⏸️ Automation "${automation.name}" paused by user`);
      res.json({ message: 'Automation paused successfully', isActive: false });
    } catch (error) {
      console.error("Error pausing automation:", error);
      res.status(500).json({ message: "Failed to pause automation" });
    }
  });

  app.delete('/api/automations/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      await storage.deleteAutomation(req.params.id, tenantId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting automation:", error);
      res.status(500).json({ message: "Failed to delete automation" });
    }
  });

  app.get('/api/automations/:id/executions', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      // Verify automation belongs to tenant
      const automation = await storage.getAutomationById(req.params.id, tenantId);
      if (!automation) {
        return res.status(404).json({ message: "Automation not found" });
      }

      const executions = await storage.getAutomationExecutions(req.params.id);
      res.json(executions);
    } catch (error) {
      console.error("Error fetching automation executions:", error);
      res.status(500).json({ message: "Failed to fetch automation executions" });
    }
  });

  // Communication Sequences Routes
  app.get('/api/sequences', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const sequences = await storage.getCommunicationSequencesByTenant(tenantId);
      res.json(sequences);
    } catch (error) {
      console.error("Error fetching sequences:", error);
      res.status(500).json({ message: "Failed to fetch sequences" });
    }
  });

  app.get('/api/sequences/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const sequence = await storage.getCommunicationSequenceById(req.params.id, tenantId);
      if (!sequence) {
        return res.status(404).json({ message: "Sequence not found" });
      }

      res.json(sequence);
    } catch (error) {
      console.error("Error fetching sequence:", error);
      res.status(500).json({ message: "Failed to fetch sequence" });
    }
  });

  app.post('/api/sequences', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const sequenceSchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        triggerType: z.enum(['immediate', 'scheduled', 'event']).default('immediate'),
        triggerEvent: z.enum(['account_created', 'payment_received', 'payment_overdue', 'payment_failed', 'one_time_payment']).optional(),
        triggerDelay: z.number().int().min(0).optional().default(0),
        targetType: z.enum(['all', 'folder', 'custom']).default('all'),
        targetFolderIds: z.array(z.string().uuid()).optional().default([]),
        isActive: z.boolean().optional().default(true),
      });

      const validatedData = sequenceSchema.parse(req.body);
      const sequenceData = {
        ...validatedData,
        tenantId,
      };

      const newSequence = await storage.createCommunicationSequence(sequenceData);
      
      console.log('✅ Communication sequence created:', {
        id: newSequence.id,
        name: newSequence.name,
        triggerType: newSequence.triggerType,
      });

      res.status(201).json(newSequence);
    } catch (error) {
      console.error("Error creating sequence:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create sequence" });
    }
  });

  app.put('/api/sequences/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        triggerType: z.enum(['immediate', 'scheduled', 'event']).optional(),
        triggerEvent: z.enum(['account_created', 'payment_received', 'payment_overdue', 'payment_failed', 'one_time_payment']).optional(),
        triggerDelay: z.number().int().min(0).optional(),
        targetType: z.enum(['all', 'folder', 'custom']).optional(),
        targetFolderIds: z.array(z.string().uuid()).optional(),
        isActive: z.boolean().optional(),
      });

      const validatedData = updateSchema.parse(req.body);
      const updatedSequence = await storage.updateCommunicationSequence(req.params.id, validatedData);

      if (!updatedSequence) {
        return res.status(404).json({ message: "Sequence not found" });
      }

      res.json(updatedSequence);
    } catch (error) {
      console.error("Error updating sequence:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update sequence" });
    }
  });

  app.delete('/api/sequences/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      await storage.deleteCommunicationSequence(req.params.id, tenantId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting sequence:", error);
      res.status(500).json({ message: "Failed to delete sequence" });
    }
  });

  // Sequence Steps Routes
  app.get('/api/sequences/:sequenceId/steps', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const steps = await storage.getSequenceSteps(req.params.sequenceId);
      res.json(steps);
    } catch (error) {
      console.error("Error fetching sequence steps:", error);
      res.status(500).json({ message: "Failed to fetch sequence steps" });
    }
  });

  app.post('/api/sequences/:sequenceId/steps', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const stepSchema = z.object({
        stepType: z.enum(['email', 'sms']),
        templateId: z.string().uuid(),
        delayDays: z.number().int().min(0).default(0),
        delayHours: z.number().int().min(0).optional().default(0),
        stepOrder: z.number().int().min(0),
      });

      const validatedData = stepSchema.parse(req.body);
      const stepData = {
        ...validatedData,
        sequenceId: req.params.sequenceId,
      };

      const newStep = await storage.createSequenceStep(stepData);
      
      console.log('✅ Sequence step created:', {
        id: newStep.id,
        sequenceId: req.params.sequenceId,
        stepType: newStep.stepType,
        delayDays: newStep.delayDays,
      });

      res.status(201).json(newStep);
    } catch (error) {
      console.error("Error creating sequence step:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create sequence step" });
    }
  });

  app.put('/api/sequences/steps/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const updateSchema = z.object({
        stepType: z.enum(['email', 'sms']).optional(),
        templateId: z.string().uuid().optional(),
        delayDays: z.number().int().min(0).optional(),
        delayHours: z.number().int().min(0).optional(),
        stepOrder: z.number().int().min(0).optional(),
      });

      const validatedData = updateSchema.parse(req.body);
      const updatedStep = await storage.updateSequenceStep(req.params.id, validatedData);

      if (!updatedStep) {
        return res.status(404).json({ message: "Step not found" });
      }

      res.json(updatedStep);
    } catch (error) {
      console.error("Error updating sequence step:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update sequence step" });
    }
  });

  app.delete('/api/sequences/steps/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      await storage.deleteSequenceStep(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting sequence step:", error);
      res.status(500).json({ message: "Failed to delete sequence step" });
    }
  });

  app.post('/api/sequences/steps/reorder', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const reorderSchema = z.object({
        sequenceId: z.string().uuid(),
        stepIds: z.array(z.string().uuid()),
      });

      const { sequenceId, stepIds } = reorderSchema.parse(req.body);
      await storage.reorderSequenceSteps(sequenceId, stepIds);
      
      console.log('✅ Sequence steps reordered:', {
        sequenceId,
        count: stepIds.length,
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error reordering sequence steps:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to reorder sequence steps" });
    }
  });

  // Sequence Enrollments Routes
  app.get('/api/sequences/:sequenceId/enrollments', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const enrollments = await storage.getSequenceEnrollments(req.params.sequenceId);
      res.json(enrollments);
    } catch (error) {
      console.error("Error fetching sequence enrollments:", error);
      res.status(500).json({ message: "Failed to fetch sequence enrollments" });
    }
  });

  app.post('/api/sequences/:sequenceId/enroll', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const enrollSchema = z.object({
        consumerId: z.string().uuid(),
      });

      const { consumerId } = enrollSchema.parse(req.body);
      const enrollmentData = {
        sequenceId: req.params.sequenceId,
        consumerId,
        status: 'active' as const,
        enrolledAt: new Date(),
      };

      const enrollment = await storage.enrollConsumerInSequence(enrollmentData);
      
      console.log('✅ Consumer enrolled in sequence:', {
        enrollmentId: enrollment.id,
        sequenceId: req.params.sequenceId,
        consumerId,
      });

      res.status(201).json(enrollment);
    } catch (error) {
      console.error("Error enrolling consumer in sequence:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to enroll consumer" });
    }
  });

  app.get('/api/sequences/enrollments/active', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const activeEnrollments = await storage.getActiveEnrollments();
      res.json(activeEnrollments);
    } catch (error) {
      console.error("Error fetching active enrollments:", error);
      res.status(500).json({ message: "Failed to fetch active enrollments" });
    }
  });

  app.post('/api/sequences/enrollments/:id/complete', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      await storage.updateEnrollment(req.params.id, { 
        status: 'completed',
        completedAt: new Date(),
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error completing enrollment:", error);
      res.status(500).json({ message: "Failed to complete enrollment" });
    }
  });

  app.post('/api/sequences/enrollments/:id/pause', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      await storage.pauseEnrollment(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error pausing enrollment:", error);
      res.status(500).json({ message: "Failed to pause enrollment" });
    }
  });

  app.post('/api/sequences/enrollments/:id/advance', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const advanceSchema = z.object({
        currentStepId: z.string().uuid().optional(),
        currentStepOrder: z.number().int().optional(),
        nextMessageAt: z.string().optional(),
      });

      const validatedData = advanceSchema.parse(req.body);
      const updates: any = {};
      
      if (validatedData.currentStepId) updates.currentStepId = validatedData.currentStepId;
      if (validatedData.currentStepOrder !== undefined) updates.currentStepOrder = validatedData.currentStepOrder;
      if (validatedData.nextMessageAt) updates.nextMessageAt = new Date(validatedData.nextMessageAt);
      
      await storage.updateEnrollment(req.params.id, updates);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error advancing enrollment:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to advance enrollment" });
    }
  });

  // Public agency branding endpoint
  app.get('/api/public/agency-branding', async (req, res) => {
    const { slug } = req.query;

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'Agency slug is required' });
    }

    try {
      const tenant = await storage.getTenantBySlug(slug);

      if (!tenant) {
        return res.status(404).json({ error: 'Agency not found' });
      }

      if (!tenant.isActive) {
        return res.status(403).json({ error: 'Agency is not active' });
      }

      // Get tenant settings for additional branding
      const settings = await storage.getTenantSettings(tenant.id);

      // Combine branding information
      const customBranding = settings?.customBranding as any;
      const branding = {
        agencyName: tenant.name,
        agencySlug: tenant.slug,
        businessType: tenant.businessType || 'call_center',
        logoUrl: customBranding?.logoUrl || (tenant.brand as any)?.logoUrl || null,
        primaryColor: customBranding?.primaryColor || '#3B82F6',
        secondaryColor: customBranding?.secondaryColor || '#1E40AF',
        contactEmail: settings?.contactEmail || null,
        contactPhone: settings?.contactPhone || null,
        hasPrivacyPolicy: !!settings?.privacyPolicy,
        hasTermsOfService: !!settings?.termsOfService,
        privacyPolicy: settings?.privacyPolicy || null,
        termsOfService: settings?.termsOfService || null,
        landingPageHeadline: customBranding?.landingPageHeadline || null,
        landingPageSubheadline: customBranding?.landingPageSubheadline || null,
        customLandingPageUrl: customBranding?.customLandingPageUrl || null,
      };

      res.status(200).json(branding);
    } catch (error) {
      console.error('Agency branding API error:', error);
      res.status(500).json({ error: 'Failed to fetch agency branding' });
    }
  });

  // Consumer registration route (public)
  app.post('/api/consumer-registration', async (req, res) => {
    console.log("Consumer registration request received:", { 
      email: req.body.email, 
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      tenantSlug: req.body.tenantSlug,
      hasBody: !!req.body,
      bodyKeys: Object.keys(req.body || {})
    });
    
    try {
      const { 
        firstName, 
        lastName, 
        email, 
        dateOfBirth, 
        address, 
        city, 
        state, 
        zipCode,
        tenantSlug 
      } = req.body;

      if (!firstName || !lastName || !email || !dateOfBirth || !address) {
        return res.status(400).json({ message: "Name, email, date of birth, and address are required" });
      }

      // First, check if consumer already exists in any agency
      console.log("Checking for existing consumer with email:", email);
      const existingConsumer = await storage.getConsumerByEmail(email);
      console.log("Existing consumer found:", !!existingConsumer);

      if (existingConsumer) {
        // Normalize DOB values for comparison. Missing stored DOB should not block registration.
        const normalizedProvidedDOB = normalizeDateString(dateOfBirth);
        const normalizedStoredDOB = normalizeDateString(existingConsumer.dateOfBirth);
        const hasStoredDOB = Boolean(normalizedStoredDOB);
        const dobMatches = normalizedProvidedDOB && normalizedStoredDOB
          ? normalizedProvidedDOB === normalizedStoredDOB
          : !hasStoredDOB;

        if (!normalizedProvidedDOB) {
          return res.status(400).json({
            message: "Invalid date of birth format. Please use MM/DD/YYYY or YYYY-MM-DD.",
          });
        }

        if (dobMatches) {
          // If a tenantSlug is provided and the consumer doesn't have a tenant yet, associate them
          let shouldUpdateTenant = false;
          if (tenantSlug && !existingConsumer.tenantId) {
            const tenant = await storage.getTenantBySlug(tenantSlug);
            if (tenant && tenant.isActive) {
              shouldUpdateTenant = true;
              existingConsumer.tenantId = tenant.id;
            }
          }

          // Prepare folder assignment if tenant exists
          let portalFolder = null;
          if (existingConsumer.tenantId) {
            console.log(`📁 Ensuring default folders for tenant ${existingConsumer.tenantId}`);
            await storage.ensureDefaultFolders(existingConsumer.tenantId);
            portalFolder = await storage.getPortalRegistrationsFolder(existingConsumer.tenantId);
            console.log(`📁 Portal Registrations folder found:`, portalFolder ? `ID: ${portalFolder.id}` : 'NOT FOUND');
          }
          
          // Update existing consumer with complete registration info
          const updateData: any = {
            firstName,
            lastName,
            address,
            city,
            state,
            zipCode,
            isRegistered: true,
            ...(shouldUpdateTenant && { tenantId: existingConsumer.tenantId })
          };

          // Only set folder if tenant exists and folder is available
          if (portalFolder) {
            updateData.folderId = portalFolder.id;
          }

          if (!hasStoredDOB && normalizedProvidedDOB) {
            updateData.dateOfBirth = normalizedProvidedDOB;
          }

          // Only add registrationDate if the field is supported
          try {
            updateData.registrationDate = new Date();
          } catch (e) {
            // Field might not exist in production yet
            console.log("Note: registrationDate field not available for update");
          }

          const updatedConsumer = await storage.updateConsumer(existingConsumer.id, updateData);

          // Move all consumer's accounts to the Portal Registrations folder
          if (portalFolder && existingConsumer.tenantId) {
            const consumerAccounts = await storage.getAccountsByConsumer(existingConsumer.id);
            console.log(`📁 Moving ${consumerAccounts.length} accounts to Portal Registrations folder (ID: ${portalFolder.id})`);
            for (const account of consumerAccounts) {
              console.log(`  📁 Updating account ${account.accountNumber || account.id} - old folder: ${account.folderId || 'none'}, new folder: ${portalFolder.id}`);
              await storage.updateAccount(account.id, { folderId: portalFolder.id });
            }
            console.log(`✅ Finished moving all ${consumerAccounts.length} accounts to Portal Registrations`);
          } else {
            console.log(`⚠️ Skipping folder move - portalFolder: ${!!portalFolder}, tenantId: ${existingConsumer.tenantId}`);
          }

          // Send notification to admins if this is a new registration (not re-registration)
          if (!existingConsumer.isRegistered && updatedConsumer.isRegistered && existingConsumer.tenantId) {
            await notifyTenantAdmins({
              tenantId: existingConsumer.tenantId,
              subject: 'New Consumer Registration',
              eventType: 'consumer_registered',
              consumer: {
                firstName: updatedConsumer.firstName || firstName,
                lastName: updatedConsumer.lastName || lastName,
                email: updatedConsumer.email || email,
              },
            }).catch(err => console.error('Failed to send registration notification:', err));

            // Send note to SMAX with folder location
            try {
              const { smaxService } = await import('./smaxService');
              const accounts = await storage.getAccountsByConsumer(updatedConsumer.id);
              
              if (accounts && accounts.length > 0) {
                const folderName = portalFolder?.name || 'Portal Registrations';
                for (const account of accounts) {
                  // Only send note if filenumber exists (required by SMAX)
                  if (account.filenumber && account.filenumber.trim()) {
                    const noteData = {
                      filenumber: account.filenumber.trim(),
                      collectorname: 'System',
                      logmessage: `Consumer ${firstName} ${lastName} registered via portal - Moved to ${folderName}. Email: ${email}, DOB: ${dateOfBirth}, Address: ${address}, ${city}, ${state} ${zipCode}. Consumer can now access account and make payments online.`
                    };
                    
                    const smaxResult = await smaxService.insertNote(existingConsumer.tenantId, noteData);
                    if (smaxResult) {
                      console.log(`✅ SMAX note added for filenumber ${account.filenumber}`);
                    } else {
                      console.log(`ℹ️ SMAX note not sent (SMAX may not be configured)`);
                    }
                  } else {
                    console.log(`ℹ️ Skipping SMAX note for account ${account.accountNumber || account.id} - no filenumber`);
                  }
                }
              }
            } catch (smaxError) {
              console.error('Failed to send SMAX note:', smaxError);
            }
          }

          // Only get tenant info if consumer has a tenantId
          let tenantInfo = null;
          if (existingConsumer.tenantId) {
            const tenant = await storage.getTenant(existingConsumer.tenantId);
            if (tenant) {
              tenantInfo = {
                name: tenant.name,
                slug: tenant.slug,
              };
            }
          }

          return res.json({
            message: tenantInfo
              ? "Registration completed successfully! Your agency has been automatically identified."
              : "Registration successful! You'll be notified when your agency adds your account information.",
            consumerId: updatedConsumer.id,
            consumer: {
              id: updatedConsumer.id,
              firstName: updatedConsumer.firstName,
              lastName: updatedConsumer.lastName,
              email: updatedConsumer.email,
            },
            ...(tenantInfo && { tenant: tenantInfo }),
            needsAgencyLink: !tenantInfo
          });
        } else {
          return res.status(400).json({
            message: "An account with this email exists, but the date of birth doesn't match. Please verify your information."
          });
        }
      }

      // No existing account found - create a new consumer record
      // Tenant is REQUIRED for new consumer registration
      
      let tenantId = null;
      let tenantInfo = null;
      
      if (tenantSlug) {
        // Look up the tenant by slug
        const tenant = await storage.getTenantBySlug(tenantSlug);
        if (tenant && tenant.isActive) {
          tenantId = tenant.id;
          tenantInfo = {
            name: tenant.name,
            slug: tenant.slug,
          };
        }
      }
      
      // Reject registration if no valid tenant found
      if (!tenantId) {
        return res.status(400).json({ 
          message: "Agency selection is required for registration. Please select your agency and try again.",
          needsAgencyLink: true,
          suggestedAction: "select-agency"
        });
      }
      
      // Ensure folders exist and get the Portal Registrations folder
      console.log(`📁 Ensuring default folders for tenant ${tenantId}`);
      await storage.ensureDefaultFolders(tenantId);
      const portalFolder = await storage.getPortalRegistrationsFolder(tenantId);
      console.log(`📁 Portal Registrations folder found:`, portalFolder ? `ID: ${portalFolder.id}` : 'NOT FOUND');
      
      // Build the consumer object with required fields
      const consumerData: any = {
        firstName,
        lastName,
        email,
        dateOfBirth,
        address,
        city,
        state,
        zipCode,
        isRegistered: true,
        tenantId, // Always include tenantId since it's now required
        folderId: portalFolder?.id || null // Assign to Portal Registrations folder
      };
      
      // Only add optional fields if they're supported
      // Don't add tenantId if it's null (let database handle the default)
      // Only add registrationDate if the field exists in the schema
      try {
        consumerData.registrationDate = new Date();
      } catch (e) {
        // Field might not exist in production yet
        console.log("Note: registrationDate field not available");
      }
      
      console.log("Creating new consumer with data:", JSON.stringify(consumerData));
      const newConsumer = await storage.createConsumer(consumerData);
      console.log("New consumer created successfully:", newConsumer.id);

      // Move all consumer's accounts to the Portal Registrations folder
      if (portalFolder) {
        const consumerAccounts = await storage.getAccountsByConsumer(newConsumer.id);
        console.log(`📁 Moving ${consumerAccounts.length} accounts to Portal Registrations folder (ID: ${portalFolder.id})`);
        for (const account of consumerAccounts) {
          console.log(`  📁 Updating account ${account.accountNumber || account.id} - old folder: ${account.folderId || 'none'}, new folder: ${portalFolder.id}`);
          await storage.updateAccount(account.id, { folderId: portalFolder.id });
        }
        console.log(`✅ Finished moving all ${consumerAccounts.length} accounts to Portal Registrations`);
      } else {
        console.log(`⚠️ Skipping folder move - no Portal Registrations folder found`);
      }

      // Send notification to admins about new registration
      if (tenantId) {
        await notifyTenantAdmins({
          tenantId,
          subject: 'New Consumer Registration',
          eventType: 'consumer_registered',
          consumer: {
            firstName: newConsumer.firstName || firstName,
            lastName: newConsumer.lastName || lastName,
            email: newConsumer.email || email,
          },
        }).catch(err => console.error('Failed to send registration notification:', err));

        // Send note to SMAX with folder location
        try {
          const { smaxService } = await import('./smaxService');
          const accounts = await storage.getAccountsByConsumer(newConsumer.id);
          
          if (accounts && accounts.length > 0) {
            const folderName = portalFolder?.name || 'Portal Registrations';
            for (const account of accounts) {
              // Only send note if filenumber exists (required by SMAX)
              if (account.filenumber && account.filenumber.trim()) {
                const noteData = {
                  filenumber: account.filenumber.trim(),
                  collectorname: 'System',
                  logmessage: `Consumer ${firstName} ${lastName} registered via portal - Moved to ${folderName}. Email: ${email}, DOB: ${dateOfBirth}, Address: ${address}, ${city}, ${state} ${zipCode}. Consumer can now access account and make payments online.`
                };
                
                const smaxResult = await smaxService.insertNote(tenantId, noteData);
                if (smaxResult) {
                  console.log(`✅ SMAX note added for filenumber ${account.filenumber}`);
                } else {
                  console.log(`ℹ️ SMAX note not sent (SMAX may not be configured)`);
                }
              } else {
                console.log(`ℹ️ Skipping SMAX note for account ${account.accountNumber || account.id} - no filenumber`);
              }
            }
          }
        } catch (smaxError) {
          console.error('Failed to send SMAX note:', smaxError);
        }
      }

      return res.json({ 
        message: tenantInfo 
          ? `Registration successful! You are now registered with ${tenantInfo.name}.`
          : "Registration successful! You'll be notified when your agency adds your account information.",
        consumerId: newConsumer.id,
        ...(tenantInfo && { tenant: tenantInfo }),
        consumer: {
          id: newConsumer.id,
          firstName: newConsumer.firstName,
          lastName: newConsumer.lastName,
          email: newConsumer.email,
        },
        needsAgencyLink: true
      });

    } catch (error) {
      console.error("Error during consumer registration:", error);
      // Log more detailed error information
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      
      // Always return detailed error in production for debugging
      const errorDetails = {
        type: error instanceof Error ? error.constructor.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        // Check for specific database errors
        isDatabaseError: error instanceof Error && (
          error.message.includes('relation') || 
          error.message.includes('column') ||
          error.message.includes('violates') ||
          error.message.includes('does not exist')
        ),
        hint: error instanceof Error && error.message.includes('does not exist') 
          ? 'Database table or column may be missing. Run npm run db:push --force in production.'
          : 'Check server configuration and database connection.'
      };
      
      res.status(500).json({ 
        message: "Registration failed - See error details below",
        errorDetails,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Agency trial registration route (public)
  app.post('/api/agencies/register', async (req, res) => {
    console.log("Agency registration request received:", {
      email: req.body.email,
      businessName: req.body.businessName,
      username: req.body.username,
      hasBody: !!req.body
    });
    
    try {
      // Extend validation to include username, password, and businessType
      const registrationWithCredentialsSchema = agencyTrialRegistrationSchema.extend({
        username: z.string().min(3).max(50),
        password: z.string().min(8).max(100),
        businessType: z.enum(['call_center', 'billing_service', 'subscription_provider', 'freelancer_consultant', 'property_management']).optional().default('call_center'),
      });
      
      // Validate the request body
      const validationResult = registrationWithCredentialsSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid input data",
          errors: validationResult.error.errors
        });
      }

      const data = validationResult.data;

      // Check if agency with this email already exists
      const existingTenant = await storage.getTenantByEmail(data.email);
      if (existingTenant) {
        return res.status(400).json({ 
          message: "An agency with this email already exists. Please try logging in instead." 
        });
      }
      
      // Check if username is already taken
      const existingCredentials = await storage.getAgencyCredentialsByUsername(data.username);
      if (existingCredentials) {
        return res.status(400).json({ 
          message: "This username is already taken. Please choose another one." 
        });
      }

      // Generate a unique slug for the agency
      const baseSlug = data.businessName.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      let slug = baseSlug;
      let counter = 1;
      
      // Ensure slug is unique
      while (await storage.getTenantBySlug(slug)) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      // Create the trial tenant
      console.log("Creating trial tenant with slug:", slug);
      const tenant = await storage.createTrialTenant({
        name: data.businessName,
        slug,
        businessType: data.businessType || 'call_center',
        ownerFirstName: data.ownerFirstName,
        ownerLastName: data.ownerLastName,
        ownerDateOfBirth: data.ownerDateOfBirth,
        ownerSSN: data.ownerSSN, // In production, this should be encrypted
        businessName: data.businessName,
        phoneNumber: data.phoneNumber,
        email: data.email,
      });

      // Hash the password
      console.log("Hashing password for username:", data.username);
      const passwordHash = await bcrypt.hash(data.password, 10);
      console.log("Password hashed successfully");
      
      // Create agency credentials for username/password login
      console.log("Creating agency credentials for tenant:", tenant.id);
      await storage.createAgencyCredentials({
        tenantId: tenant.id,
        username: data.username,
        passwordHash,
        email: data.email,
        firstName: data.ownerFirstName,
        lastName: data.ownerLastName,
        role: 'owner',
        isActive: true,
      });

      // Send notification email to support about new registration
      console.log(`New trial agency registered: ${data.businessName} (${data.email})`);
      try {
        const { emailService } = await import('./emailService');
        await emailService.sendEmail({
          to: 'support@chainsoftwaregroup.com',
          subject: `New Company Registration: ${data.businessName}`,
          html: `
            <h2>New Company Registration</h2>
            <p>A new company has registered on the Chain platform:</p>
            <table style="border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px; font-weight: bold;">Company Name:</td><td style="padding: 8px;">${data.businessName}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Owner:</td><td style="padding: 8px;">${data.ownerFirstName} ${data.ownerLastName}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${data.email}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Phone:</td><td style="padding: 8px;">${data.phoneNumber || 'Not provided'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Business Type:</td><td style="padding: 8px;">${data.businessType || 'call_center'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Account Status:</td><td style="padding: 8px;"><strong style="color: #f59e0b;">Trial Account - Awaiting Plan Selection</strong></td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Username:</td><td style="padding: 8px;">${data.username}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Slug:</td><td style="padding: 8px;">${slug}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Registered:</td><td style="padding: 8px;">${new Date().toLocaleString()}</td></tr>
            </table>
            <p><strong>Action Required:</strong> Contact this company to discuss their needs and set up the appropriate plan.</p>
          `,
          tag: 'new-registration-notification',
        });
        console.log('✅ Registration notification email sent to support@chainsoftwaregroup.com');
      } catch (emailError) {
        console.error('Failed to send registration notification email:', emailError);
        // Don't fail the registration if email fails
      }

      res.status(201).json({
        message: "Trial account created successfully! You can now log in with your username and password.",
        tenantId: tenant.id,
        slug: tenant.slug,
        redirectUrl: "/agency-login" // Redirect to the new agency login page
      });

    } catch (error) {
      console.error("Error during agency registration:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      
      // Always return detailed error in production for debugging
      const errorDetails = {
        type: error instanceof Error ? error.constructor.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        // Check for specific database errors
        isDatabaseError: error instanceof Error && (
          error.message.includes('relation') || 
          error.message.includes('column') ||
          error.message.includes('violates') ||
          error.message.includes('does not exist')
        ),
        hint: error instanceof Error && error.message.includes('does not exist') 
          ? 'Database table or column may be missing. Run npm run db:push --force in production.'
          : 'Check server configuration and database connection.'
      };
      
      res.status(500).json({ 
        message: "Registration failed - See error details below",
        errorDetails,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Agency login route (username/password)
  app.post('/api/agency/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      // Get agency credentials
      const credentials = await storage.getAgencyCredentialsByUsername(username);
      
      if (!credentials) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      
      // Check if account is active
      if (!credentials.isActive) {
        return res.status(403).json({ message: "Account has been deactivated. Please contact support." });
      }
      
      // Verify password
      const validPassword = await bcrypt.compare(password, credentials.passwordHash);
      
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      
      // Get tenant information
      const tenant = await storage.getTenant(credentials.tenantId);
      
      if (!tenant) {
        return res.status(500).json({ message: "Agency configuration error. Please contact support." });
      }
      
      // Check if tenant is active
      if (!tenant.isActive) {
        return res.status(403).json({ 
          message: "This agency account has been suspended.", 
          suspensionReason: tenant.suspensionReason 
        });
      }
      
      // Update last login time
      await storage.updateAgencyLoginTime(credentials.id);
      
      // Store session data
      if (!req.session) {
        req.session = {} as any;
      }
      (req.session as any).agencyUser = {
        id: credentials.id,
        username: credentials.username,
        email: credentials.email,
        firstName: credentials.firstName,
        lastName: credentials.lastName,
        role: credentials.role,
        tenantId: credentials.tenantId,
      };
      
      // Generate JWT token with tenant information
      const token = jwt.sign(
        {
          userId: credentials.id,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          username: credentials.username,
          email: credentials.email,
          role: credentials.role,
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );
      
      // Return success with agency data and token
      res.json({
        message: "Login successful",
        token,
        user: {
          id: credentials.id,
          username: credentials.username,
          email: credentials.email,
          firstName: credentials.firstName,
          lastName: credentials.lastName,
          role: credentials.role,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          isTrialAccount: tenant.isTrialAccount,
          isPaidAccount: tenant.isPaidAccount,
        }
      });
      
    } catch (error) {
      console.error("Error during agency login:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Consumer login route
  app.post('/api/consumer/login', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const { email, dateOfBirth, tenantSlug: bodyTenantSlug } = req.body ?? {};
      const rawTenantSlug = bodyTenantSlug || (req as any).agencySlug;
      const tenantSlug = rawTenantSlug ? String(rawTenantSlug).trim().toLowerCase() : undefined;

      console.log("Consumer login attempt:", { email, dateOfBirth, tenantSlug });

      if (!email || !dateOfBirth) {
        return res.status(400).json({ message: "Email and date of birth are required" });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ message: "A valid email address is required" });
      }

      let consumersFound = await storage.getConsumersByEmail(normalizedEmail);

      if (consumersFound.length === 0) {
        return res.status(404).json({
          message: "No account found with this email. Please contact your agency for account details.",
        });
      }

      const unlinkedConsumers = consumersFound.filter(c => !c.tenantId);

      if (unlinkedConsumers.length > 0) {
        const matchingAccounts = await storage.findAccountsByConsumerEmail(normalizedEmail);
        const tenantIds = new Set<string>();
        for (const account of matchingAccounts) {
          if (account.tenantId) {
            tenantIds.add(account.tenantId);
          }
        }

        if (tenantIds.size === 1) {
          const [resolvedTenantId] = Array.from(tenantIds);
          await Promise.all(
            unlinkedConsumers.map(consumer => storage.updateConsumer(consumer.id, { tenantId: resolvedTenantId }))
          );
          console.log(
            `Auto-linked consumer(s) with email ${normalizedEmail} to tenant ${resolvedTenantId} based on matching accounts`
          );
          consumersFound = await storage.getConsumersByEmail(normalizedEmail);
        }
      }

      const linkedConsumers = consumersFound.filter(c => c.tenantId);
      const stillUnlinkedConsumers = consumersFound.filter(c => !c.tenantId);

      let tenant = null;
      let consumer = null;

      if (tenantSlug) {
        tenant = await storage.getTenantBySlug(tenantSlug);

        if (!tenant) {
          return res.status(404).json({ message: "Agency not found" });
        }

        const consumersForTenant = linkedConsumers.filter(c => c.tenantId === tenant!.id);

        if (consumersForTenant.length === 0) {
          if (stillUnlinkedConsumers.length > 0) {
            const consumerCandidate = stillUnlinkedConsumers[0];
            return res.status(409).json({
              message: "Your account needs to be linked to an agency. Please complete registration.",
              needsAgencyLink: true,
              consumer: {
                id: consumerCandidate.id,
                firstName: consumerCandidate.firstName,
                lastName: consumerCandidate.lastName,
                email: consumerCandidate.email,
              },
              suggestedAction: "register",
            });
          }

          return res.status(404).json({
            message: "No account found with this email for this agency. Please contact your agency for account details.",
          });
        }

        consumer = consumersForTenant[0];
      } else {
        if (linkedConsumers.length === 0) {
          if (stillUnlinkedConsumers.length > 0) {
            const consumerCandidate = stillUnlinkedConsumers[0];
            return res.status(409).json({
              message: "Your account needs to be linked to an agency. Please complete registration.",
              needsAgencyLink: true,
              consumer: {
                id: consumerCandidate.id,
                firstName: consumerCandidate.firstName,
                lastName: consumerCandidate.lastName,
                email: consumerCandidate.email,
              },
              suggestedAction: "register",
            });
          }

          return res.status(404).json({
            message: "No account found with this email. Please contact your agency for account details.",
          });
        }

        const agencyResults = await Promise.all(
          linkedConsumers.map(async consumerRecord => {
            if (!consumerRecord.tenantId) return null;
            const tenantRecord = await storage.getTenant(consumerRecord.tenantId);
            if (!tenantRecord) return null;
            return {
              consumerRecord,
              tenantRecord,
            };
          })
        );

        const dedupedAgencies = new Map<string, { consumerRecord: Consumer; tenantRecord: Tenant }>();
        for (const result of agencyResults) {
          if (!result) continue;
          if (!dedupedAgencies.has(result.tenantRecord.id)) {
            dedupedAgencies.set(result.tenantRecord.id, result);
          }
        }

        if (dedupedAgencies.size > 1) {
          return res.status(409).json({
            multipleAgencies: true,
            message: 'Your account is registered with multiple agencies. Please select one:',
            agencies: Array.from(dedupedAgencies.values()).map(({ tenantRecord }) => ({
              id: tenantRecord.id,
              name: tenantRecord.name,
              slug: tenantRecord.slug,
            })),
            email: normalizedEmail,
          });
        }

        const [singleEntry] = Array.from(dedupedAgencies.values());
        if (singleEntry) {
          consumer = singleEntry.consumerRecord;
          tenant = singleEntry.tenantRecord;
        } else {
          consumer = linkedConsumers[0];
        }
      }

      if (!consumer) {
        return res.status(404).json({
          message: "No account found with this email. Please contact your agency for account details.",
        });
      }

      if (!tenant && consumer.tenantId) {
        tenant = await storage.getTenant(consumer.tenantId);
      }

      if (!tenant) {
        return res.status(409).json({
          message: "Your account needs to be linked to an agency. Please complete registration.",
          needsAgencyLink: true,
          consumer: {
            id: consumer.id,
            firstName: consumer.firstName,
            lastName: consumer.lastName,
            email: consumer.email,
          },
          suggestedAction: "register",
        });
      }

      if (!consumer.isRegistered) {
        return res.status(409).json({
          message: "Account found but not yet activated. Complete your registration.",
          needsRegistration: true,
          consumer: {
            id: consumer.id,
            firstName: consumer.firstName,
            lastName: consumer.lastName,
            email: consumer.email,
            tenantId: consumer.tenantId,
          },
          tenant: {
            name: tenant.name,
            slug: tenant.slug,
          },
        });
      }

      if (!consumer.dateOfBirth) {
        return res.status(401).json({ message: "Date of birth verification required. Please contact your agency." });
      }

      if (!datesMatch(dateOfBirth, consumer.dateOfBirth)) {
        return res.status(401).json({ message: "Date of birth verification failed. Please check your information." });
      }

      const token = jwt.sign(
        {
          consumerId: consumer.id,
          email: consumer.email,
          tenantId: consumer.tenantId,
          tenantSlug: tenant.slug,
          type: "consumer",
        },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "7d" }
      );

      // Send SMAX note for consumer login
      if (consumer.tenantId) {
        try {
          const accounts = await storage.getAccountsByConsumer(consumer.id);
          const accountWithFileNumber = accounts.find(acc => acc.filenumber && acc.filenumber.trim());
          
          if (accountWithFileNumber?.filenumber) {
            const loginNote = {
              filenumber: accountWithFileNumber.filenumber.trim(),
              collectorname: 'System',
              logmessage: `Consumer ${consumer.firstName || ''} ${consumer.lastName || ''} logged into online portal. Email: ${consumer.email}${consumer.phone ? `, Phone: ${consumer.phone}` : ''}`
            };
            
            const smaxResult = await smaxService.insertNote(consumer.tenantId, loginNote);
            if (smaxResult) {
              console.log(`✅ SMAX login note added for consumer ${consumer.id}, filenumber ${accountWithFileNumber.filenumber}`);
            } else {
              console.log(`ℹ️ SMAX login note not sent (SMAX may not be configured)`);
            }
          } else {
            console.log(`ℹ️ Skipping SMAX login note for consumer ${consumer.id} - no filenumber found`);
          }
        } catch (smaxError) {
          console.error('Failed to send SMAX login note:', smaxError);
        }
      }

      res.status(200).json({
        token,
        consumer: {
          id: consumer.id,
          firstName: consumer.firstName,
          lastName: consumer.lastName,
          email: consumer.email,
          phone: consumer.phone,
          tenantId: consumer.tenantId,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        tenantSlug: tenant.slug,
      });
    } catch (error) {
      console.error("Error during consumer login:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Push notification token registration
  app.post('/api/consumer/push-token', authenticateConsumer, async (req: any, res) => {
    try {
      const { token, platform } = req.body;
      const { id: consumerId, tenantId } = req.consumer || {};

      if (!consumerId || !tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!token || !platform) {
        return res.status(400).json({ message: "Token and platform are required" });
      }

      // Register the push token
      await storage.registerPushToken({
        tenantId,
        consumerId,
        pushToken: token,
        platform,
      });

      console.log(`✅ Push token registered for consumer ${consumerId} on ${platform}`);

      res.json({ success: true, message: "Push token registered successfully" });
    } catch (error) {
      console.error("Error registering push token:", error);
      res.status(500).json({ message: "Failed to register push token" });
    }
  });

  // Mobile authentication endpoints
  // Step 1: Verify email + DOB and return matching agencies
  app.post('/api/mobile/auth/verify', async (req, res) => {
    console.log('🔥 [MOBILE AUTH] Route handler called!', {
      method: req.method,
      path: req.path,
      body: req.body ? 'present' : 'missing',
      headers: {
        'content-type': req.headers['content-type'],
        origin: req.headers.origin,
        'user-agent': req.headers['user-agent']?.substring(0, 50)
      }
    });
    
    try {
      const { email, dateOfBirth } = req.body;

      if (!email || !dateOfBirth) {
        console.log('❌ [MOBILE AUTH] Missing email or dateOfBirth');
        return res.status(400).json({ message: "Email and date of birth are required" });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ message: "A valid email address is required" });
      }

      // Find all consumers matching email across all agencies
      const allConsumers = await storage.findConsumersByEmailAndDob(normalizedEmail, dateOfBirth);

      // Filter by DOB using datesMatch for flexible date format support
      const matches = allConsumers.filter(consumer => datesMatch(dateOfBirth, consumer.dateOfBirth));

      if (matches.length === 0) {
        return res.status(404).json({
          message: "No account found with this email and date of birth. Please contact your agency.",
        });
      }

      // Filter to only registered consumers
      const registeredMatches = matches.filter(m => m.isRegistered);
      
      if (registeredMatches.length === 0) {
        return res.status(409).json({
          message: "Your account is not yet activated. Please complete registration.",
          needsRegistration: true,
          agencies: matches.map(m => ({
            id: m.tenant.id,
            name: m.tenant.name,
            slug: m.tenant.slug,
          }))
        });
      }

      // Return list of registered agencies only
      const agencies = registeredMatches.map(m => ({
        consumerId: m.id,
        tenantId: m.tenant.id,
        tenantName: m.tenant.name,
        tenantSlug: m.tenant.slug,
      }));

      // If only one agency, auto-select it and return token
      if (agencies.length === 1) {
        const match = registeredMatches[0];
        
        if (!process.env.JWT_SECRET) {
          console.error('JWT_SECRET is not set - cannot generate authentication token');
          return res.status(500).json({ message: "Authentication service not configured" });
        }
        
        const token = jwt.sign(
          {
            consumerId: match.id,
            email: match.email,
            tenantId: match.tenant.id,
            tenantSlug: match.tenant.slug,
            type: "consumer",
          },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );

        return res.status(200).json({
          autoSelected: true,
          token,
          consumer: {
            id: match.id,
            firstName: match.firstName,
            lastName: match.lastName,
            email: match.email,
            phone: match.phone,
            tenantId: match.tenant.id,
          },
          tenant: {
            id: match.tenant.id,
            name: match.tenant.name,
            slug: match.tenant.slug,
          },
        });
      }

      // Multiple agencies found - return list for user to select
      res.status(200).json({
        multipleAgencies: true,
        agencies,
        message: "Your account is registered with multiple agencies. Please select one.",
      });

    } catch (error) {
      console.error("Error during mobile auth verification:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Step 2: Select agency and get JWT token
  app.post('/api/mobile/auth/select-agency', async (req, res) => {
    try {
      const { email, dateOfBirth, tenantId } = req.body;

      if (!email || !dateOfBirth || !tenantId) {
        return res.status(400).json({ message: "Email, date of birth, and agency selection are required" });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ message: "A valid email address is required" });
      }

      // Find all consumers matching email across all agencies
      const allConsumers = await storage.findConsumersByEmailAndDob(normalizedEmail, dateOfBirth);
      
      // Filter by DOB using datesMatch for flexible date format support
      const matches = allConsumers.filter(consumer => datesMatch(dateOfBirth, consumer.dateOfBirth));

      // Find the specific match for the selected tenant
      const selectedMatch = matches.find(m => m.tenant.id === tenantId);

      if (!selectedMatch) {
        return res.status(404).json({
          message: "No account found for the selected agency with this email and date of birth.",
        });
      }

      // Verify consumer is registered before issuing token
      if (!selectedMatch.isRegistered) {
        return res.status(409).json({
          message: "Your account is not yet activated. Please complete registration.",
          needsRegistration: true,
          tenant: {
            id: selectedMatch.tenant.id,
            name: selectedMatch.tenant.name,
            slug: selectedMatch.tenant.slug,
          }
        });
      }

      // Require JWT_SECRET to be set
      if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET is not set - cannot generate authentication token');
        return res.status(500).json({ message: "Authentication service not configured" });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          consumerId: selectedMatch.id,
          email: selectedMatch.email,
          tenantId: selectedMatch.tenant.id,
          tenantSlug: selectedMatch.tenant.slug,
          type: "consumer",
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.status(200).json({
        token,
        consumer: {
          id: selectedMatch.id,
          firstName: selectedMatch.firstName,
          lastName: selectedMatch.lastName,
          email: selectedMatch.email,
          phone: selectedMatch.phone,
          tenantId: selectedMatch.tenant.id,
        },
        tenant: {
          id: selectedMatch.tenant.id,
          name: selectedMatch.tenant.name,
          slug: selectedMatch.tenant.slug,
        },
      });

    } catch (error) {
      console.error("Error during mobile agency selection:", error);
      res.status(500).json({ message: "Agency selection failed" });
    }
  });

  // Consumer notifications route
  app.get('/api/consumer-notifications/:email/:tenantSlug', authenticateConsumer, async (req: any, res) => {
    try {
      const { email, tenantSlug } = req.params;
      const { email: tokenEmail, tenantId, tenantSlug: tokenTenantSlug, id: consumerId } = req.consumer || {};

      const normalizedParamEmail = normalizeLowercase(email);
      const normalizedTokenEmail = normalizeLowercase(tokenEmail);
      if (!normalizedTokenEmail || normalizedParamEmail !== normalizedTokenEmail) {
        return res.status(403).json({ message: "Access denied" });
      }

      const normalizedRequestedTenantSlug = normalizeLowercase(tenantSlug);
      if (!normalizedRequestedTenantSlug) {
        return res.status(400).json({ message: "Tenant slug required" });
      }

      let tenantSlugMatch = normalizeLowercase(tokenTenantSlug);
      let tenant = tenantId ? await storage.getTenant(tenantId) : undefined;

      if (!tenant && tokenTenantSlug) {
        tenant = await storage.getTenantBySlug(tokenTenantSlug);
      }

      if (!tenant && tenantSlug) {
        tenant = await storage.getTenantBySlug(tenantSlug);
      }

      if (tenant) {
        tenantSlugMatch = normalizeLowercase(tenant.slug);
      }

      if (!tenantSlugMatch || tenantSlugMatch !== normalizedRequestedTenantSlug) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      if (!consumerId) {
        return res.status(401).json({ message: "No consumer access" });
      }

      const consumer = await storage.getConsumer(consumerId);
      if (!consumer || normalizeLowercase(consumer.email) !== normalizedTokenEmail || consumer.tenantId !== tenant.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const notifications = await storage.getNotificationsByConsumer(consumer.id);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching consumer notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // Mark notification as read
  app.patch('/api/consumer-notifications/:id/read', authenticateConsumer, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { id: consumerId } = req.consumer || {};

      if (!consumerId) {
        return res.status(401).json({ message: "No consumer access" });
      }

      const notifications = await storage.getNotificationsByConsumer(consumerId);
      const notification = notifications.find(item => item.id === id);

      if (!notification) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.markNotificationRead(id);
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Test database endpoint for debugging production issues
  app.get('/api/test-db', async (req, res) => {
    console.log("Testing database connection...");
    try {
      // Try to query the tenants table
      const testTenants = await db.select().from(tenants).limit(1);
      console.log("Tenants query successful:", testTenants.length);
      
      // Try to query the consumers table  
      const testConsumers = await db.select().from(consumers).limit(1);
      console.log("Consumers query successful:", testConsumers.length);
      
      // Try to query the agency_credentials table
      const testCredentials = await db.select().from(agencyCredentials).limit(1);
      console.log("Agency credentials query successful:", testCredentials.length);
      
      res.json({ 
        status: 'ok',
        message: 'Database connection successful',
        tables: {
          tenants: 'exists',
          consumers: 'exists', 
          agencyCredentials: 'exists'
        }
      });
    } catch (error) {
      console.error("Database test failed:", error);
      res.status(500).json({ 
        status: 'error',
        message: 'Database test failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Fix production database schema
  app.post('/api/fix-production-db', async (req, res) => {
    try {
      console.log("Starting production database fix...");
      
      // Fix tenants table
      await db.execute(sql`
        ALTER TABLE tenants 
        ADD COLUMN IF NOT EXISTS is_trial_account BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS is_paid_account BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS owner_first_name TEXT,
        ADD COLUMN IF NOT EXISTS owner_last_name TEXT,
        ADD COLUMN IF NOT EXISTS owner_date_of_birth TEXT,
        ADD COLUMN IF NOT EXISTS owner_ssn TEXT,
        ADD COLUMN IF NOT EXISTS business_name TEXT,
        ADD COLUMN IF NOT EXISTS phone_number TEXT
      `);
      console.log("Fixed tenants table columns");
      
      // Fix consumers table
      await db.execute(sql`
        ALTER TABLE consumers
        ADD COLUMN IF NOT EXISTS registration_date TIMESTAMP
      `);
      console.log("Fixed consumers table columns");
      
      // Create agency_credentials table if missing
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS agency_credentials (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          last_login TIMESTAMP
        )
      `);
      console.log("Ensured agency_credentials table exists");
      
      res.json({ 
        status: 'success',
        message: 'Production database schema fixed successfully',
        fixes: [
          'Added missing columns to tenants table',
          'Added missing columns to consumers table',
          'Ensured agency_credentials table exists'
        ]
      });
    } catch (error) {
      console.error("Error fixing production database:", error);
      res.status(500).json({ 
        status: 'error',
        message: 'Failed to fix production database',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Public agency information route for custom landing pages
  app.get('/api/public/agency/:agencySlug', async (req, res) => {
    try {
      const { agencySlug } = req.params;
      
      const tenant = await storage.getTenantBySlug(agencySlug);
      if (!tenant) {
        return res.status(404).json({ message: "Agency not found" });
      }

      // Only return if agency is active
      if (!tenant.isActive) {
        return res.status(404).json({ message: "Agency not found" });
      }

      // Get tenant settings for branding and contact info
      const tenantSettings = await storage.getTenantSettings(tenant.id);

      // Return public-safe information only
      res.json({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        tenantSettings: {
          contactEmail: tenantSettings?.contactEmail,
          contactPhone: tenantSettings?.contactPhone,
          privacyPolicy: tenantSettings?.privacyPolicy,
          termsOfService: tenantSettings?.termsOfService,
          customBranding: tenantSettings?.customBranding,
        }
      });
    } catch (error) {
      console.error("Error fetching public agency info:", error);
      res.status(500).json({ message: "Failed to fetch agency information" });
    }
  });

  // Universal app download route with device detection
  app.get('/app', async (req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    
    // Platform-wide app store URLs
    const ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=com.chainsoftware.platform';
    const IOS_APP_URL = ''; // Will be added when iOS app is ready
    
    // Detect device type
    const isAndroid = /android/i.test(userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(userAgent);
    
    if (isAndroid && ANDROID_APP_URL) {
      return res.redirect(ANDROID_APP_URL);
    }
    
    if (isIOS && IOS_APP_URL) {
      return res.redirect(IOS_APP_URL);
    }
    
    // Desktop or unrecognized - show download page with both options
    const downloadPageHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Download Chain App</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            padding: 3rem;
            border-radius: 1rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 500px;
            margin: 2rem;
          }
          h1 {
            color: #333;
            margin-bottom: 0.5rem;
            font-size: 2rem;
          }
          p {
            color: #666;
            margin-bottom: 2rem;
            font-size: 1.1rem;
          }
          .download-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem 2rem;
            margin: 0.5rem;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 0.5rem;
            font-weight: 600;
            font-size: 1rem;
            transition: all 0.2s;
          }
          .download-btn:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          }
          .download-btn.disabled {
            background: #ccc;
            cursor: not-allowed;
            opacity: 0.6;
          }
          .download-btn.disabled:hover {
            transform: none;
            box-shadow: none;
          }
          .icon {
            width: 24px;
            height: 24px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Download Chain App</h1>
          <p>Get the Chain app on your mobile device</p>
          ${ANDROID_APP_URL ? `
            <a href="${ANDROID_APP_URL}" class="download-btn">
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4483-.9993.9993-.9993c.5511 0 .9993.4483.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4483.9993.9993 0 .5511-.4483.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396"/>
              </svg>
              Download for Android
            </a>
          ` : ''}
          ${IOS_APP_URL ? `
            <a href="${IOS_APP_URL}" class="download-btn">
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Download for iOS
            </a>
          ` : `
            <div class="download-btn disabled">
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              iOS Coming Soon
            </div>
          `}
        </div>
      </body>
      </html>
    `;
    
    res.send(downloadPageHtml);
  });

  // Tenant-specific app download route
  app.get('/:tenantSlug/app', async (req, res) => {
    const { tenantSlug } = req.params;
    const userAgent = req.headers['user-agent'] || '';
    
    // Verify tenant exists
    try {
      const tenant = await storage.getTenantBySlug(tenantSlug);
      if (!tenant || !tenant.isActive) {
        return res.status(404).send('Agency not found');
      }
    } catch (error) {
      console.error('Error fetching tenant:', error);
      return res.status(500).send('Error loading agency');
    }
    
    // Platform-wide app store URLs (same app for all tenants)
    const ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=com.chainsoftware.platform';
    const IOS_APP_URL = ''; // Will be added when iOS app is ready
    
    // Detect device type
    const isAndroid = /android/i.test(userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(userAgent);
    
    if (isAndroid && ANDROID_APP_URL) {
      return res.redirect(ANDROID_APP_URL);
    }
    
    if (isIOS && IOS_APP_URL) {
      return res.redirect(IOS_APP_URL);
    }
    
    // Desktop - redirect to generic /app page
    return res.redirect('/app');
  });

  // Callback request route (public)
  app.post('/api/callback-request', async (req, res) => {
    try {
      const { 
        tenantSlug, 
        consumerEmail, 
        requestType, 
        preferredTime, 
        phoneNumber, 
        emailAddress, 
        subject, 
        message 
      } = req.body;

      if (!tenantSlug || !consumerEmail || !requestType) {
        return res.status(400).json({ message: "Required fields missing" });
      }

      const consumer = await storage.getConsumerByEmailAndTenant(consumerEmail, tenantSlug);
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      const tenant = await storage.getTenantBySlug(tenantSlug);
      if (!tenant) {
        return res.status(404).json({ message: "Agency not found" });
      }

      const callbackRequest = await storage.createCallbackRequest({
        tenantId: tenant.id,
        consumerId: consumer.id,
        requestType,
        preferredTime,
        phoneNumber,
        emailAddress,
        subject,
        message,
      });

      res.json({ message: "Request submitted successfully", requestId: callbackRequest.id });
    } catch (error) {
      console.error("Error creating callback request:", error);
      res.status(500).json({ message: "Failed to submit request" });
    }
  });

  // Admin callback requests route
  app.get('/api/callback-requests', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const requests = await storage.getCallbackRequestsByTenant(tenantId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching callback requests:", error);
      res.status(500).json({ message: "Failed to fetch callback requests" });
    }
  });

  // Update callback request (admin)
  app.patch('/api/callback-requests/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const updates = req.body;

      // Add resolved timestamp if status is being changed to completed
      if (updates.status === 'completed' && !updates.resolvedAt) {
        updates.resolvedAt = new Date();
      }

      const updatedRequest = await storage.updateCallbackRequest(id, updates);
      res.json(updatedRequest);
    } catch (error) {
      console.error("Error updating callback request:", error);
      res.status(500).json({ message: "Failed to update callback request" });
    }
  });

  // Delete callback request (admin)
  app.delete('/api/callback-requests/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;

      await storage.deleteCallbackRequest(id, tenantId);
      res.json({ message: "Request deleted successfully" });
    } catch (error) {
      console.error("Error deleting callback request:", error);
      res.status(500).json({ message: "Failed to delete callback request" });
    }
  });

  // Tenant setup route (for fixing access issues)
  app.post('/api/setup-tenant', authenticateUser, async (req: any, res) => {
    try {
      const userId = req.user?.userId;
      const { name, slug } = req.body || {};
      
      // Check if user already has a tenant
      const existingPlatformUser = await storage.getPlatformUser(userId);
      if (existingPlatformUser?.tenantId) {
        return res.status(400).json({ message: "User already has tenant access" });
      }

      const result = await storage.setupTenantForUser(userId, {
        name: name || "My Agency",
        slug: slug || "agency-" + Date.now(),
      });

      res.json({ 
        message: "Tenant setup successful",
        tenant: result.tenant,
        platformUser: result.platformUser 
      });
    } catch (error) {
      console.error("Error setting up tenant:", error);
      res.status(500).json({ message: "Failed to setup tenant" });
    }
  });

  // Document routes
  app.get('/api/documents', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const documents = await storage.getDocumentsByTenant(tenantId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post('/api/documents', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
      const fileUrl = typeof req.body?.fileUrl === "string" ? req.body.fileUrl.trim() : "";
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim() : "";
      const description = typeof req.body?.description === "string" ? req.body.description.trim() : undefined;
      const isPublic = Boolean(req.body?.isPublic);
      const rawFileSize = req.body?.fileSize;

      if (!title || !fileName || !fileUrl || !mimeType) {
        return res.status(400).json({ message: "Title, file name, file URL, and mime type are required" });
      }

      const fileSize = typeof rawFileSize === "number" ? rawFileSize : Number(rawFileSize);
      if (!Number.isFinite(fileSize) || fileSize <= 0) {
        return res.status(400).json({ message: "File size must be a positive number" });
      }

      let accountId: string | null = null;

      if (!isPublic) {
        const submittedAccountId = typeof req.body?.accountId === "string" ? req.body.accountId.trim() : "";

        if (!submittedAccountId) {
          return res.status(400).json({ message: "Account is required when document is not shared with all consumers" });
        }

        const account = await storage.getAccount(submittedAccountId);
        if (!account || account.tenantId !== tenantId) {
          return res.status(400).json({ message: "Selected account could not be found" });
        }

        accountId = account.id;
      }

      const document = await storage.createDocument({
        tenantId,
        accountId,
        title,
        description,
        fileName,
        fileUrl,
        fileSize,
        mimeType,
        isPublic,
      });

      res.json(document);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  app.delete('/api/documents/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const deleted = await storage.deleteDocument(req.params.id, tenantId);

      if (!deleted) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  const planTypeSet = new Set(arrangementPlanTypes);

  const parseCurrencyInput = (value: unknown): number | null => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return null;
      }
      return Math.round(value);
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const numeric = Number(trimmed);
      if (Number.isNaN(numeric)) {
        return null;
      }
      if (trimmed.includes('.')) {
        return Math.round(numeric * 100);
      }
      return Math.round(numeric);
    }

    return null;
  };

  const parseOptionalInteger = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return null;
      }
      return Math.trunc(value);
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const numeric = Number(trimmed);
      if (Number.isNaN(numeric)) {
        return null;
      }
      return Math.trunc(numeric);
    }

    return null;
  };

  const sanitizeOptionalText = (value: unknown): string | null => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const parsePercentageInput = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return null;
      }
      if (value > 100 && value <= 10000 && Number.isInteger(value)) {
        return Math.trunc(value);
      }
      return Math.round(value * 100);
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const numeric = Number(trimmed.replace(/%$/, ""));
      if (Number.isNaN(numeric)) {
        return null;
      }
      return Math.round(numeric * 100);
    }

    return null;
  };

  const parseDateInput = (value: unknown): string | null => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return null;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return trimmed;
  };

  const buildArrangementOptionPayload = (body: any, tenantId: string): InsertArrangementOption => {
    const planTypeRaw = typeof body.planType === "string" ? body.planType : "range";
    const planType = planTypeSet.has(planTypeRaw as any) ? (planTypeRaw as InsertArrangementOption["planType"]) : "range";

    // Accept balanceTier if provided, otherwise use min/max balances for backward compatibility
    const balanceTier = typeof body.balanceTier === "string" && body.balanceTier ? body.balanceTier : null;
    
    let minBalance: number | null;
    let maxBalance: number | null;
    
    if (balanceTier) {
      // Balance tier is provided - use it (already includes min/max from frontend)
      minBalance = parseCurrencyInput(body.minBalance);
      maxBalance = parseCurrencyInput(body.maxBalance);
    } else {
      // Legacy: min/max provided directly
      minBalance = parseCurrencyInput(body.minBalance);
      maxBalance = parseCurrencyInput(body.maxBalance);
    }

    if (minBalance === null || maxBalance === null) {
      const error = new Error("Minimum and maximum balances must be valid numbers");
      (error as any).statusCode = 400;
      throw error;
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      const error = new Error("Plan name is required");
      (error as any).statusCode = 400;
      throw error;
    }

    const monthlyPaymentMin = parseCurrencyInput(body.monthlyPaymentMin);
    const monthlyPaymentMax = parseCurrencyInput(body.monthlyPaymentMax);
    const fixedMonthlyPayment = parseCurrencyInput(body.fixedMonthlyPayment ?? body.fixedMonthlyAmount);
    const payInFullAmount = parseCurrencyInput(body.payInFullAmount ?? body.payoffAmount);
    const payoffPercentage = parsePercentageInput(
      body.payoffPercentageBasisPoints ?? body.payoffPercentage ?? body.payoffPercent ?? body.payoffPercentageBps
    );
    const payoffDueDate = parseDateInput(body.payoffDueDate);
    const payoffText = sanitizeOptionalText(body.payoffText ?? body.payInFullText ?? body.payoffCopy);
    const customTermsText = sanitizeOptionalText(body.customTermsText ?? body.customCopy);
    const maxTermMonths = parseOptionalInteger(body.maxTermMonths);
    const description = sanitizeOptionalText(body.description);
    const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

    // Parse settlementPaymentCounts as array
    const settlementPaymentCounts = Array.isArray(body.settlementPaymentCounts) 
      ? body.settlementPaymentCounts.map((c: number | string) => parseOptionalInteger(c)).filter((c: number | null): c is number => c !== null)
      : [];
    const settlementPaymentFrequency = typeof body.settlementPaymentFrequency === "string" ? body.settlementPaymentFrequency.trim() : null;
    const settlementOfferExpiresDate = parseDateInput(body.settlementOfferExpiresDate);

    const candidate = {
      tenantId,
      name,
      description,
      balanceTier: balanceTier || undefined,
      minBalance,
      maxBalance,
      planType,
      monthlyPaymentMin: planType === "range" ? monthlyPaymentMin : null,
      monthlyPaymentMax: planType === "range" ? monthlyPaymentMax : null,
      fixedMonthlyPayment: planType === "fixed_monthly" ? fixedMonthlyPayment : null,
      payInFullAmount: null,
      payoffText: planType === "settlement" ? payoffText : null,
      payoffPercentageBasisPoints: planType === "settlement" ? payoffPercentage : null,
      payoffDueDate: null,
      settlementPaymentCounts: planType === "settlement" ? settlementPaymentCounts : null,
      settlementPaymentFrequency: planType === "settlement" ? settlementPaymentFrequency : null,
      settlementOfferExpiresDate: planType === "settlement" ? settlementOfferExpiresDate : null,
      customTermsText: planType === "custom_terms" ? customTermsText : null,
      maxTermMonths:
        planType === "settlement" || planType === "custom_terms"
          ? null
          : planType === "range"
            ? maxTermMonths ?? 12
            : maxTermMonths,
      isActive,
    } satisfies Partial<InsertArrangementOption> as InsertArrangementOption;

    const parsed = insertArrangementOptionSchema.safeParse(candidate);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Invalid arrangement option";
      const error = new Error(message);
      (error as any).statusCode = 400;
      throw error;
    }

    return parsed.data;
  };

  // Arrangement options routes
  app.get('/api/arrangement-options', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const options = await storage.getArrangementOptionsByTenant(tenantId);
      res.json(options);
    } catch (error) {
      console.error("Error fetching arrangement options:", error);
      res.status(500).json({ message: "Failed to fetch arrangement options" });
    }
  });

  app.post('/api/arrangement-options', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const payload = buildArrangementOptionPayload(req.body, tenantId);
      const option = await storage.createArrangementOption(payload);

      res.json(option);
    } catch (error) {
      console.error("Error creating arrangement option:", error);
      const statusCode = error instanceof z.ZodError || (error as any)?.statusCode === 400 ? 400 : 500;
      res.status(statusCode).json({
        message:
          statusCode === 400
            ? (error as any)?.message || "Invalid arrangement option payload"
            : "Failed to create arrangement option",
      });
    }
  });

  app.put('/api/arrangement-options/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const payload = buildArrangementOptionPayload(req.body, tenantId);
      const option = await storage.updateArrangementOption(req.params.id, tenantId, payload);

      if (!option) {
        return res.status(404).json({ message: "Arrangement option not found" });
      }

      res.json(option);
    } catch (error) {
      console.error("Error updating arrangement option:", error);
      const statusCode = error instanceof z.ZodError || (error as any)?.statusCode === 400 ? 400 : 500;
      res.status(statusCode).json({
        message:
          statusCode === 400
            ? (error as any)?.message || "Invalid arrangement option payload"
            : "Failed to update arrangement option",
      });
    }
  });

  app.delete('/api/arrangement-options/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const deleted = await storage.deleteArrangementOption(req.params.id, tenantId);

      if (!deleted) {
        return res.status(404).json({ message: "Arrangement option not found" });
      }

      res.json({ message: "Arrangement option deleted successfully" });
    } catch (error) {
      console.error("Error deleting arrangement option:", error);
      res.status(500).json({ message: "Failed to delete arrangement option" });
    }
  });

  // Tenant settings routes
  app.get('/api/settings', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Get settings from both tenant and tenantSettings tables
      const settings = await storage.getTenantSettings(tenantId);
      const tenant = await storage.getTenant(tenantId);
      
      // Combine settings with Twilio and email settings from tenant
      const combinedSettings = {
        ...(settings || {}),
        twilioAccountSid: tenant?.twilioAccountSid || '',
        twilioAuthToken: tenant?.twilioAuthToken || '',
        twilioPhoneNumber: tenant?.twilioPhoneNumber || '',
        twilioBusinessName: tenant?.twilioBusinessName || '',
        twilioCampaignId: tenant?.twilioCampaignId || '',
        customSenderEmail: tenant?.customSenderEmail || '',
        isTrialAccount: tenant?.isTrialAccount || false,
        // Service access flags
        emailServiceEnabled: tenant?.emailServiceEnabled ?? true,
        smsServiceEnabled: tenant?.smsServiceEnabled ?? true,
        paymentProcessingEnabled: tenant?.paymentProcessingEnabled ?? true,
        portalAccessEnabled: tenant?.portalAccessEnabled ?? true,
        // Redact sensitive SMAX credentials in response
        smaxApiKey: settings?.smaxApiKey ? '••••••••' : '',
        smaxPin: settings?.smaxPin ? '••••••••' : '',
      };

      const maskedSettings = { ...combinedSettings } as typeof combinedSettings;

      // Mask USAePay credentials
      if (settings?.merchantApiKey) {
        maskedSettings.merchantApiKey = `****${settings.merchantApiKey.slice(-4)}`;
      }

      if (settings?.merchantApiPin) {
        maskedSettings.merchantApiPin = '****';
      }

      // Mask Authorize.net credentials
      if (settings?.authnetApiLoginId) {
        maskedSettings.authnetApiLoginId = `****${settings.authnetApiLoginId.slice(-4)}`;
      }

      if (settings?.authnetTransactionKey) {
        maskedSettings.authnetTransactionKey = '****';
      }

      if (settings?.authnetPublicClientKey) {
        maskedSettings.authnetPublicClientKey = `****${settings.authnetPublicClientKey.slice(-4)}`;
      }

      // Mask NMI credentials
      if (settings?.nmiSecurityKey) {
        maskedSettings.nmiSecurityKey = `****${settings.nmiSecurityKey.slice(-4)}`;
      }

      res.json(maskedSettings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.put('/api/settings', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Validate and filter the settings data
      const settingsSchema = z.object({
        privacyPolicy: z.string().nullable().optional(),
        termsOfService: z.string().nullable().optional(),
        contactEmail: z.string().email().nullable().optional(),
        contactPhone: z.string().nullable().optional(),
        showPaymentPlans: z.boolean().optional(),
        showDocuments: z.boolean().optional(),
        allowSettlementRequests: z.boolean().optional(),
        customBranding: z.any().optional().refine((val) => {
          // If customBranding has customLandingPageUrl, validate it
          if (val && val.customLandingPageUrl) {
            const url = val.customLandingPageUrl;
            // Only allow http:// or https:// URLs
            return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
          }
          return true;
        }, {
          message: "Custom landing page URL must start with http:// or https://"
        }),
        consumerPortalSettings: z.any().optional(),
        smsThrottleLimit: z.number().min(1).max(1000).optional(),
        minimumMonthlyPayment: z.number().min(0).optional(),
        blockedAccountStatuses: z.array(z.string()).optional(),
        enabledAddons: z.array(z.string()).optional(), // Add-on features like document_signing
        businessType: z.string().optional(), // Only platform_admin can change this
        // Email configuration per tenant
        customSenderEmail: z.string().email().nullable().optional().or(z.literal('')),
        // Twilio configuration per tenant
        twilioAccountSid: z.string().nullable().optional(),
        twilioAuthToken: z.string().nullable().optional(),
        twilioPhoneNumber: z.string().nullable().optional(),
        twilioBusinessName: z.string().nullable().optional(),
        twilioCampaignId: z.string().nullable().optional(),
        // SMAX integration configuration
        smaxEnabled: z.boolean().optional(),
        smaxApiKey: z.string().nullable().optional(),
        smaxPin: z.string().nullable().optional(),
        smaxBaseUrl: z.string().nullable().optional(),
        // Payment processor configuration (USAePay and Authorize.net)
        merchantProvider: z.string().nullable().optional(),
        merchantAccountId: z.string().nullable().optional(),
        merchantApiKey: z.string().nullable().optional(),
        merchantApiPin: z.string().nullable().optional(),
        merchantName: z.string().nullable().optional(),
        merchantType: z.string().nullable().optional(),
        // Authorize.net configuration
        authnetApiLoginId: z.string().nullable().optional(),
        authnetTransactionKey: z.string().nullable().optional(),
        authnetPublicClientKey: z.string().nullable().optional(),
        // NMI configuration
        nmiSecurityKey: z.string().nullable().optional(),
        useSandbox: z.boolean().optional(),
        enableOnlinePayments: z.boolean().optional(),
        // Consumer portal payment restrictions
        forceArrangement: z.boolean().optional(),
      });

      const validatedData = settingsSchema.parse(req.body);
      
      // CRITICAL DEBUG: Log exactly what's being received
      console.log('🔍 [Settings Save] RAW REQUEST BODY authnetPublicClientKey:', {
        rawValue: req.body.authnetPublicClientKey,
        type: typeof req.body.authnetPublicClientKey,
        length: req.body.authnetPublicClientKey?.length || 0,
        containsWaypoint: req.body.authnetPublicClientKey?.includes?.('Waypoint') || false,
        tenantId: req.user.tenantId,
        userEmail: req.user.email,
      });
      
      // Authorization check: Only platform_admin can change businessType
      if (validatedData.businessType !== undefined && req.user.role !== 'platform_admin') {
        return res.status(403).json({ 
          message: "Only global administrators can change the business type" 
        });
      }

      // Separate Twilio and email settings from other settings
      const { 
        twilioAccountSid, 
        twilioAuthToken, 
        twilioPhoneNumber, 
        twilioBusinessName, 
        twilioCampaignId,
        customSenderEmail,
        smaxApiKey,
        smaxPin,
        merchantApiKey,
        merchantApiPin,
        authnetApiLoginId,
        authnetTransactionKey,
        authnetPublicClientKey,
        nmiSecurityKey,
        ...otherSettings
      } = validatedData;

      // Preserve SMAX credentials if they're submitted as masked values
      const currentSettings = await storage.getTenantSettings(tenantId);
      const finalSmaxApiKey = (smaxApiKey && smaxApiKey !== '••••••••') ? smaxApiKey?.trim() : currentSettings?.smaxApiKey;
      const finalSmaxPin = (smaxPin && smaxPin !== '••••••••') ? smaxPin?.trim() : currentSettings?.smaxPin;

      // Preserve USAePay credentials if they're submitted as masked values
      let finalMerchantApiKey = merchantApiKey?.trim();
      if (typeof merchantApiKey === 'string' && merchantApiKey.startsWith('****') && currentSettings?.merchantApiKey) {
        finalMerchantApiKey = currentSettings.merchantApiKey;
      }

      let finalMerchantApiPin = merchantApiPin?.trim();
      if (typeof merchantApiPin === 'string' && merchantApiPin === '****' && currentSettings?.merchantApiPin) {
        finalMerchantApiPin = currentSettings.merchantApiPin;
      }

      // Preserve Authorize.net credentials if they're submitted as masked values
      let finalAuthnetApiLoginId = authnetApiLoginId?.trim();
      if (typeof authnetApiLoginId === 'string' && authnetApiLoginId.startsWith('****') && currentSettings?.authnetApiLoginId) {
        finalAuthnetApiLoginId = currentSettings.authnetApiLoginId;
      }

      let finalAuthnetTransactionKey = authnetTransactionKey?.trim();
      if (typeof authnetTransactionKey === 'string' && authnetTransactionKey === '****' && currentSettings?.authnetTransactionKey) {
        finalAuthnetTransactionKey = currentSettings.authnetTransactionKey;
      }

      let finalAuthnetPublicClientKey = authnetPublicClientKey?.trim();
      
      console.log('🔍 [Settings Save Debug] Authorize.net Public Client Key:', {
        received: authnetPublicClientKey,
        trimmed: finalAuthnetPublicClientKey,
        currentInDb: currentSettings?.authnetPublicClientKey,
        tenantId: tenantId,
      });
      
      // Only preserve existing value if it's masked AND the current value doesn't contain invalid text
      if (typeof authnetPublicClientKey === 'string' && 
          authnetPublicClientKey.startsWith('****') && 
          currentSettings?.authnetPublicClientKey &&
          !currentSettings.authnetPublicClientKey.includes('Waypoint') &&
          !currentSettings.authnetPublicClientKey.includes('Solutions')) {
        console.log('🔍 [Settings Save] Preserving existing Public Client Key (masked value received)');
        finalAuthnetPublicClientKey = currentSettings.authnetPublicClientKey;
      } else if (typeof authnetPublicClientKey === 'string' && authnetPublicClientKey.startsWith('****')) {
        // If masked but current DB value is invalid, set to undefined so user can re-enter
        console.log('🔍 [Settings Save] Current value contains invalid text, clearing it');
        finalAuthnetPublicClientKey = undefined;
      }
      
      console.log('🔍 [Settings Save] Final Public Client Key to save:', finalAuthnetPublicClientKey);

      // Preserve NMI credentials if they're submitted as masked values
      let finalNmiSecurityKey = nmiSecurityKey?.trim();
      if (typeof nmiSecurityKey === 'string' && nmiSecurityKey.startsWith('****') && currentSettings?.nmiSecurityKey) {
        finalNmiSecurityKey = currentSettings.nmiSecurityKey;
      }

      // Update tenant table with Twilio and email settings if any provided
      if (twilioAccountSid !== undefined || 
          twilioAuthToken !== undefined || 
          twilioPhoneNumber !== undefined || 
          twilioBusinessName !== undefined || 
          twilioCampaignId !== undefined ||
          customSenderEmail !== undefined) {
        await storage.updateTenantTwilioSettings(tenantId, {
          twilioAccountSid: twilioAccountSid || null,
          twilioAuthToken: twilioAuthToken || null,
          twilioPhoneNumber: twilioPhoneNumber || null,
          twilioBusinessName: twilioBusinessName || null,
          twilioCampaignId: twilioCampaignId || null,
          customSenderEmail: customSenderEmail || null,
        });
      }
      
      // Update tenant businessType if provided (already authorized above)
      if (validatedData.businessType !== undefined) {
        await db
          .update(tenants)
          .set({ businessType: validatedData.businessType })
          .where(eq(tenants.id, tenantId));
        console.log(`✅ Updated tenant businessType to: ${validatedData.businessType}`);
      }

      // Update tenant settings table with other settings
      const tenantSettingsPayload: any = {
        ...otherSettings,
        smaxApiKey: finalSmaxApiKey,
        smaxPin: finalSmaxPin,
        tenantId: tenantId,
      };

      // Add USAePay credentials to payload if provided
      if (merchantApiKey !== undefined) {
        tenantSettingsPayload.merchantApiKey = finalMerchantApiKey || null;
      }

      if (merchantApiPin !== undefined) {
        tenantSettingsPayload.merchantApiPin = finalMerchantApiPin || null;
      }

      // Add Authorize.net credentials to payload if provided
      if (authnetApiLoginId !== undefined) {
        tenantSettingsPayload.authnetApiLoginId = finalAuthnetApiLoginId || null;
      }

      if (authnetTransactionKey !== undefined) {
        tenantSettingsPayload.authnetTransactionKey = finalAuthnetTransactionKey || null;
      }

      if (authnetPublicClientKey !== undefined) {
        tenantSettingsPayload.authnetPublicClientKey = finalAuthnetPublicClientKey || null;
      } else {
        // If authnetPublicClientKey is not provided in the update, check if existing value needs to be cleared
        if (currentSettings?.authnetPublicClientKey && 
            (currentSettings.authnetPublicClientKey.includes('Waypoint') || 
             currentSettings.authnetPublicClientKey.includes('Solutions'))) {
          console.log('🔍 [Settings Save] Clearing invalid existing Public Client Key even though not in payload');
          tenantSettingsPayload.authnetPublicClientKey = null;
        }
      }

      // Add NMI credentials to payload if provided
      if (nmiSecurityKey !== undefined) {
        tenantSettingsPayload.nmiSecurityKey = finalNmiSecurityKey || null;
      }

      const updatedSettings = await storage.upsertTenantSettings(tenantSettingsPayload as any);

      const maskedUpdatedSettings = { ...updatedSettings } as typeof updatedSettings;

      // Mask USAePay credentials in response
      if (updatedSettings.merchantApiKey) {
        maskedUpdatedSettings.merchantApiKey = `****${updatedSettings.merchantApiKey.slice(-4)}`;
      }

      if (updatedSettings.merchantApiPin) {
        maskedUpdatedSettings.merchantApiPin = '****';
      }

      // Mask Authorize.net credentials in response
      if (updatedSettings.authnetApiLoginId) {
        maskedUpdatedSettings.authnetApiLoginId = `****${updatedSettings.authnetApiLoginId.slice(-4)}`;
      }

      if (updatedSettings.authnetTransactionKey) {
        maskedUpdatedSettings.authnetTransactionKey = '****';
      }

      if (updatedSettings.authnetPublicClientKey) {
        maskedUpdatedSettings.authnetPublicClientKey = `****${updatedSettings.authnetPublicClientKey.slice(-4)}`;
      }

      // Mask NMI credentials in response
      if (updatedSettings.nmiSecurityKey) {
        maskedUpdatedSettings.nmiSecurityKey = `****${updatedSettings.nmiSecurityKey.slice(-4)}`;
      }

      res.json(maskedUpdatedSettings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Business Services Module Management
  app.get('/api/settings/enabled-modules', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const enabledModules = await storage.getEnabledModules(tenantId);
      res.json({ enabledModules });
    } catch (error) {
      console.error("Error fetching enabled modules:", error);
      res.status(500).json({ message: "Failed to fetch enabled modules" });
    }
  });

  app.put('/api/settings/enabled-modules', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const moduleSchema = z.object({
        enabledModules: z.array(z.enum(['billing', 'subscriptions', 'work_orders', 'client_crm', 'messaging_center'])),
      });

      const { enabledModules } = moduleSchema.parse(req.body);
      const updatedSettings = await storage.updateEnabledModules(tenantId, enabledModules);

      res.json({ enabledModules: updatedSettings.enabledModules });
    } catch (error) {
      console.error("Error updating enabled modules:", error);
      res.status(500).json({ 
        message: error instanceof z.ZodError 
          ? "Invalid module names provided" 
          : "Failed to update enabled modules" 
      });
    }
  });

  // Auto-response configuration endpoints
  app.get('/api/auto-response/config', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const [config] = await db
        .select()
        .from(autoResponseConfig)
        .where(eq(autoResponseConfig.tenantId, tenantId))
        .limit(1);
      
      // Mask API key in response
      const maskedConfig = config ? {
        ...config,
        openaiApiKey: config.openaiApiKey ? `****${config.openaiApiKey.slice(-4)}` : null,
      } : null;

      res.json(maskedConfig);
    } catch (error) {
      console.error("Error fetching auto-response config:", error);
      res.status(500).json({ message: "Failed to fetch configuration" });
    }
  });

  app.put('/api/auto-response/config', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const configSchema = z.object({
        enabled: z.boolean().optional(),
        testMode: z.boolean().optional(),
        openaiApiKey: z.string().nullable().optional(),
        model: z.string().optional(),
        responseTone: z.enum(['professional', 'friendly', 'empathetic', 'concise']).optional(),
        customInstructions: z.string().nullable().optional(),
        businessResponseTemplate: z.string().nullable().optional(),
        enableEmailAutoResponse: z.boolean().optional(),
        enableSmsAutoResponse: z.boolean().optional(),
        maxResponseLength: z.number().optional(),
      });

      const validatedData = configSchema.parse(req.body);
      
      // Check if config exists
      const [existingConfig] = await db
        .select()
        .from(autoResponseConfig)
        .where(eq(autoResponseConfig.tenantId, tenantId))
        .limit(1);
      
      // Preserve API key if submitted as masked value
      let finalApiKey = validatedData.openaiApiKey;
      if (typeof validatedData.openaiApiKey === 'string' && validatedData.openaiApiKey.startsWith('****') && existingConfig?.openaiApiKey) {
        finalApiKey = existingConfig.openaiApiKey;
      }

      if (existingConfig) {
        // Update existing config
        const [updated] = await db
          .update(autoResponseConfig)
          .set({
            ...validatedData,
            openaiApiKey: finalApiKey,
            updatedAt: new Date(),
          })
          .where(eq(autoResponseConfig.id, existingConfig.id))
          .returning();
        
        // Mask API key in response
        const maskedUpdated = {
          ...updated,
          openaiApiKey: updated.openaiApiKey ? `****${updated.openaiApiKey.slice(-4)}` : null,
        };

        res.json(maskedUpdated);
      } else {
        // Create new config
        const [created] = await db
          .insert(autoResponseConfig)
          .values({
            tenantId,
            ...validatedData,
            openaiApiKey: finalApiKey,
          })
          .returning();
        
        // Mask API key in response
        const maskedCreated = {
          ...created,
          openaiApiKey: created.openaiApiKey ? `****${created.openaiApiKey.slice(-4)}` : null,
        };

        res.json(maskedCreated);
      }
    } catch (error) {
      console.error("Error updating auto-response config:", error);
      res.status(500).json({ message: "Failed to update configuration" });
    }
  });

  // Get auto-response usage statistics
  app.get('/api/auto-response/usage', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { AutoResponseService } = await import('./autoResponseService');
      const service = new AutoResponseService(tenantId);
      const usage = await service.checkUsageLimit();

      res.json(usage);
    } catch (error) {
      console.error("Error fetching auto-response usage:", error);
      res.status(500).json({ message: "Failed to fetch usage statistics" });
    }
  });

  // Test auto-response (playground)
  app.post('/api/auto-response/test', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const testSchema = z.object({
        messageType: z.enum(['email', 'sms']),
        message: z.string().min(1),
        consumerId: z.string().optional(),
      });

      const { messageType, message, consumerId } = testSchema.parse(req.body);

      const { testAutoResponse } = await import('./autoResponseService');
      const result = await testAutoResponse(tenantId, messageType, message, consumerId);

      res.json(result);
    } catch (error) {
      console.error("Error testing auto-response:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to generate test response" 
      });
    }
  });

  // Test SMAX connection
  app.post('/api/settings/test-smax', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { smaxService } = await import('./smaxService');
      const {
        smaxEnabled,
        smaxApiKey,
        smaxPin,
        smaxBaseUrl,
      } = req.body || {};

      const sanitizedApiKey = typeof smaxApiKey === 'string' && smaxApiKey !== '••••••••'
        ? smaxApiKey
        : undefined;
      const sanitizedPin = typeof smaxPin === 'string' && smaxPin !== '••••••••'
        ? smaxPin
        : undefined;

      const result = await smaxService.testConnection(tenantId, {
        enabled: typeof smaxEnabled === 'boolean' ? smaxEnabled : undefined,
        apiKey: sanitizedApiKey,
        pin: sanitizedPin,
        baseUrl: typeof smaxBaseUrl === 'string' ? smaxBaseUrl : undefined,
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error testing SMAX connection:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to test SMAX connection" 
      });
    }
  });

  // Sync accounts from SMAX - Call this endpoint every 8 hours
  app.post('/api/smax/sync-accounts', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { smaxService } = await import('./smaxService');
      
      // Check if SMAX is enabled for this tenant
      const settings = await storage.getTenantSettings(tenantId);
      if (!settings?.smaxEnabled) {
        return res.status(400).json({ 
          success: false,
          error: "SMAX integration is not enabled for this tenant" 
        });
      }

      // Get all accounts for this tenant
      const accounts = await storage.getAccountsByTenant(tenantId);
      
      const syncResults = {
        total: accounts.length,
        synced: 0,
        failed: 0,
        skipped: 0,
        paymentsImported: 0,
        errors: [] as string[],
      };

      for (const account of accounts) {
        // SMAX uses filenumber - prefer filenumber, fall back to accountNumber for legacy data
        const smaxIdentifier = account.filenumber || account.accountNumber;
        if (!smaxIdentifier) {
          syncResults.skipped++;
          continue;
        }

        try {
          // Pull account data from SMAX using filenumber (or accountNumber fallback)
          const smaxAccountData = await smaxService.getAccount(tenantId, smaxIdentifier);
          
          if (smaxAccountData) {
            // Sync account status from SMAX (do this regardless of balance data)
            // Map SMAX status values to Chain status values
            let chainStatus: string | null = null; // null = don't update status
            
            // Iterate through ALL SMAX fields case-insensitively to find status
            let smaxStatus: string | null = null;
            for (const [key, value] of Object.entries(smaxAccountData)) {
              const lowerKey = key.toLowerCase();
              // Check if field name contains 'status' or is 'state'
              if ((lowerKey.includes('status') || lowerKey === 'state' || lowerKey === 'accountstate') && 
                  value && typeof value === 'string') {
                smaxStatus = value;
                break; // Use first matching status field
              }
            }
            
            if (smaxStatus) {
              const normalizedStatus = smaxStatus.toLowerCase().trim();
              
              // Map SMAX statuses to Chain statuses
              if (normalizedStatus.includes('closed') || normalizedStatus.includes('close')) {
                chainStatus = 'closed';
                console.log(`📊 SMAX status "${smaxStatus}" mapped to: closed`);
              } else if (normalizedStatus.includes('recall') || normalizedStatus.includes('recalled')) {
                chainStatus = 'recalled';
                console.log(`📊 SMAX status "${smaxStatus}" mapped to: recalled`);
              } else if (normalizedStatus.includes('inactive') || normalizedStatus.includes('deactivate')) {
                chainStatus = 'inactive';
                console.log(`📊 SMAX status "${smaxStatus}" mapped to: inactive`);
              } else if (normalizedStatus.includes('active') || normalizedStatus.includes('open')) {
                chainStatus = 'active';
                console.log(`📊 SMAX status "${smaxStatus}" mapped to: active`);
              } else {
                // Unknown status - log it but don't change current status
                console.warn(`⚠️ Unknown SMAX status "${smaxStatus}" - keeping current status`);
              }
            }
            
            // Update account balance if available - find balance field case-insensitively
            const updateData: any = {};
            let rawBalance: string | null = null;
            for (const [key, value] of Object.entries(smaxAccountData)) {
              const lowerKey = key.toLowerCase();
              if ((lowerKey === 'currentbalance' || lowerKey === 'balance' || 
                   lowerKey === 'balancedue' || lowerKey === 'totalbalance' ||
                   lowerKey === 'amountdue' || lowerKey === 'amountowed') && 
                  value !== null && value !== undefined) {
                rawBalance = String(value);
                console.log(`💰 Found SMAX balance field "${key}" = "${value}"`);
                break;
              }
            }
            
            if (rawBalance !== null) {
              const balanceFloat = parseFloat(rawBalance.replace(/[^0-9.-]/g, ''));
              if (Number.isFinite(balanceFloat)) {
                // Normalize to cents - SMAX may return dollars or cents
                const newBalanceCents = rawBalance.includes('.')
                  ? Math.round(balanceFloat * 100)
                  : Math.round(balanceFloat);
                updateData.balanceCents = Math.max(0, newBalanceCents);
                console.log(`💰 SMAX Balance restored for ${smaxIdentifier}: ${newBalanceCents} cents`);
              }
            }
            
            // Update status if we found one
            if (chainStatus !== null) {
              updateData.status = chainStatus;
            }
            
            // Only update if we have something to update
            if (Object.keys(updateData).length > 0) {
              await storage.updateAccount(account.id, updateData);
            }
            
            // Extract phone numbers from SMAX and store in consumer additionalData
            // SMAX may have multiple phone fields: phone1, phone2, phone3, homephone, cellphone, workphone, etc.
            const consumer = await storage.getConsumer(account.consumerId);
            if (consumer && smaxAccountData) {
              const existingData = (consumer.additionalData || {}) as Record<string, any>;
              const updatedData = { ...existingData };
              let phoneNumbersUpdated = false;
              
              // Collect all phone numbers with normalization and deduplication
              const phoneNumbers = new Map<string, string>(); // normalized -> original
              
              // Iterate through ALL SMAX fields (case-insensitive) to catch any phone field
              for (const [key, value] of Object.entries(smaxAccountData)) {
                const lowerKey = key.toLowerCase();
                // Check if field name contains 'phone' (catches phone1, homephone, cell_phone, etc.)
                if (lowerKey.includes('phone') && value && typeof value === 'string') {
                  const trimmed = value.trim();
                  if (trimmed) {
                    // Normalize phone number: keep only digits for deduplication check
                    const normalized = trimmed.replace(/\D/g, '');
                    if (normalized.length >= 10) { // Valid phone numbers have at least 10 digits
                      // Store with normalized key to prevent duplicates
                      const normalizedKey = lowerKey.replace(/[_\s]/g, '');
                      if (!phoneNumbers.has(normalized)) {
                        phoneNumbers.set(normalized, trimmed);
                        updatedData[normalizedKey] = trimmed;
                        phoneNumbersUpdated = true;
                      }
                    }
                  }
                }
              }
              
              // Update consumer if any phone numbers were found
              if (phoneNumbersUpdated) {
                await storage.updateConsumer(consumer.id, {
                  additionalData: updatedData
                });
                console.log(`📞 Updated ${phoneNumbers.size} unique phone number(s) from SMAX for consumer ${consumer.id}`);
              }
            }
            
            syncResults.synced++;
            console.log(`✅ Synced account ${smaxIdentifier}: Balance updated to $${smaxAccountData.balance}`);
          } else {
            syncResults.failed++;
            syncResults.errors.push(`Account ${smaxIdentifier}: No balance data from SMAX`);
          }

          // Pull and import payments from SMAX using filenumber (or accountNumber fallback)
          const smaxPayments = await smaxService.getPayments(tenantId, smaxIdentifier);
          
          if (smaxPayments && smaxPayments.length > 0) {
            // Get existing payments for this account to avoid duplicates
            const allPayments = await storage.getPaymentsByTenant(tenantId);
            const existingPayments = allPayments.filter(p => p.accountId === account.id);
            const existingTransactionIds = new Set(
              existingPayments
                .filter(p => p.transactionId)
                .map(p => p.transactionId)
            );

            for (const smaxPayment of smaxPayments) {
              // Skip if we already have this payment (match by transaction ID)
              if (smaxPayment.transactionid && existingTransactionIds.has(smaxPayment.transactionid)) {
                continue;
              }

              // Import payment from SMAX to Chain
              try {
                const paymentAmountCents = Math.round(parseFloat(smaxPayment.paymentamount || 0) * 100);
                
                await storage.createPayment({
                  tenantId,
                  consumerId: account.consumerId,
                  accountId: account.id,
                  amountCents: paymentAmountCents,
                  status: smaxPayment.status === 'completed' ? 'completed' : 'failed',
                  paymentMethod: smaxPayment.paymentmethod || 'unknown',
                  transactionId: smaxPayment.transactionid || null,
                  processedAt: smaxPayment.paymentdate ? new Date(smaxPayment.paymentdate) : new Date(),
                  notes: smaxPayment.notes || 'Imported from SMAX',
                });

                syncResults.paymentsImported++;
              } catch (paymentError: any) {
                console.error(`Failed to import payment for account ${smaxIdentifier}:`, paymentError);
              }
            }
          }
        } catch (error: any) {
          syncResults.failed++;
          syncResults.errors.push(`Account ${smaxIdentifier}: ${error.message}`);
          console.error(`❌ Failed to sync account ${smaxIdentifier}:`, error);
        }
      }

      res.json({
        success: true,
        message: `Sync completed: ${syncResults.synced} accounts updated, ${syncResults.paymentsImported} payments imported`,
        results: syncResults,
      });
    } catch (error: any) {
      console.error("Error syncing SMAX accounts:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to sync SMAX accounts" 
      });
    }
  });

  // Logo upload route (handles JSON with base64)
  app.post('/api/upload/logo', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { image, filename } = req.body;
      
      if (!image || !filename) {
        return res.status(400).json({ message: "No image data provided" });
      }

      // Convert base64 to buffer
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Determine mimetype from base64 prefix
      const mimetypeMatch = image.match(/^data:(image\/\w+);base64,/);
      const mimetype = mimetypeMatch ? mimetypeMatch[1] : 'image/png';

      // Upload to filesystem (Railway Volume)
      const logoResult = await uploadLogo(buffer, tenantId, mimetype);
      
      if (!logoResult) {
        return res.status(500).json({ message: "Failed to upload logo to storage" });
      }

      const logoUrl = logoResult.url;
      
      // Get current settings
      const currentSettings = await storage.getTenantSettings(tenantId);
      
      // Update custom branding with logo URL
      const customBranding = (currentSettings?.customBranding as any) || {};
      customBranding.logoUrl = logoUrl;
      
      // Update tenant settings
      const settingsData = {
        tenantId: tenantId,
        customBranding: customBranding as any,
        ...(currentSettings ? {
          privacyPolicy: currentSettings.privacyPolicy,
          termsOfService: currentSettings.termsOfService,
          contactEmail: currentSettings.contactEmail,
          contactPhone: currentSettings.contactPhone,
          showPaymentPlans: currentSettings.showPaymentPlans,
          showDocuments: currentSettings.showDocuments,
          allowSettlementRequests: currentSettings.allowSettlementRequests,
          consumerPortalSettings: currentSettings.consumerPortalSettings as any,
        } : {})
      };
      
      const updatedSettings = await storage.upsertTenantSettings(settingsData);
      
      res.json({ 
        message: "Logo uploaded successfully",
        logoUrl,
        settings: updatedSettings
      });
    } catch (error) {
      console.error("Error uploading logo:", error);
      res.status(500).json({ message: "Failed to upload logo" });
    }
  });

  // Consumer portal enhanced routes
  // Get tenant settings for consumer (public settings only)
  app.get('/api/consumer/tenant-settings', authenticateConsumer, async (req: any, res) => {
    try {
      const { tenantId } = req.consumer || {};

      if (!tenantId) {
        return res.status(401).json({ message: "No consumer access" });
      }

      const settings = await storage.getTenantSettings(tenantId);
      
      console.log('🔍 [Consumer Settings] Authorize.net Public Client Key from DB:', {
        tenantId,
        authnetPublicClientKey: settings?.authnetPublicClientKey,
        length: settings?.authnetPublicClientKey?.length || 0,
        first10: settings?.authnetPublicClientKey?.substring(0, 10) || '',
        containsWaypoint: settings?.authnetPublicClientKey?.includes?.('Waypoint') || false,
      });
      
      // Always return settings with defaults even if no record exists
      res.json({
        minimumMonthlyPayment: settings?.minimumMonthlyPayment || 5000, // Default $50
        showPaymentPlans: settings?.showPaymentPlans ?? true,
        showDocuments: settings?.showDocuments ?? true,
        allowSettlementRequests: settings?.allowSettlementRequests ?? true,
        forceArrangement: settings?.forceArrangement ?? false, // When true, disable one-time payments
        // Merchant provider settings (public info only - needed for Accept.js)
        merchantProvider: settings?.merchantProvider || 'usaepay',
        authnetPublicClientKey: settings?.authnetPublicClientKey || null,
        authnetApiLoginId: settings?.authnetApiLoginId || null, // Needed for Accept.js tokenization
        useSandbox: settings?.useSandbox ?? true,
      });
    } catch (error) {
      console.error("Error fetching consumer tenant settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.get('/api/consumer/documents/:email', authenticateConsumer, async (req: any, res) => {
    try {
      const { email } = req.params;
      const { tenantSlug } = req.query;
      const { id: consumerId, email: tokenEmail, tenantId, tenantSlug: tokenTenantSlug } = req.consumer || {};

      if (!consumerId) {
        return res.status(401).json({ message: "No consumer access" });
      }

      const normalizedParamEmail = normalizeLowercase(email);
      const normalizedTokenEmail = normalizeLowercase(tokenEmail);
      if (!normalizedTokenEmail || normalizedParamEmail !== normalizedTokenEmail) {
        return res.status(403).json({ message: "Access denied" });
      }

      const requestedTenantSlug = typeof tenantSlug === "string" ? tenantSlug : "";
      if (!requestedTenantSlug) {
        return res.status(400).json({ message: "Tenant slug required" });
      }

      const normalizedRequestedTenantSlug = normalizeLowercase(requestedTenantSlug);

      let tenant = tenantId ? await storage.getTenant(tenantId) : undefined;
      if (!tenant && tokenTenantSlug) {
        tenant = await storage.getTenantBySlug(tokenTenantSlug);
      }
      if (!tenant) {
        tenant = await storage.getTenantBySlug(requestedTenantSlug);
      }

      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const tenantSlugMatch = normalizeLowercase(tenant.slug);
      if (!tenantSlugMatch || tenantSlugMatch !== normalizedRequestedTenantSlug) {
        return res.status(403).json({ message: "Access denied" });
      }

      const consumer = await storage.getConsumer(consumerId);
      if (!consumer || normalizeLowercase(consumer.email) !== normalizedTokenEmail || consumer.tenantId !== tenant.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const settings = await storage.getTenantSettings(tenant.id);
      if (!settings?.showDocuments) {
        return res.json([]);
      }

      const consumerAccounts = await storage.getAccountsByConsumer(consumer.id);
      const consumerAccountIds = new Set(consumerAccounts.map(account => account.id));

      const requestedAccountId = typeof req.query.accountId === "string" ? req.query.accountId : null;
      if (requestedAccountId && !consumerAccountIds.has(requestedAccountId)) {
        return res.json([]);
      }

      const documents = await storage.getDocumentsByTenant(tenant.id);
      
      // Fetch pending signature requests for this consumer
      const signatureRequests = await storage.getSignatureRequestsByConsumer(consumer.id);
      const pendingRequests = signatureRequests
        .filter(req => req.status === 'pending' || req.status === 'viewed')
        .map(req => ({
          ...req,
          isPendingSignature: true,
          type: 'signature_request',
        }));
      
      // Get document IDs that are associated with pending signature requests
      const pendingDocumentIds = new Set(pendingRequests.map(req => req.documentId).filter(Boolean));
      
      // Filter out documents that are part of pending signature requests to avoid duplicates
      const visibleDocuments = documents.filter(doc => {
        // Skip documents that are part of pending signature requests
        if (pendingDocumentIds.has(doc.id)) {
          return false;
        }
        
        if (doc.isPublic) {
          return true;
        }

        if (!doc.accountId) {
          return false;
        }

        if (!consumerAccountIds.has(doc.accountId)) {
          return false;
        }

        if (requestedAccountId) {
          return doc.accountId === requestedAccountId;
        }

        return true;
      });

      // Combine documents and pending signature requests
      const combinedResults = [...visibleDocuments, ...pendingRequests];

      res.json(combinedResults);
    } catch (error) {
      console.error("Error fetching consumer documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Consumer document upload endpoint
  app.post('/api/consumer/documents/upload', authenticateConsumer, documentUpload.single('file'), async (req: any, res) => {
    try {
      const { id: consumerId, email: tokenEmail, tenantId, tenantSlug: tokenTenantSlug } = req.consumer || {};

      if (!consumerId || !tenantId) {
        return res.status(401).json({ message: "No consumer access" });
      }

      const { title, description, accountId, isPublic } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (!title) {
        return res.status(400).json({ message: "Document title is required" });
      }

      // Verify the account belongs to this consumer if accountId is provided
      if (accountId) {
        const account = await storage.getAccount(accountId);
        if (!account || account.consumerId !== consumerId || account.tenantId !== tenantId) {
          return res.status(403).json({ message: "You can only upload documents to your own accounts" });
        }
      }

      // Upload file to R2 storage
      const uploadResult = await uploadLogo(file.buffer, tenantId, file.mimetype);
      
      if (!uploadResult) {
        return res.status(500).json({ message: "Failed to upload file to storage" });
      }

      // Create document record in database
      const document = await storage.createDocument({
        tenantId,
        accountId: accountId || null,
        title: title.trim(),
        description: description ? description.trim() : undefined,
        fileName: file.originalname,
        fileUrl: uploadResult.url,
        fileSize: file.size,
        mimeType: file.mimetype,
        isPublic: isPublic === 'true' || isPublic === true,
      });

      res.json({
        message: "Document uploaded successfully",
        document
      });
    } catch (error) {
      console.error("Error uploading consumer document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Arrangement Calculation Engine
  // tenantGlobalMinimum is the tenant-level minimum monthly payment (fallback when plan has no specific minimum)
  const calculateArrangementDetails = (option: any, balanceCents: number, tenantGlobalMinimum: number = 0) => {
    const calculated: any = {
      ...option,
      calculatedMonthlyPayment: null,
      calculatedTotalAmount: balanceCents,
      calculatedTermMonths: null,
      calculatedPayoffAmount: null,
      calculatedPayoffPercentage: null,
    };

    switch (option.planType) {
      case "range":
        // Use plan-specific minimum if set (not null/undefined), otherwise fall back to tenant global minimum
        const minPayment = (option.monthlyPaymentMin != null && option.monthlyPaymentMin > 0) 
          ? option.monthlyPaymentMin 
          : (tenantGlobalMinimum || 0);
        // Max payment: use legacy monthlyPaymentMax if explicitly set (not null/undefined), otherwise allow up to full balance
        // This preserves backward compatibility for existing plans with max limits
        const maxPayment = (option.monthlyPaymentMax != null && option.monthlyPaymentMax > 0) 
          ? option.monthlyPaymentMax 
          : balanceCents;
        const maxTerm = option.maxTermMonths || 12;
        
        // Calculate minimum payment to pay off balance within max term
        const calculatedMinimum = Math.ceil(balanceCents / maxTerm);
        
        // Use the greater of: configured minimum or calculated minimum
        // Clamp to max payment if legacy max exists
        const unclamped = Math.max(minPayment, calculatedMinimum);
        calculated.calculatedMonthlyPayment = Math.min(unclamped, maxPayment);
        
        // Store the minimum and maximum payment for consumer portal to enforce
        calculated.minimumMonthlyPayment = minPayment;
        calculated.maximumMonthlyPayment = maxPayment;
        
        // Verify the payment is within bounds, otherwise this option is not viable
        if (calculated.calculatedMonthlyPayment < minPayment || calculated.calculatedMonthlyPayment > maxPayment) {
          return null; // This option doesn't work for this balance
        }
        
        // Verify the minimum payment doesn't exceed balance (would be invalid)
        if (minPayment > balanceCents) {
          return null; // Minimum is greater than balance, option not viable
        }
        
        // Calculate term and verify it doesn't exceed the max term
        calculated.calculatedTermMonths = Math.ceil(balanceCents / calculated.calculatedMonthlyPayment);
        if (calculated.calculatedTermMonths > maxTerm) {
          return null; // Payment would take too long to complete, option not viable
        }
        break;

      case "fixed_monthly":
        // Use the arrangement's configured fixed monthly payment
        if (option.fixedMonthlyPayment) {
          calculated.calculatedMonthlyPayment = option.fixedMonthlyPayment;
          calculated.calculatedTermMonths = Math.ceil(balanceCents / option.fixedMonthlyPayment);
        } else {
          return null; // No fixed payment configured, option not viable
        }
        break;

      case "settlement":
        // Calculate settlement amount based on percentage
        if (option.payoffPercentageBasisPoints) {
          const percentage = option.payoffPercentageBasisPoints / 10000; // Convert basis points to decimal
          const settlementTotal = Math.round(balanceCents * percentage);
          calculated.calculatedPayoffAmount = settlementTotal;
          calculated.calculatedPayoffPercentage = percentage * 100;
          calculated.calculatedTotalAmount = settlementTotal;
          
          // If this settlement has multiple payments, calculate the per-payment amount
          if (option.settlementPaymentCount && option.settlementPaymentCount > 1) {
            // Use floor to avoid overcharging - final payment logic will handle remainder
            const perPaymentAmount = Math.floor(settlementTotal / option.settlementPaymentCount);
            calculated.calculatedMonthlyPayment = perPaymentAmount;
            calculated.calculatedTermMonths = option.settlementPaymentCount;
            calculated.settlementPaymentCount = option.settlementPaymentCount;
            calculated.settlementPaymentFrequency = option.settlementPaymentFrequency || 'monthly';
          } else {
            // Single payment settlement (pay in full)
            calculated.settlementPaymentCount = 1;
          }
        }
        break;

      case "one_time_payment":
        // One-time payment uses the minimum specified or full balance
        calculated.calculatedPayoffAmount = option.oneTimePaymentMin || balanceCents;
        calculated.calculatedTotalAmount = calculated.calculatedPayoffAmount;
        break;

      case "custom_terms":
        // Custom terms don't have specific calculations
        break;
    }

    return calculated;
  };

  app.get('/api/consumer/arrangements/:email', authenticateConsumer, async (req: any, res) => {
    try {
      const { email } = req.params;
      const { tenantSlug, balance } = req.query;
      const { id: consumerId, email: tokenEmail, tenantId, tenantSlug: tokenTenantSlug } = req.consumer || {};

      if (!consumerId) {
        return res.status(401).json({ message: "No consumer access" });
      }

      const normalizedParamEmail = normalizeLowercase(email);
      const normalizedTokenEmail = normalizeLowercase(tokenEmail);
      if (!normalizedTokenEmail || normalizedParamEmail !== normalizedTokenEmail) {
        return res.status(403).json({ message: "Access denied" });
      }

      const requestedTenantSlug = typeof tenantSlug === "string" ? tenantSlug : "";
      if (!requestedTenantSlug) {
        return res.status(400).json({ message: "Tenant slug required" });
      }

      const normalizedRequestedTenantSlug = normalizeLowercase(requestedTenantSlug);

      let tenant = tenantId ? await storage.getTenant(tenantId) : undefined;
      if (!tenant && tokenTenantSlug) {
        tenant = await storage.getTenantBySlug(tokenTenantSlug);
      }
      if (!tenant) {
        tenant = await storage.getTenantBySlug(requestedTenantSlug);
      }

      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const tenantSlugMatch = normalizeLowercase(tenant.slug);
      if (!tenantSlugMatch || tenantSlugMatch !== normalizedRequestedTenantSlug) {
        return res.status(403).json({ message: "Access denied" });
      }

      const consumer = await storage.getConsumer(consumerId);
      if (!consumer || normalizeLowercase(consumer.email) !== normalizedTokenEmail || consumer.tenantId !== tenant.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const settings = await storage.getTenantSettings(tenant.id);
      if (!settings?.showPaymentPlans) {
        return res.json([]);
      }

      const balanceCents = parseInt(balance as string) || 0;
      const options = await storage.getArrangementOptionsByTenant(tenant.id);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to start of day for date comparison
      
      // Filter options based on balance range, expiration, and force arrangement setting
      const applicableOptions = options.filter(option => {
        // Check balance range
        if (balanceCents < option.minBalance || balanceCents > option.maxBalance) {
          return false;
        }
        
        // Check if settlement offer has expired
        if (option.planType === 'settlement' && option.settlementOfferExpiresDate) {
          const expirationDate = new Date(option.settlementOfferExpiresDate);
          expirationDate.setHours(0, 0, 0, 0);
          if (expirationDate < today) {
            return false; // Offer has expired
          }
        }
        
        // If forceArrangement is enabled, filter out one_time_payment plans
        if (settings?.forceArrangement && option.planType === 'one_time_payment') {
          return false;
        }
        
        return true;
      });
      
      // Expand settlement options with multiple payment counts into separate options
      const expandedOptions: any[] = [];
      for (const option of applicableOptions) {
        if (option.planType === 'settlement' && option.settlementPaymentCounts && Array.isArray(option.settlementPaymentCounts) && option.settlementPaymentCounts.length > 0) {
          // Create a separate option for each payment count
          for (const paymentCount of option.settlementPaymentCounts) {
            expandedOptions.push({
              ...option,
              settlementPaymentCount: paymentCount, // Add individual count for calculation
              name: `${option.name} - ${paymentCount} ${paymentCount === 1 ? 'Payment' : 'Payments'}`, // Unique name for each option
            });
          }
        } else {
          // Non-settlement or settlement without counts array
          expandedOptions.push(option);
        }
      }
      
      // Calculate payment details for each expanded option and filter out non-viable ones
      // Use tenant's global minimumMonthlyPayment as fallback when plan has no specific minimum
      const tenantGlobalMinimum = settings?.minimumMonthlyPayment || 0;
      const calculatedOptions = expandedOptions
        .map(option => calculateArrangementDetails(option, balanceCents, tenantGlobalMinimum))
        .filter(option => option !== null);
      
      // Fetch SMAX arrangements for all consumer accounts with filenumbers
      // Non-blocking: failures won't prevent returning Chain template options
      const consumerAccounts = await storage.getAccountsByConsumer(consumerId);
      const smaxArrangements: any[] = [];
      
      for (const account of consumerAccounts) {
        if (account.filenumber) {
          try {
            console.log('📋 Fetching SMAX arrangement for account:', account.filenumber);
            const smaxArrangement = await smaxService.getPaymentArrangement(tenant.id, account.filenumber);
            
            if (smaxArrangement && (smaxArrangement.paymentAmount || smaxArrangement.monthlyPayment)) {
              // Sync SMAX arrangement to Chain database (non-blocking)
              try {
                await storage.syncSmaxArrangementToChain(tenant.id, consumerId, account.id, smaxArrangement);
              } catch (syncError) {
                console.error('⚠️ Failed to sync SMAX arrangement to Chain (non-blocking):', syncError);
              }

              // Format SMAX arrangement to match Chain arrangement structure for display
              smaxArrangements.push({
                id: `smax_${account.filenumber}`,
                source: 'smax',
                name: 'Existing SMAX Payment Arrangement',
                accountFileNumber: account.filenumber,
                accountId: account.id,
                planType: smaxArrangement.arrangementType || 'existing_smax',
                monthlyPayment: smaxArrangement.monthlyPayment || smaxArrangement.paymentAmount,
                nextPaymentDate: smaxArrangement.nextPaymentDate,
                remainingPayments: smaxArrangement.remainingPayments,
                startDate: smaxArrangement.startDate,
                endDate: smaxArrangement.endDate,
                totalBalance: smaxArrangement.totalBalance,
                isExisting: true,
                details: smaxArrangement
              });
              console.log('✅ SMAX arrangement found and synced to Chain');
            }
          } catch (error) {
            console.error('⚠️ Failed to fetch SMAX arrangement for account (non-blocking):', account.filenumber, error);
            // Continue processing other accounts even if one fails
          }
        }
      }
      
      // Return both calculated Chain template options AND existing SMAX arrangements
      res.json({
        templateOptions: calculatedOptions,
        existingArrangements: smaxArrangements,
        hasExistingSMAXArrangement: smaxArrangements.length > 0
      });
    } catch (error) {
      console.error("Error fetching arrangement options:", error);
      res.status(500).json({ message: "Failed to fetch arrangement options" });
    }
  });

  // Get consumer's active payment schedules with details
  app.get('/api/consumer/payment-schedules/:email', authenticateConsumer, async (req: any, res) => {
    try {
      const { email } = req.params;
      const { tenantSlug } = req.query;
      const { id: consumerId, email: tokenEmail, tenantId, tenantSlug: tokenTenantSlug } = req.consumer || {};

      if (!consumerId) {
        return res.status(401).json({ message: "No consumer access" });
      }

      const normalizedParamEmail = normalizeLowercase(email);
      const normalizedTokenEmail = normalizeLowercase(tokenEmail);
      if (!normalizedTokenEmail || normalizedParamEmail !== normalizedTokenEmail) {
        return res.status(403).json({ message: "Access denied" });
      }

      const requestedTenantSlug = typeof tenantSlug === "string" ? tenantSlug : "";
      if (!requestedTenantSlug) {
        return res.status(400).json({ message: "Tenant slug required" });
      }

      const normalizedRequestedTenantSlug = normalizeLowercase(requestedTenantSlug);

      let tenant = tenantId ? await storage.getTenant(tenantId) : undefined;
      if (!tenant && tokenTenantSlug) {
        tenant = await storage.getTenantBySlug(tokenTenantSlug);
      }
      if (!tenant) {
        tenant = await storage.getTenantBySlug(requestedTenantSlug);
      }

      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const tenantSlugMatch = normalizeLowercase(tenant.slug);
      if (!tenantSlugMatch || tenantSlugMatch !== normalizedRequestedTenantSlug) {
        return res.status(403).json({ message: "Access denied" });
      }

      const consumer = await storage.getConsumer(consumerId);
      if (!consumer || normalizeLowercase(consumer.email) !== normalizedTokenEmail || consumer.tenantId !== tenant.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get active payment schedules
      const schedules = await storage.getPaymentSchedulesByConsumer(consumerId, tenant.id);
      console.log('📅 Payment schedules found for consumer:', {
        consumerId,
        tenantId: tenant.id,
        totalSchedules: schedules.length,
        scheduleStatuses: schedules.map(s => ({ id: s.id, status: s.status, arrangementType: s.arrangementType }))
      });
      
      const activeSchedules = schedules.filter(s => s.status === 'active');
      console.log('✅ Active schedules after filter:', {
        activeCount: activeSchedules.length,
        activeScheduleIds: activeSchedules.map(s => s.id)
      });

      // Enrich schedules with payment method and account details
      const enrichedSchedules = await Promise.all(activeSchedules.map(async (schedule) => {
        // Get payment methods for this consumer
        const consumerPaymentMethods = await storage.getPaymentMethodsByConsumer(consumerId, tenant.id);
        const paymentMethod = consumerPaymentMethods.find(pm => pm.id === schedule.paymentMethodId);

        const account = await storage.getAccount(schedule.accountId);

        // Calculate all upcoming payment dates
        const upcomingPayments: { paymentNumber: number; dueDate: string; amountCents: number }[] = [];
        if (schedule.nextPaymentDate && schedule.remainingPayments && schedule.remainingPayments > 0) {
          const startDate = new Date(schedule.nextPaymentDate);
          const frequency = schedule.frequency || 'monthly';
          
          for (let i = 0; i < schedule.remainingPayments; i++) {
            const paymentDate = new Date(startDate);
            if (frequency === 'monthly') {
              paymentDate.setMonth(startDate.getMonth() + i);
            } else if (frequency === 'weekly') {
              paymentDate.setDate(startDate.getDate() + (i * 7));
            } else if (frequency === 'bi-weekly') {
              paymentDate.setDate(startDate.getDate() + (i * 14));
            }
            
            upcomingPayments.push({
              paymentNumber: i + 1,
              dueDate: paymentDate.toISOString().split('T')[0],
              amountCents: schedule.amountCents
            });
          }
        }

        return {
          id: schedule.id,
          arrangementType: schedule.arrangementType,
          amountCents: schedule.amountCents,
          frequency: schedule.frequency,
          nextPaymentDate: schedule.nextPaymentDate,
          remainingPayments: schedule.remainingPayments,
          status: schedule.status,
          cardLast4: paymentMethod?.cardLast4,
          cardBrand: paymentMethod?.cardBrand,
          accountNumber: account?.accountNumber,
          accountCreditor: account?.creditor,
          upcomingPayments: upcomingPayments,
        };
      }));

      console.log('📤 Returning enriched schedules to frontend:', {
        count: enrichedSchedules.length,
        schedules: enrichedSchedules.map(s => ({
          id: s.id,
          arrangementType: s.arrangementType,
          nextPaymentDate: s.nextPaymentDate,
          status: s.status
        }))
      });
      
      res.json(enrichedSchedules);
    } catch (error) {
      console.error("Error fetching payment schedules:", error);
      res.status(500).json({ message: "Failed to fetch payment schedules" });
    }
  });

  // Get consumer's payment history
  app.get('/api/consumer/payment-history/:email', authenticateConsumer, async (req: any, res) => {
    try {
      const { email } = req.params;
      const { tenantSlug } = req.query;
      const { id: consumerId, email: tokenEmail, tenantId, tenantSlug: tokenTenantSlug } = req.consumer || {};

      if (!consumerId) {
        return res.status(401).json({ message: "No consumer access" });
      }

      const normalizedParamEmail = normalizeLowercase(email);
      const normalizedTokenEmail = normalizeLowercase(tokenEmail);
      if (!normalizedTokenEmail || normalizedParamEmail !== normalizedTokenEmail) {
        return res.status(403).json({ message: "Access denied" });
      }

      const requestedTenantSlug = typeof tenantSlug === "string" ? tenantSlug : "";
      if (!requestedTenantSlug) {
        return res.status(400).json({ message: "Tenant slug required" });
      }

      const normalizedRequestedTenantSlug = normalizeLowercase(requestedTenantSlug);

      let tenant = tenantId ? await storage.getTenant(tenantId) : undefined;
      if (!tenant && tokenTenantSlug) {
        tenant = await storage.getTenantBySlug(tokenTenantSlug);
      }
      if (!tenant) {
        tenant = await storage.getTenantBySlug(requestedTenantSlug);
      }

      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const tenantSlugMatch = normalizeLowercase(tenant.slug);
      if (!tenantSlugMatch || tenantSlugMatch !== normalizedRequestedTenantSlug) {
        return res.status(403).json({ message: "Access denied" });
      }

      const consumer = await storage.getConsumer(consumerId);
      if (!consumer || normalizeLowercase(consumer.email) !== normalizedTokenEmail || consumer.tenantId !== tenant.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get all payments for this consumer
      const payments = await storage.getPaymentsByConsumer(consumerId, tenant.id);
      
      // Format the response with clean data for display
      const paymentHistory = payments.map(payment => ({
        id: payment.id,
        amountCents: payment.amountCents,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        processedAt: payment.processedAt,
        createdAt: payment.createdAt,
        accountCreditor: payment.accountCreditor,
        arrangementName: payment.arrangementName,
        notes: payment.notes,
        transactionId: payment.transactionId,
      }));

      console.log('📜 Payment history for consumer:', {
        consumerId,
        tenantId: tenant.id,
        totalPayments: paymentHistory.length
      });

      res.json(paymentHistory);
    } catch (error) {
      console.error("Error fetching payment history:", error);
      res.status(500).json({ message: "Failed to fetch payment history" });
    }
  });

  // Cancel payment schedule (consumer-scoped)
  app.post('/api/consumer/payment-schedule/:scheduleId/cancel', authenticateConsumer, async (req: any, res) => {
    try {
      const { scheduleId } = req.params;
      const { id: consumerId, tenantId } = req.consumer || {};

      if (!consumerId || !tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get the schedule to verify ownership
      const schedules = await storage.getPaymentSchedulesByConsumer(consumerId, tenantId);
      const schedule = schedules.find(s => s.id === scheduleId);

      if (!schedule) {
        return res.status(404).json({ message: "Payment schedule not found" });
      }

      if (schedule.status === 'cancelled') {
        return res.status(400).json({ message: "This payment schedule is already cancelled" });
      }

      // Cancel the schedule
      const success = await storage.cancelPaymentSchedule(scheduleId, tenantId);

      if (success) {
        console.log(`✅ Payment schedule ${scheduleId} cancelled by consumer ${consumerId}`);
        res.json({ 
          success: true, 
          message: "Payment schedule cancelled successfully" 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: "Failed to cancel payment schedule" 
        });
      }
    } catch (error) {
      console.error("Error cancelling payment schedule:", error);
      res.status(500).json({ message: "Failed to cancel payment schedule" });
    }
  });

  // Pay off remaining balance on a payment schedule (early payoff)
  app.post('/api/consumer/payment-schedule/:scheduleId/payoff', authenticateConsumer, async (req: any, res) => {
    console.log('💰 === EARLY PAYOFF REQUEST RECEIVED ===');
    try {
      const { scheduleId } = req.params;
      const { id: consumerId, tenantId } = req.consumer || {};

      if (!consumerId || !tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get the schedule to verify ownership
      const schedules = await storage.getPaymentSchedulesByConsumer(consumerId, tenantId);
      const schedule = schedules.find(s => s.id === scheduleId);

      if (!schedule) {
        return res.status(404).json({ message: "Payment schedule not found" });
      }

      if (schedule.status !== 'active') {
        return res.status(400).json({ message: `Cannot pay off a ${schedule.status} payment schedule` });
      }

      if (!schedule.remainingPayments || schedule.remainingPayments <= 0) {
        return res.status(400).json({ message: "No remaining payments on this schedule" });
      }

      // Get the account to calculate remaining balance
      const account = await storage.getAccount(schedule.accountId);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Get payment method
      const paymentMethods = await storage.getPaymentMethodsByConsumer(consumerId, tenantId);
      const paymentMethod = paymentMethods.find(pm => pm.id === schedule.paymentMethodId);

      if (!paymentMethod) {
        return res.status(400).json({ message: "Payment method not found. Please update your payment method first." });
      }

      // Get tenant settings for payment processor
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const settings = await storage.getTenantSettings(tenantId);
      if (!settings) {
        return res.status(400).json({ message: "Payment processing not configured" });
      }

      // Calculate remaining amount - use account balance (what's actually left to pay)
      const remainingAmountCents = account.balanceCents;
      
      if (remainingAmountCents <= 0) {
        // Balance is already zero, just complete the schedule
        await storage.updatePaymentSchedule(scheduleId, { 
          status: 'completed',
          remainingPayments: 0
        });
        return res.json({ 
          success: true, 
          message: "Account already paid in full",
          amountCharged: 0
        });
      }

      console.log('💳 Processing early payoff:', {
        scheduleId,
        remainingPayments: schedule.remainingPayments,
        scheduledPerPayment: schedule.amountCents,
        actualRemainingBalance: remainingAmountCents,
        paymentMethodId: paymentMethod.id,
        cardLast4: paymentMethod.cardLast4
      });

      const merchantProvider = settings?.merchantProvider || 'usaepay';
      let success = false;
      let paymentResult: any = null;
      let transactionId: string | null = null;

      // Route to appropriate payment processor
      if (merchantProvider === 'authorize_net') {
        // ===== AUTHORIZE.NET PAYOFF =====
        if (!settings?.authnetApiLoginId || !settings?.authnetTransactionKey) {
          return res.status(400).json({ message: "Payment processor not configured" });
        }

        const { AuthnetService } = await import('./authnetService');
        const authnetService = new AuthnetService({
          apiLoginId: settings.authnetApiLoginId.trim(),
          transactionKey: settings.authnetTransactionKey.trim(),
          useSandbox: settings.useSandbox ?? true,
        });

        const [customerProfileId, paymentProfileId] = paymentMethod.paymentToken.split('|');

        if (!customerProfileId || !paymentProfileId) {
          return res.status(400).json({ message: "Invalid payment method" });
        }

        const authnetResult = await authnetService.chargeCustomerProfile({
          customerProfileId,
          paymentProfileId,
          amount: remainingAmountCents / 100,
          invoice: schedule.accountId.substring(0, 20),
          description: `Early payoff - ${schedule.arrangementType}`,
        });

        paymentResult = authnetResult;
        success = authnetResult.success;
        transactionId = authnetResult.transactionId || null;

      } else if (merchantProvider === 'nmi') {
        // ===== NMI PAYOFF =====
        const isNMIVaultToken = paymentMethod.paymentToken.startsWith('nmi_vault_');
        
        if (isNMIVaultToken) {
          if (!settings?.nmiSecurityKey) {
            return res.status(400).json({ message: "Payment processor not configured" });
          }

          const vaultId = paymentMethod.paymentToken.replace('nmi_vault_', '').trim();

          const { NMIService } = await import('./nmiService');
          const nmiService = new NMIService({
            securityKey: settings.nmiSecurityKey.trim(),
          });

          const nmiResult = await nmiService.chargeCustomerVault({
            customerVaultId: vaultId,
            amount: parseFloat((remainingAmountCents / 100).toFixed(2)),
            orderid: schedule.accountId || `payoff_${schedule.id}`,
          });

          paymentResult = nmiResult;
          success = nmiResult.success;
          transactionId = nmiResult.transactionId || null;
        } else {
          return res.status(400).json({ message: "This payment method requires SMAX integration for processing" });
        }

      } else {
        // ===== USAEPAY PAYOFF =====
        if (!settings?.merchantAccountId || !settings?.merchantApiKey) {
          return res.status(400).json({ message: "Payment processor not configured" });
        }

        const useSandbox = settings.useSandbox ?? true;
        const baseUrl = useSandbox
          ? 'https://sandbox.usaepay.com/api/v2'
          : 'https://secure.usaepay.com/api/v2';

        const authString = Buffer.from(`${settings.merchantApiKey}:${settings.merchantApiPin || ''}`).toString('base64');

        const chargeResponse = await fetch(`${baseUrl}/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${authString}`,
          },
          body: JSON.stringify({
            command: 'sale',
            amount: (remainingAmountCents / 100).toFixed(2),
            creditcard: {
              token: paymentMethod.paymentToken,
            },
            description: `Early payoff - ${schedule.arrangementType}`,
            invoice: schedule.accountId?.substring(0, 20) || schedule.id.substring(0, 20),
          }),
        });

        const chargeResult = await chargeResponse.json() as any;
        
        success = chargeResult?.result_code === 'A' || chargeResult?.result === 'Approved';
        paymentResult = chargeResult;
        transactionId = chargeResult?.key || chargeResult?.refnum || null;
      }

      if (!success) {
        console.error('❌ Early payoff payment failed:', paymentResult);
        return res.status(400).json({ 
          success: false, 
          message: paymentResult?.errorMessage || paymentResult?.error || 'Payment declined. Please try again or use a different payment method.' 
        });
      }

      console.log('✅ Early payoff payment succeeded:', { transactionId, amount: remainingAmountCents / 100 });

      // Create payment record
      await storage.createPayment({
        tenantId,
        consumerId,
        accountId: schedule.accountId,
        amountCents: remainingAmountCents,
        paymentMethod: 'credit_card',
        status: 'completed',
        transactionId: transactionId || undefined,
        processorResponse: JSON.stringify(paymentResult),
        processedAt: new Date(),
        notes: `Early payoff - ${paymentMethod.cardholderName || 'Card'} ending in ${paymentMethod.cardLast4}`,
      });

      // Update account balance
      await storage.updateAccount(schedule.accountId, {
        balanceCents: 0,
        status: 'paid'
      });

      // Complete the payment schedule
      await storage.updatePaymentSchedule(scheduleId, { 
        status: 'completed',
        remainingPayments: 0
      });

      console.log(`✅ Payment schedule ${scheduleId} completed via early payoff by consumer ${consumerId}`);

      res.json({ 
        success: true, 
        message: "Payment successful! Your account has been paid in full.",
        amountCharged: remainingAmountCents,
        transactionId
      });

    } catch (error) {
      console.error("Error processing early payoff:", error);
      res.status(500).json({ message: "Failed to process payment. Please try again." });
    }
  });

  // Consumer callback request endpoint
  app.post('/api/consumer/callback-request', authenticateConsumer, async (req: any, res) => {
    try {
      const { email: tokenEmail, tenantId: tokenTenantId, tenantSlug: tokenTenantSlug } = req.consumer;
      const { preferredTime, phoneNumber, message } = req.body;

      if (!tokenEmail || !tokenTenantSlug) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get tenant
      let tenant = tokenTenantId ? await storage.getTenant(tokenTenantId) : undefined;
      if (!tenant && tokenTenantSlug) {
        tenant = await storage.getTenantBySlug(tokenTenantSlug);
      }

      if (!tenant) {
        return res.status(404).json({ message: "Agency not found" });
      }

      // Get consumer
      const consumer = await storage.getConsumerByEmailAndTenant(tokenEmail, tenant.slug);
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      // Create callback request
      const callbackRequest = await storage.createCallbackRequest({
        tenantId: tenant.id,
        consumerId: consumer.id,
        requestType: 'callback',
        preferredTime: preferredTime || 'anytime',
        phoneNumber: phoneNumber || consumer.phone || '',
        emailAddress: consumer.email,
        message: message || '',
        status: 'pending',
        priority: 'normal',
      });

      // Send notification to agency
      try {
        // Get admin users for this tenant
        const adminUsers = await storage.getPlatformUsersByTenant(tenant.id);
        
        if (adminUsers.length > 0) {
          const consumerName = `${consumer.firstName} ${consumer.lastName}`;
          const emailSubject = `New Callback Request from ${consumerName}`;
          const emailBody = `
            <h2>New Callback Request</h2>
            <p>A consumer has requested a callback.</p>
            <h3>Consumer Details:</h3>
            <ul>
              <li><strong>Name:</strong> ${consumerName}</li>
              <li><strong>Email:</strong> ${consumer.email}</li>
              <li><strong>Phone:</strong> ${phoneNumber || consumer.phone || 'Not provided'}</li>
            </ul>
            <h3>Request Details:</h3>
            <ul>
              <li><strong>Preferred Time:</strong> ${preferredTime || 'Anytime'}</li>
              ${message ? `<li><strong>Message:</strong> ${message}</li>` : ''}
              <li><strong>Requested At:</strong> ${new Date().toLocaleString()}</li>
            </ul>
            <p>Please log in to your agency dashboard to respond to this request.</p>
          `;

          // Send email to all admin users
          for (const admin of adminUsers) {
            if (admin.userDetails?.email) {
              await emailService.sendEmail({
                to: admin.userDetails.email,
                subject: emailSubject,
                html: emailBody,
                from: `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>`,
              });
            }
          }
        }
      } catch (emailError) {
        console.error("Error sending callback notification email:", emailError);
        // Don't fail the request if email fails
      }
      
      // Send callback request to SMAX as notes for all consumer accounts with filenumbers
      // This is especially important for arrangement change requests
      try {
        const consumerAccounts = await storage.getAccountsByConsumer(consumer.id);
        
        for (const account of consumerAccounts) {
          if (account.filenumber) {
            console.log('📤 Sending callback request to SMAX for account:', account.filenumber);
            
            const consumerName = `${consumer.firstName} ${consumer.lastName}`;
            const noteMessage = message 
              ? `CONSUMER CALLBACK REQUEST: ${consumerName} (${consumer.email}) requested callback. Preferred time: ${preferredTime || 'Anytime'}. Message: ${message}. Phone: ${phoneNumber || consumer.phone || 'Not provided'}`
              : `CONSUMER CALLBACK REQUEST: ${consumerName} (${consumer.email}) requested callback. Preferred time: ${preferredTime || 'Anytime'}. Phone: ${phoneNumber || consumer.phone || 'Not provided'}`;
            
            const smaxNote = {
              filenumber: account.filenumber,
              logmessage: noteMessage,
              collectorname: 'Consumer Portal'
            };
            
            const smaxSuccess = await smaxService.insertNote(tenant.id, smaxNote);
            if (smaxSuccess) {
              console.log('✅ Callback request sent to SMAX successfully');
            } else {
              console.log('⚠️ Failed to send callback request to SMAX (non-blocking)');
            }
          }
        }
      } catch (smaxError) {
        console.error('⚠️ Error sending callback request to SMAX (non-blocking):', smaxError);
        // Don't fail the request if SMAX sync fails
      }

      res.json({ 
        message: "Callback request submitted successfully", 
        requestId: callbackRequest.id 
      });
    } catch (error) {
      console.error("Error creating consumer callback request:", error);
      res.status(500).json({ message: "Failed to submit callback request" });
    }
  });

  // Test USAePay connection endpoint
  app.post('/api/usaepay/test-connection', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const settings = await storage.getTenantSettings(tenantId);
      
      if (!settings) {
        return res.status(404).json({ success: false, message: "Settings not found" });
      }

      const { merchantApiKey, merchantApiPin, merchantName, useSandbox } = settings;

      console.log('🔍 USAePay Test - Credentials found:', {
        hasApiKey: !!merchantApiKey,
        apiKeyLength: merchantApiKey?.length || 0,
        hasApiPin: !!merchantApiPin,
        apiPinLength: merchantApiPin?.length || 0,
        merchantName,
        useSandbox
      });

      if (!merchantApiKey || !merchantApiPin) {
        return res.status(400).json({ 
          success: false, 
          message: "USAePay credentials not configured. Please add your API Key and PIN." 
        });
      }

      // Determine API endpoint based on sandbox mode
      const baseUrl = useSandbox 
        ? "https://sandbox.usaepay.com/api/v2"
        : "https://secure.usaepay.com/api/v2";

      console.log('🔗 Testing connection to:', baseUrl);

      // Create proper USAePay API v2 authentication header with hash
      const authHeader = generateUSAePayAuthHeader(merchantApiKey, merchantApiPin);

      // Test connection by making a simple API call (get merchant info)
      const testResponse = await fetch(`${baseUrl}/merchant`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      console.log('📡 USAePay Response:', {
        status: testResponse.status,
        statusText: testResponse.statusText,
        ok: testResponse.ok
      });

      if (testResponse.ok) {
        try {
          const merchantData = await testResponse.json();
          console.log('✅ USAePay connection successful:', merchantData);
          return res.json({ 
            success: true, 
            message: `Successfully connected to ${useSandbox ? 'Sandbox' : 'Production'} USAePay`,
            merchantName: merchantData.name || merchantName || "Unknown",
            mode: useSandbox ? 'sandbox' : 'production'
          });
        } catch (e) {
          // Empty response body but 200 OK - consider it a success
          console.log('✅ USAePay connection successful (empty response)');
          return res.json({ 
            success: true, 
            message: `Successfully connected to ${useSandbox ? 'Sandbox' : 'Production'} USAePay`,
            merchantName: merchantName || "Unknown",
            mode: useSandbox ? 'sandbox' : 'production'
          });
        }
      } else {
        const errorData = await testResponse.text();
        console.error('❌ USAePay connection failed:', errorData);
        
        // Common error messages
        let message = 'Connection failed. ';
        if (testResponse.status === 401) {
          message += 'Invalid API Key or PIN. Please verify your credentials.';
        } else if (testResponse.status === 403) {
          message += 'Access forbidden. Please check your account permissions.';
        } else if (testResponse.status === 404) {
          message += 'API endpoint not found. Please verify your USAePay account.';
        } else {
          message += `${testResponse.statusText}. Please verify your credentials.`;
        }
        
        return res.json({ 
          success: false, 
          message,
          error: errorData,
          status: testResponse.status
        });
      }
    } catch (error: any) {
      console.error("❌ USAePay test connection error:", error);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to test connection. Please check your credentials and try again.",
        error: error.message 
      });
    }
  });

  // Test Authorize.net connection endpoint
  app.post('/api/authorizenet/test-connection', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const settings = await storage.getTenantSettings(tenantId);
      if (!settings) {
        return res.status(404).json({ success: false, message: "Settings not found" });
      }

      const { authnetApiLoginId, authnetTransactionKey, useSandbox } = settings;

      if (!authnetApiLoginId || !authnetTransactionKey) {
        return res.status(400).json({
          success: false,
          message: "Authorize.net credentials not configured. Please add your API Login ID and Transaction Key."
        });
      }

      console.log('🔍 Authorize.net Test - Credentials found:', {
        apiLoginId: authnetApiLoginId.substring(0, 4) + '****',
        mode: useSandbox ? 'sandbox' : 'production'
      });

      const authnetService = new AuthnetService({
        apiLoginId: authnetApiLoginId,
        transactionKey: authnetTransactionKey,
        useSandbox: useSandbox ?? true,
      });

      const result = await authnetService.testConnection();

      if (result.success) {
        return res.json({
          success: true,
          message: result.message,
          mode: useSandbox ? 'sandbox' : 'production'
        });
      } else {
        return res.json({
          success: false,
          message: result.message
        });
      }
    } catch (error: any) {
      console.error("❌ Authorize.net test connection error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to test connection. Please check your credentials and try again.",
        error: error.message
      });
    }
  });

  // Test NMI connection endpoint
  app.post('/api/nmi/test-connection', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const settings = await storage.getTenantSettings(tenantId);
      if (!settings) {
        return res.status(404).json({ success: false, message: "Settings not found" });
      }

      const { nmiSecurityKey } = settings;

      if (!nmiSecurityKey) {
        return res.status(400).json({
          success: false,
          message: "NMI credentials not configured. Please add your Security Key."
        });
      }

      console.log('🔍 NMI Test - Validating credentials...');

      const { NMIService } = await import('./nmiService');
      const nmiService = new NMIService({
        securityKey: nmiSecurityKey,
      });

      const result = await nmiService.testConnection();

      if (result.success) {
        return res.json({
          success: true,
          message: result.message || 'Successfully connected to NMI',
        });
      } else {
        return res.json({
          success: false,
          message: result.message || 'Failed to connect to NMI'
        });
      }
    } catch (error: any) {
      console.error("❌ NMI test connection error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to test connection. Please check your credentials and try again.",
        error: error.message
      });
    }
  });

  // Helper function to generate USAePay API v2 authentication header
  function generateUSAePayAuthHeader(apiKey: string, apiPin: string): string {
    // Generate 16-character random seed
    const seed = Array.from({ length: 16 }, () => 
      Math.random().toString(36).charAt(2)
    ).join('');
    
    // Create prehash: apikey + seed + apipin
    const prehash = apiKey + seed + apiPin;
    
    // Create SHA-256 hash
    const hash = crypto.createHash('sha256').update(prehash).digest('hex');
    
    // Create apihash: s2/seed/hash
    const apihash = `s2/${seed}/${hash}`;
    
    // Create final auth key: base64(apikey:apihash)
    const authKey = Buffer.from(`${apiKey}:${apihash}`).toString('base64');
    
    return `Basic ${authKey}`;
  }

  // Helper function to process successful payment (unified for all processors)
  async function processSuccessfulPayment(params: {
    tenantId: string;
    consumerId: string;
    accountId: string | null;
    account: any;
    amountCents: number;
    transactionId: string | null;
    processorResponse: any;
    cardLast4: string;
    cardName: string;
    zipCode?: string;
    arrangement: any;
    settings: any;
    isSmaxArrangementPayment?: boolean;
  }): Promise<any> {
    const {
      tenantId,
      consumerId,
      accountId,
      account,
      amountCents,
      transactionId,
      processorResponse,
      cardLast4,
      cardName,
      zipCode,
      arrangement,
      settings,
      isSmaxArrangementPayment = false,
    } = params;

    console.log('💾 Processing successful payment...');

    // Create payment record with enhanced error logging
    const paymentData = {
      tenantId,
      consumerId,
      accountId: accountId || null,
      amountCents,
      paymentMethod: 'credit_card',
      status: 'completed',
      transactionId: transactionId || undefined,
      processorResponse: JSON.stringify(processorResponse),
      processedAt: new Date(),
      notes: arrangement
        ? `${arrangement.name} - ${cardName} ending in ${cardLast4}`
        : `Online payment - ${cardName} ending in ${cardLast4}`,
    };

    console.log('💾 Attempting to create payment record in database:', {
      tenantId,
      consumerId,
      accountId,
      amountCents,
      transactionId,
      cardLast4,
      timestamp: new Date().toISOString()
    });

    let payment;
    try {
      payment = await storage.createPayment(paymentData);
      
      console.log('✅ Payment record created successfully:', {
        paymentId: payment.id,
        amountCents: payment.amountCents,
        status: payment.status,
        transactionId: payment.transactionId
      });
    } catch (dbError: any) {
      console.error('❌❌❌ CRITICAL: Database payment insert failed! ❌❌❌');
      console.error('Payment data that failed to save:', {
        tenantId,
        consumerId,
        accountId,
        amountCents: amountCents / 100, // Show dollars
        transactionId,
        cardLast4,
        processorName: settings?.merchantProvider || 'unknown',
        timestamp: new Date().toISOString()
      });
      console.error('Database error details:', {
        name: dbError.name,
        message: dbError.message,
        code: dbError.code,
        constraint: dbError.constraint,
        detail: dbError.detail,
        stack: dbError.stack
      });
      console.error('⚠️ PROCESSOR CHARGED BUT DATABASE FAILED - MANUAL RECONCILIATION REQUIRED');
      
      // Rethrow original error to preserve stack trace
      // Outer error handler will return generic message to client
      throw dbError;
    }

    // Trigger payment event for sequence enrollment
    await eventService.emitSystemEvent('payment_received', {
      tenantId,
      consumerId,
      accountId: accountId || undefined,
      metadata: { paymentId: payment.id, amountCents, transactionId }
    });
    
    // Trigger one_time_payment event if not part of an arrangement (standalone payment)
    // Exclude SMAX arrangement payments - they're payments on existing external arrangements
    if (!arrangement && !isSmaxArrangementPayment) {
      await eventService.emitSystemEvent('one_time_payment', {
        tenantId,
        consumerId,
        accountId: accountId || undefined,
        metadata: { paymentId: payment.id, amountCents, transactionId }
      });
    }
    
    // NOTE: SMAX payment sync is handled by each processor section (NMI, Authorize.net, USAePay)
    // after calling this helper, because they have access to card expiry, token, and other details
    // that this helper doesn't receive.

    // Update account balance if accountId exists
    if (accountId) {
      console.log('💰 [BALANCE UPDATE] Starting balance update for account:', accountId);
      // Re-read the account fresh to get current balance
      const freshAccount = await storage.getAccount(accountId);
      if (freshAccount) {
        const previousBalance = freshAccount.balanceCents || 0;
        const newBalance = Math.max(0, previousBalance - amountCents);
        console.log('💰 [BALANCE UPDATE] Calculating:', {
          accountId,
          previousBalance,
          paymentAmount: amountCents,
          newBalance,
          formula: `max(0, ${previousBalance} - ${amountCents}) = ${newBalance}`
        });
        const updatedAccount = await storage.updateAccount(accountId, { balanceCents: newBalance });
        console.log('💰 [BALANCE UPDATE] Update complete:', {
          accountId,
          balanceAfterUpdate: updatedAccount?.balanceCents,
          success: updatedAccount?.balanceCents === newBalance
        });
      } else {
        console.error('❌ [BALANCE UPDATE] Account not found:', accountId);
      }
    } else {
      console.log('⚠️ [BALANCE UPDATE] No accountId provided, skipping balance update');
    }

    // Send notification to admins about successful payment
    const consumer = await storage.getConsumer(consumerId);
    console.log('📧 Payment Email Notification Check:', {
      hasConsumer: !!consumer,
      consumerName: consumer ? `${consumer.firstName} ${consumer.lastName}` : 'N/A',
      accountNumber: account?.accountNumber || 'N/A',
      amountCents,
      amountDollars: (amountCents / 100).toFixed(2),
      transactionId
    });
    
    if (consumer) {
      console.log('📧 Sending payment notification to tenant admins...');
      await notifyTenantAdmins({
        tenantId,
        subject: 'New Payment Received',
        eventType: 'payment_made',
        consumer: {
          firstName: consumer.firstName || '',
          lastName: consumer.lastName || '',
          email: consumer.email || '',
        },
        amount: amountCents,
      }).catch(err => console.error('❌ Failed to send payment notification to admins:', err));

      console.log('📧 Sending payment notification to contact email...');
      await emailService.sendPaymentNotification({
        tenantId,
        consumerName: `${consumer.firstName} ${consumer.lastName}`,
        accountNumber: account?.accountNumber || 'N/A',
        amountCents,
        paymentMethod: 'Credit Card',
        transactionId: transactionId || undefined,
        paymentType: 'one_time',
      }).catch(err => console.error('❌ Failed to send payment notification to contact email:', err));
      
      console.log('✅ Payment notifications sent successfully');
    } else {
      console.warn('⚠️ Consumer not found - skipping payment notifications');
    }

    return payment;
  }

  // Consumer payment processing endpoint
  app.post('/api/consumer/payments/process', authenticateConsumer, async (req: any, res) => {
    console.log('🎯 === CONSUMER PAYMENT REQUEST RECEIVED ===');
    console.log('📥 Request body:', JSON.stringify({
      ...req.body,
      cardNumber: req.body.cardNumber ? '****' + req.body.cardNumber.slice(-4) : 'none',
      cvv: req.body.cvv ? '***' : 'none'
    }, null, 2));
    
    try {
      const { id: consumerId, tenantId } = req.consumer || {};

      if (!consumerId || !tenantId) {
        console.log('❌ Unauthorized: No consumer ID or tenant ID');
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      console.log('👤 Consumer:', { consumerId, tenantId });

      const {
        accountId,
        arrangementId,
        cardNumber,
        expiryMonth,
        expiryYear,
        cvv,
        cardName,
        zipCode,
        saveCard,
        setupRecurring,
        firstPaymentDate,
        customPaymentAmountCents,
        paymentDate, // For retrying failed SMAX payments with specific date
        simplifiedFlow, // New simplified arrangement flow data
        opaqueDataDescriptor, // Authorize.net tokenized data
        opaqueDataValue // Authorize.net tokenized data
      } = req.body;

      let normalizedFirstPaymentDate: Date | null = null;
      if (firstPaymentDate) {
        const parsedDate = new Date(firstPaymentDate);
        if (Number.isNaN(parsedDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid first payment date provided",
          });
        }
        parsedDate.setHours(0, 0, 0, 0);
        
        // Validate first payment date is not more than 1 month out
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const oneMonthFromNow = new Date(today);
        oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
        
        if (parsedDate > oneMonthFromNow) {
          return res.status(400).json({
            success: false,
            message: "First payment date cannot be more than one month in the future",
          });
        }
        
        normalizedFirstPaymentDate = parsedDate;
      } else if (setupRecurring && arrangementId) {
        // If setting up recurring but no date provided, default to today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        normalizedFirstPaymentDate = today;
      }

      // Parse paymentDate for one-time payments (used for retrying failed SMAX payments)
      // This date is ONLY for SMAX sync attribution, not for the actual processedAt timestamp
      let normalizedPaymentDate: Date | null = null;
      if (paymentDate) {
        // Validate date format (YYYY-MM-DD)
        if (typeof paymentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
          return res.status(400).json({
            success: false,
            message: "Payment date must be in YYYY-MM-DD format",
          });
        }
        
        const parsedDate = new Date(paymentDate + 'T00:00:00.000Z'); // Parse as UTC to avoid timezone issues
        if (Number.isNaN(parsedDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid payment date provided",
          });
        }
        
        // Prevent future dates - payment can only be for today or past dates
        const todayUTC = new Date();
        todayUTC.setHours(0, 0, 0, 0);
        if (parsedDate > todayUTC) {
          return res.status(400).json({
            success: false,
            message: "Payment date cannot be in the future",
          });
        }
        
        normalizedPaymentDate = parsedDate;
        console.log('📅 Payment date specified for SMAX retry:', normalizedPaymentDate.toISOString().split('T')[0]);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Validate payment data - either raw card data or Authorize.net tokenized data
      const hasRawCardData = cardNumber && expiryMonth && expiryYear && cvv;
      const hasAuthnetToken = opaqueDataDescriptor && opaqueDataValue;
      
      if (!accountId || !cardName || (!hasRawCardData && !hasAuthnetToken)) {
        return res.status(400).json({ message: "Missing required payment information" });
      }

      // Fetch and validate the account belongs to this consumer
      const account = await storage.getAccount(accountId);
      if (!account || account.consumerId !== consumerId || account.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied to this account" });
      }
      
      // Check if account status is blocked (configured per tenant)
      // This checks SMAX statusname (if SMAX enabled) or Chain's account status
      const tenantSettings = await storage.getTenantSettings(tenantId);
      const statusValidation = await validatePaymentStatus(account, tenantId, tenantSettings);
      if (statusValidation.isBlocked) {
        console.log(`❌ Payment blocked: ${statusValidation.reason}`);
        return res.status(403).json({ 
          success: false,
          message: "This account is not eligible for payments at this time. Please contact us for assistance." 
        });
      }

      // DUPLICATE PAYMENT PROTECTION: Check if a similar payment was processed recently
      // This prevents double-charges from network timeouts, double-clicks, or browser back/refresh
      const paymentAmountToCheck = customPaymentAmountCents || account.balanceCents || 0;
      if (paymentAmountToCheck > 0) {
        const recentDuplicate = await storage.checkRecentDuplicatePayment(
          consumerId,
          accountId,
          paymentAmountToCheck,
          5 // 5-minute window
        );
        
        if (recentDuplicate) {
          console.log(`⚠️ DUPLICATE PAYMENT BLOCKED: Found recent payment for same consumer/account/amount`, {
            existingPaymentId: recentDuplicate.id,
            existingTransactionId: recentDuplicate.transactionId,
            existingCreatedAt: recentDuplicate.createdAt,
            consumerId,
            accountId,
            amountCents: paymentAmountToCheck
          });
          return res.status(409).json({
            success: false,
            message: "A payment for this amount was already processed within the last few minutes. Please check your payment history before trying again.",
            existingPaymentId: recentDuplicate.id,
            existingTransactionId: recentDuplicate.transactionId
          });
        }
      }

      // Check if Force Arrangement is enabled - reject one-time payments if so
      // But allow SMAX arrangement payments (external arrangements from SMAX system)
      if (tenantSettings?.forceArrangement) {
        // Detect SMAX arrangement payments: filenumber-linked account with custom amount
        const isSmaxArrangementPayment = !!account.filenumber && !!customPaymentAmountCents && !arrangementId && !simplifiedFlow;
        
        // If no arrangement is being set up AND not a SMAX arrangement payment, this is a standalone one-time payment
        if (!arrangementId && !simplifiedFlow && !isSmaxArrangementPayment) {
          console.log('❌ Force Arrangement enabled - rejecting one-time payment');
          return res.status(400).json({
            success: false,
            message: "One-time payments are not available. Please set up a payment arrangement to proceed."
          });
        }
        
        if (isSmaxArrangementPayment) {
          console.log('✅ Force Arrangement enabled but allowing SMAX arrangement payment:', {
            filenumber: account.filenumber,
            customPaymentAmountCents
          });
        }
      }

      // Get arrangement if specified
      let arrangement = null;
      let amountCents = account.balanceCents || 0;
      let isSimplifiedFlow = false;
      let simplifiedArrangementData = null;
      
      console.log('📋 Arrangement check:', {
        hasArrangementId: !!arrangementId,
        hasSimplifiedFlow: !!simplifiedFlow,
        arrangementId,
        accountBalance: amountCents,
        forceArrangement: tenantSettings?.forceArrangement
      });
      
      // Handle simplified flow (new consumer-friendly arrangement creation)
      if (simplifiedFlow) {
        isSimplifiedFlow = true;
        const { paymentMethod, selectedTerm, paymentFrequency, calculatedPaymentCents } = simplifiedFlow;
        
        console.log('✨ Processing simplified flow:', {
          paymentMethod,
          selectedTerm,
          paymentFrequency,
          calculatedPaymentCents
        });
        
        // Validate simplified flow data
        if (!paymentMethod || !paymentFrequency || !calculatedPaymentCents) {
          return res.status(400).json({ 
            success: false,
            message: "Invalid payment arrangement data" 
          });
        }
        
        // For term-based method, require selectedTerm
        if (paymentMethod === 'term' && !selectedTerm) {
          return res.status(400).json({ 
            success: false,
            message: "Please select a payment term (3, 6, or 12 months)" 
          });
        }
        
        // Use the calculated payment amount
        amountCents = calculatedPaymentCents;
        
        // Store simplified arrangement data for payment schedule creation
        simplifiedArrangementData = {
          paymentMethod,
          selectedTerm,
          paymentFrequency,
          amountCents: calculatedPaymentCents
        };
        
        console.log('✅ Simplified flow validated:', simplifiedArrangementData);
      }
      
      // CRITICAL: If customPaymentAmountCents is provided WITHOUT an arrangement
      // (e.g., SMAX arrangement payments), use it instead of full balance
      // Also detect this as an SMAX arrangement payment for event handling
      const isSmaxArrangementPayment = !!account.filenumber && !!customPaymentAmountCents && !arrangementId && !isSimplifiedFlow;
      
      if (!isSimplifiedFlow && !arrangementId && customPaymentAmountCents && customPaymentAmountCents > 0) {
        amountCents = customPaymentAmountCents;
        console.log('💰 Using custom payment amount (SMAX arrangement):', {
          customPaymentAmountCents,
          amountDollars: (customPaymentAmountCents / 100).toFixed(2),
          originalBalance: account.balanceCents,
          isSmaxArrangementPayment
        });
      }
      
      if (arrangementId) {
        const arrangements = await storage.getArrangementOptionsByTenant(tenantId);
        console.log('📋 Available arrangements:', {
          count: arrangements.length,
          arrangementIds: arrangements.map(a => a.id),
          requestedId: arrangementId
        });
        
        arrangement = arrangements.find(arr => arr.id === arrangementId);
        
        if (!arrangement) {
          console.log('❌ Arrangement not found:', { arrangementId, availableIds: arrangements.map(a => a.id) });
          return res.status(400).json({ message: "Invalid arrangement selected" });
        }

        console.log('✅ Arrangement found:', {
          id: arrangement.id,
          name: arrangement.name,
          planType: arrangement.planType,
          minBalance: arrangement.minBalance,
          maxBalance: arrangement.maxBalance
        });

        // Validate account balance is within arrangement's min/max range
        const accountBalance = account.balanceCents || 0;
        if (accountBalance < arrangement.minBalance || accountBalance > arrangement.maxBalance) {
          console.log('❌ Account balance outside arrangement range:', {
            accountBalance,
            minBalance: arrangement.minBalance,
            maxBalance: arrangement.maxBalance
          });
          return res.status(400).json({ 
            success: false,
            message: "This payment plan is not available for your current balance" 
          });
        }

        // Calculate payment amount based on arrangement type
        console.log('💰 Calculating payment amount for arrangement type:', arrangement.planType);
        
        if (arrangement.planType === 'one_time_payment') {
          // One-time payment: use custom amount provided by consumer
          if (!customPaymentAmountCents || customPaymentAmountCents <= 0) {
            console.log('❌ Invalid custom payment amount:', customPaymentAmountCents);
            return res.status(400).json({ 
              success: false,
              message: "Please enter a valid payment amount for one-time payment" 
            });
          }

          // Validate against minimum payment amount
          const minAmount = arrangement.oneTimePaymentMin || 0;
          if (customPaymentAmountCents < minAmount) {
            console.log('❌ Payment below minimum:', { customPaymentAmountCents, minAmount });
            return res.status(400).json({ 
              success: false,
              message: `Minimum payment amount is $${(minAmount / 100).toFixed(2)}` 
            });
          }

          // Validate against maximum (account balance)
          if (customPaymentAmountCents > accountBalance) {
            console.log('❌ Payment exceeds balance:', { customPaymentAmountCents, accountBalance });
            return res.status(400).json({ 
              success: false,
              message: `Payment amount cannot exceed your balance of $${(accountBalance / 100).toFixed(2)}` 
            });
          }

          amountCents = customPaymentAmountCents;
          console.log('✅ One-time payment amount set:', {
            customAmount: customPaymentAmountCents,
            customAmountDollars: (customPaymentAmountCents / 100).toFixed(2),
            minAmount: minAmount,
            accountBalance: accountBalance
          });
        } else if (arrangement.planType === 'settlement' && arrangement.payoffPercentageBasisPoints) {
          // Settlement: percentage of balance
          amountCents = Math.round(amountCents * arrangement.payoffPercentageBasisPoints / 10000);
          console.log('✅ Settlement amount calculated:', {
            percentage: arrangement.payoffPercentageBasisPoints / 100,
            amountCents
          });
        } else if (arrangement.planType === 'fixed_monthly' && arrangement.fixedMonthlyPayment) {
          // Fixed monthly payment
          amountCents = arrangement.fixedMonthlyPayment;
          console.log('✅ Fixed monthly amount set:', { amountCents });
        } else if (arrangement.planType === 'range' && arrangement.monthlyPaymentMin) {
          // Range: use minimum payment for recurring
          amountCents = arrangement.monthlyPaymentMin;
          console.log('✅ Range minimum amount set:', { amountCents });
        }
      }
      
      console.log('💵 Final payment amount:', {
        amountCents,
        amountDollars: (amountCents / 100).toFixed(2)
      });
      
      if (amountCents <= 0) {
        console.log('❌ Invalid final payment amount:', amountCents);
        return res.status(400).json({ message: "Invalid payment amount" });
      }

      // Universal balance validation for ALL payment types
      const accountBalance = account.balanceCents || 0;
      if (amountCents > accountBalance) {
        console.log('❌ Payment exceeds balance:', { amountCents, accountBalance });
        return res.status(400).json({ 
          success: false,
          message: `Payment amount cannot exceed your balance of $${(accountBalance / 100).toFixed(2)}` 
        });
      }

      // Check if payment processing is enabled for this tenant (trial mode restriction)
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Agency not found" });
      }

      if (!tenant.paymentProcessingEnabled) {
        console.log('❌ Payment blocked: Payment processing disabled for this tenant (trial mode)');
        return res.status(403).json({ 
          success: false,
          message: "Payment processing is currently unavailable for your account. Please contact your agency for assistance." 
        });
      }

      // Get tenant settings to check if online payments are enabled
      const settings = await storage.getTenantSettings(tenantId);
      if (!settings?.enableOnlinePayments) {
        return res.status(403).json({ 
          success: false,
          message: "Online payments are currently disabled. Please contact your agency to make a payment." 
        });
      }

      // Determine which merchant provider is configured
      const merchantProvider = settings.merchantProvider || 'usaepay';
      const useSandbox = settings.useSandbox;

      console.log('🏦 Merchant provider:', merchantProvider);

      // Validate merchant credentials are configured
      if (merchantProvider === 'authorize_net') {
        const authnetApiLoginId = settings.authnetApiLoginId?.trim();
        const authnetTransactionKey = settings.authnetTransactionKey?.trim();

        if (!authnetApiLoginId || !authnetTransactionKey) {
          console.error("Authorize.net credentials not configured for tenant:", tenantId);
          return res.status(500).json({ message: "Payment processing is not configured. Please contact your agency." });
        }

        console.log('🔑 Authorize.net credentials check:', {
          apiLoginIdLength: authnetApiLoginId.length,
          apiLoginIdFirst3: authnetApiLoginId.substring(0, 3),
          useSandbox
        });
      } else if (merchantProvider === 'nmi') {
        // NMI credentials
        const nmiSecurityKey = settings.nmiSecurityKey?.trim();

        if (!nmiSecurityKey) {
          console.error("NMI credentials not configured for tenant:", tenantId);
          return res.status(500).json({ message: "Payment processing is not configured. Please contact your agency." });
        }

        console.log('🔑 NMI credentials check: credentials configured');
      } else {
        // USAePay credentials
        const merchantApiKey = settings.merchantApiKey?.trim();
        const merchantApiPin = settings.merchantApiPin?.trim();

        if (!merchantApiKey || !merchantApiPin) {
          console.error("USAePay credentials not configured for tenant:", tenantId);
          return res.status(500).json({ message: "Payment processing is not configured. Please contact your agency." });
        }

        console.log('🔑 USAePay credentials check:', {
          apiKeyLength: merchantApiKey.length,
          pinLength: merchantApiPin.length,
          apiKeyFirst3: merchantApiKey.substring(0, 3),
          pinFirst3: merchantApiPin.substring(0, 3),
          useSandbox,
          hasWhitespace: {
            apiKey: settings.merchantApiKey !== merchantApiKey,
            pin: settings.merchantApiPin !== merchantApiPin,
          }
        });
      }

      // Route to appropriate payment processor
      if (merchantProvider === 'authorize_net') {
        // ===== AUTHORIZE.NET PAYMENT PROCESSING =====
        console.log('🔵 Processing payment with Authorize.net');
        
        const authnetService = new AuthnetService({
          apiLoginId: settings.authnetApiLoginId!.trim(),
          transactionKey: settings.authnetTransactionKey!.trim(),
          useSandbox: useSandbox ?? true,
        });

        // Process payment using tokenized data from Accept.js
        // Authorize.net limits invoice number to 20 characters, so truncate UUIDs
        const invoiceNumber = accountId ? accountId.substring(0, 20) : `c_${consumerId.substring(0, 17)}`;
        const paymentResult = await authnetService.processPayment({
          amount: amountCents / 100, // Convert cents to dollars
          opaqueDataDescriptor,
          opaqueDataValue,
          invoice: invoiceNumber,
          description: arrangement ? `${arrangement.name} - Payment for account` : `Payment for account`,
        });

        if (!paymentResult.success) {
          console.error('❌ Authorize.net payment failed:', paymentResult.errorMessage);
          
          // Auto-change account status to "declined" when payment fails
          if (accountId && account.tenantId === tenantId) {
            try {
              const currentStatus = account.status?.toLowerCase();
              // Only change if not already terminal status (recalled/closed)
              if (currentStatus !== 'recalled' && currentStatus !== 'closed') {
                await storage.updateAccount(accountId, { status: "declined" });
                console.log(`🔄 Auto-changed account ${accountId} status to "declined" (payment declined)`);
              }
            } catch (statusError) {
              console.error('Failed to auto-update account status on payment decline:', statusError);
            }
          }
          
          return res.status(400).json({
            success: false,
            message: paymentResult.errorMessage || 'Payment declined',
          });
        }

        console.log('✅ Authorize.net payment approved:', {
          transactionId: paymentResult.transactionId,
          authCode: paymentResult.authCode,
        });

        // Extract card details from payment result
        const cardLast4 = paymentResult.cardLast4 || opaqueDataValue?.slice(-4) || 'XXXX';
        const cardBrand = paymentResult.cardType || 'unknown';

        // Use unified payment processing helper for successful payments
        // This handles: payment record creation, balance updates, events, and notifications
        const payment = await processSuccessfulPayment({
          tenantId,
          consumerId,
          accountId,
          account,
          amountCents,
          transactionId: paymentResult.transactionId || `authnet_${Date.now()}`,
          processorResponse: paymentResult,
          cardLast4,
          cardName: cardName || '',
          zipCode,
          arrangement,
          settings,
        });

        // Sync payment to SMAX if enabled and account has filenumber
        const consumer = await storage.getConsumer(consumerId);
        if (settings.smaxEnabled && account.filenumber && consumer) {
          try {
            const { smaxService } = await import('./smaxService');
            const payorName = `${consumer.firstName || ''} ${consumer.lastName || ''}`.trim() || 'Consumer';
            
            console.log('📤 Sending Authorize.net payment to SMAX:', {
              filenumber: account.filenumber,
              payorName,
              amount: (amountCents / 100).toFixed(2),
              transactionId: paymentResult.transactionId,
              status: 'PROCESSED'
            });
            
            await smaxService.insertPayment(tenantId, {
              filenumber: account.filenumber,
              paymentdate: new Date().toISOString().split('T')[0],
              payorname: payorName,
              paymentmethod: 'CREDIT CARD',
              paymentstatus: 'PROCESSED',
              typeofpayment: 'Online',
              checkaccountnumber: '',
              checkroutingnumber: '',
              checkaccounttype: '',
              checkaddress: '',
              checkcity: '',
              checkstate: '',
              checkzip: '',
              cardtype: cardBrand || '',
              cardnumber: cardLast4 ? `****${cardLast4}` : '',
              threedigitnumber: '',
              cardexpirationmonth: expiryMonth || '',
              cardexpirationyear: expiryYear || '',
              cardexpirationdate: expiryMonth && expiryYear ? `${expiryMonth}/${expiryYear.slice(-2)}` : '',
              paymentamount: (amountCents / 100).toFixed(2),
              acceptedfees: '0.00',
              printed: 'No',
              invoice: paymentResult.transactionId || '',
              cardLast4: cardLast4,
              transactionid: paymentResult.transactionId || undefined,
            });

            console.log('✅ Authorize.net payment synced to SMAX');
          } catch (smaxError) {
            console.error('Failed to sync Authorize.net payment to SMAX:', smaxError);
          }
        }

        // Create customer payment profile and save payment method if needed
        let savedPaymentMethod = null;
        const needsPaymentProfile = saveCard || setupRecurring || (normalizedFirstPaymentDate !== null && normalizedFirstPaymentDate.getTime() > today.getTime());

        if (needsPaymentProfile) {
          console.log('🔐 Creating Authorize.net customer payment profile...');
          
          const profileResult = await authnetService.createCustomerPaymentProfile({
            opaqueDataDescriptor,
            opaqueDataValue,
            customerId: consumerId,
            email: consumer?.email || undefined,
            billingAddress: {
              firstName: consumer?.firstName || '',
              lastName: consumer?.lastName || '',
              zip: zipCode || '',
            },
          });

          if (profileResult.success && profileResult.customerProfileId && profileResult.paymentProfileId) {
            console.log('✅ Authorize.net payment profile created:', {
              customerProfileId: profileResult.customerProfileId,
              paymentProfileId: profileResult.paymentProfileId,
            });

            // Save payment method to database with combined profile ID
            const paymentToken = `${profileResult.customerProfileId}|${profileResult.paymentProfileId}`;
            savedPaymentMethod = await storage.createPaymentMethod({
              tenantId,
              consumerId,
              paymentToken,
              cardLast4,
              cardBrand,
              cardholderName: cardName,
              expiryMonth: expiryMonth,
              expiryYear: expiryYear,
              billingZip: zipCode || null,
              isDefault: true,
            });

            console.log('✅ Payment method saved to database');
          } else {
            console.error('❌ Failed to create Authorize.net payment profile:', profileResult.errorMessage);
          }
        }

        // Create payment schedule if arrangement and saved payment method exist
        let createdSchedule: any = null;
        if (arrangement && savedPaymentMethod) {
          const paymentStartDate = normalizedFirstPaymentDate ? new Date(normalizedFirstPaymentDate) : new Date();
          const nextMonth = new Date(paymentStartDate);
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          let remainingPayments = null;
          let endDate = null;

          // Check if this is a multi-payment settlement (hoist for later use)
          const isMultiPaymentSettlement = arrangement.planType === 'settlement' && arrangement.settlementPaymentCount && arrangement.settlementPaymentCount > 1;

          if (arrangement.planType === 'settlement') {
            
            if (isMultiPaymentSettlement) {
              // Multi-payment settlement - create a payment schedule
              const settlementPaymentCount = Number(arrangement.settlementPaymentCount);
              const isImmediatePayment = !normalizedFirstPaymentDate || normalizedFirstPaymentDate.getTime() <= today.getTime();
              remainingPayments = isImmediatePayment ? settlementPaymentCount - 1 : settlementPaymentCount;
              endDate = new Date(paymentStartDate);
              
              // Calculate end date - last payment is always (count-1) periods from start
              const frequency = arrangement.settlementPaymentFrequency || 'monthly';
              const periodsUntilLastPayment = settlementPaymentCount - 1;
              
              if (frequency === 'weekly') {
                endDate.setDate(endDate.getDate() + (periodsUntilLastPayment * 7));
              } else if (frequency === 'biweekly') {
                endDate.setDate(endDate.getDate() + (periodsUntilLastPayment * 14));
              } else {
                endDate.setMonth(endDate.getMonth() + periodsUntilLastPayment);
              }
            } else if (normalizedFirstPaymentDate && normalizedFirstPaymentDate.getTime() > today.getTime()) {
              // Single-payment settlement with future date
              remainingPayments = 1;
              endDate = new Date(paymentStartDate);
            }
          } else if (arrangement.planType === 'fixed_monthly' && arrangement.maxTermMonths) {
            const maxPayments = Number(arrangement.maxTermMonths);
            remainingPayments = maxPayments - 1;
            endDate = new Date(paymentStartDate);
            endDate.setMonth(endDate.getMonth() + Number(arrangement.maxTermMonths));
          } else if (arrangement.planType === 'range') {
            // Calculate remaining payments based on balance / payment amount
            const accountBalance = account.balanceCents || 0;
            const isImmediatePayment = !normalizedFirstPaymentDate || normalizedFirstPaymentDate.getTime() <= today.getTime();
            const balanceAfterImmediate = isImmediatePayment ? Math.max(0, accountBalance - amountCents) : accountBalance;
            const paymentsNeeded = balanceAfterImmediate > 0 ? Math.max(1, Math.ceil(balanceAfterImmediate / amountCents)) : 0;
            remainingPayments = paymentsNeeded;
            
            // Calculate end date based on remaining payments (assuming monthly)
            // End date is (remainingPayments - 1) months from start since first payment is at start
            if (remainingPayments > 0) {
              endDate = new Date(paymentStartDate);
              endDate.setMonth(endDate.getMonth() + Math.max(0, remainingPayments - 1));
            }
            console.log('💳 Range payment plan calculated (Authorize.net):', { accountBalance, amountCents, isImmediatePayment, balanceAfterImmediate, paymentsNeeded, remainingPayments, endDate: endDate?.toISOString() });
          }

          const shouldCreateSchedule = arrangementId && (
            arrangement.planType === 'fixed_monthly' || arrangement.planType === 'range' || isMultiPaymentSettlement
          );

          if (shouldCreateSchedule) {
            const existingSchedules = await storage.getActivePaymentSchedulesByConsumerAndAccount(consumerId, accountId, tenantId);

            if (existingSchedules && existingSchedules.length > 0) {
              return res.status(400).json({
                success: false,
                message: "You already have an active payment arrangement for this account.",
              });
            }

            try {
              createdSchedule = await storage.createPaymentSchedule({
                tenantId,
                consumerId,
                accountId,
                paymentMethodId: savedPaymentMethod.id,
                arrangementType: arrangement.planType,
                amountCents,
                frequency: 'monthly',
                startDate: paymentStartDate.toISOString().split('T')[0],
                endDate: endDate ? endDate.toISOString().split('T')[0] : null,
                nextPaymentDate: nextMonth.toISOString().split('T')[0],
                remainingPayments,
                status: 'active',
                source: 'chain',
                smaxSynced: false,
              });

              console.log('✅ Payment schedule created for Authorize.net arrangement');

              // Send arrangement notification
              if (consumer) {
                await notifyTenantAdmins({
                  tenantId,
                  subject: 'New Payment Arrangement Setup',
                  eventType: 'arrangement_setup',
                  consumer: {
                    firstName: consumer.firstName || '',
                    lastName: consumer.lastName || '',
                    email: consumer.email || '',
                  },
                  arrangementType: arrangement.name || arrangement.planType,
                }).catch(err => console.error('Failed to send arrangement notification:', err));

                await emailService.sendArrangementNotification({
                  tenantId,
                  consumerName: `${consumer.firstName} ${consumer.lastName}`,
                  accountNumber: account.accountNumber || 'N/A',
                  arrangementType: arrangement.name || arrangement.planType,
                  monthlyPayment: amountCents,
                  totalBalance: account.balanceCents || 0,
                  startDate: paymentStartDate.toISOString().split('T')[0],
                  endDate: endDate ? endDate.toISOString().split('T')[0] : undefined,
                  remainingPayments: remainingPayments || undefined,
                }).catch(err => console.error('Failed to send arrangement notification:', err));
              }

              // Update consumer status
              await storage.updateConsumer(consumerId, { paymentStatus: 'pending_payment' });

              // SMAX sync if enabled
              if (createdSchedule && settings.smaxEnabled && account.filenumber) {
                try {
                  const { smaxService } = await import('./smaxService');
                  const fileNumber = account.filenumber;
                  const arrangementName = arrangement.name || arrangement.planType;
                  const firstPaymentDate = paymentStartDate.toISOString().split('T')[0];
                  const nextPaymentDate = nextMonth.toISOString().split('T')[0];
                  const amountDollars = (amountCents / 100).toFixed(2);

                  await smaxService.insertAttempt(tenantId, {
                    filenumber: fileNumber,
                    attempttype: 'Promise To Pay',
                    attemptdate: firstPaymentDate,
                    notes: `Arrangement: ${arrangementName} | Amount: $${amountDollars} | Frequency: Monthly`,
                  });

                  await smaxService.insertNote(tenantId, {
                    filenumber: fileNumber,
                    collectorname: consumer ? `${consumer.firstName} ${consumer.lastName}`.trim() || 'System' : 'System',
                    logmessage: `Payment arrangement scheduled (${arrangementName}). First payment on ${firstPaymentDate} for $${amountDollars}.`,
                  });

                  const smaxArrangementSent = await smaxService.insertPaymentArrangement(tenantId, {
                    filenumber: fileNumber,
                    payorname: consumer ? `${consumer.firstName} ${consumer.lastName}`.trim() || 'Consumer' : 'Consumer',
                    arrangementtype: arrangementName,
                    monthlypayment: parseFloat(amountDollars),
                    startdate: firstPaymentDate,
                    enddate: endDate ? endDate.toISOString().split('T')[0] : undefined,
                    nextpaymentdate: nextPaymentDate,
                    remainingpayments: remainingPayments || undefined,
                    totalbalance: (account.balanceCents || 0) / 100,
                    cardtoken: savedPaymentMethod.paymentToken,
                    cardlast4: savedPaymentMethod.cardLast4,
                    cardbrand: savedPaymentMethod.cardBrand || undefined,
                    expirymonth: savedPaymentMethod.expiryMonth || undefined,
                    expiryyear: savedPaymentMethod.expiryYear || undefined,
                    cardholdername: savedPaymentMethod.cardholderName || undefined,
                    billingzip: savedPaymentMethod.billingZip || undefined,
                  });

                  if (smaxArrangementSent && createdSchedule.id) {
                    await storage.updatePaymentSchedule(createdSchedule.id, tenantId, {
                      smaxSynced: true,
                      smaxLastSyncAt: new Date(),
                    });
                    console.log('✅ Authorize.net arrangement synced to SMAX');
                  }
                } catch (smaxError) {
                  console.error('Failed to sync Authorize.net arrangement to SMAX:', smaxError);
                }
              }

              // Move to Payments Pending folder
              try {
                const paymentsPendingFolder = await storage.getPaymentsPendingFolder(tenantId);
                if (paymentsPendingFolder && accountId) {
                  await storage.updateAccount(accountId, {
                    folderId: paymentsPendingFolder.id
                  });
                }
              } catch (folderError) {
                console.error('Failed to move account to folder:', folderError);
              }
            } catch (scheduleError) {
              console.error('Failed to create payment schedule:', scheduleError);
            }
          } else {
            // One-time payment - set to current
            await storage.updateConsumer(consumerId, { paymentStatus: 'current' });
          }
        } else {
          // No arrangement - set to current after successful payment
          await storage.updateConsumer(consumerId, { paymentStatus: 'current' });
        }

        // Sync payment to SMAX if enabled and account has filenumber
        if (settings.smaxEnabled && account.filenumber && consumer) {
          try {
            const { smaxService } = await import('./smaxService');
            
            await smaxService.insertPayment(tenantId, {
              filenumber: account.filenumber,
              paymentamount: (amountCents / 100).toString(),
              paymentdate: new Date().toISOString().split('T')[0],
              paymentmethod: 'Credit Card',
              cardLast4: cardLast4,
              transactionid: paymentResult.transactionId || undefined,
              cardtoken: savedPaymentMethod?.paymentToken || undefined,
              cardholdername: cardName || undefined,
              billingzip: zipCode || undefined,
              cardexpirationmonth: expiryMonth || undefined,
              cardexpirationyear: expiryYear || undefined,
            });

            console.log('✅ Authorize.net payment synced to SMAX');
          } catch (smaxError) {
            console.error('Failed to sync Authorize.net payment to SMAX:', smaxError);
          }
        }

        return res.json({
          success: true,
          message: 'Payment processed successfully',
          payment: {
            id: payment.id,
            amount: amountCents / 100,
            status: 'completed',
            transactionId: paymentResult.transactionId,
          },
          schedule: createdSchedule ? {
            id: createdSchedule.id,
            nextPaymentDate: createdSchedule.nextPaymentDate,
            remainingPayments: createdSchedule.remainingPayments,
          } : undefined,
        });
      } else if (merchantProvider === 'nmi') {
        // ===== NMI PAYMENT PROCESSING =====
        console.log('🟣 Processing payment with NMI (Network Merchants Inc.)');
        
        const hasFuturePaymentDate = normalizedFirstPaymentDate !== null && normalizedFirstPaymentDate.getTime() > today.getTime();
        const needsCardStorage = saveCard || setupRecurring || hasFuturePaymentDate;
        const useSMAXForCards = settings.smaxEnabled && account.filenumber;
        
        // Determine payment flow based on SMAX availability
        if (useSMAXForCards) {
          console.log('💡 Using SMAX for card storage, NMI for direct sale processing');
        } else if (needsCardStorage) {
          console.log('💡 Using NMI Customer Vault for card storage and recurring payments');
        } else {
          console.log('💡 Using NMI direct sale for one-time payment');
        }
        
        const { NMIService } = await import('./nmiService');
        const nmiService = new NMIService({
          securityKey: settings.nmiSecurityKey!.trim(),
        });

        let cardLast4 = cardNumber.slice(-4);
        let cardBrand = null;
        let customerVaultId: string | null = null;
        let savedPaymentMethod: any = null;
        let smaxCardToken: string | null = null;

        // Skip immediate charge ONLY if there's a future payment date
        const shouldSkipImmediateCharge = (normalizedFirstPaymentDate !== null && normalizedFirstPaymentDate.getTime() > today.getTime());
        
        console.log('💰 Payment charge decision:', {
          setupRecurring,
          arrangementType: arrangement?.planType || 'full_balance',
          firstPaymentDate: normalizedFirstPaymentDate?.toISOString().split('T')[0] || 'none',
          today: today.toISOString().split('T')[0],
          shouldSkipImmediateCharge,
          willSaveCard: saveCard || setupRecurring
        });

        // Determine payment processing method
        let success = false;
        let paymentProcessed = false;
        let transactionId: string | null = null;
        let nmiResult: any = null;
        let payment: any = null;

        // Branch 1: Use NMI Customer Vault if card storage needed and SMAX unavailable
        if (needsCardStorage && !useSMAXForCards) {
          console.log('💳 Using NMI Customer Vault for recurring payments...');
          
          // Check if consumer already has a vault ID
          let existingVaultId: string | null = null;
          const savedPaymentMethods = await storage.getPaymentMethods(consumerId);
          const nmiVaultMethod = savedPaymentMethods.find(pm => 
            pm.paymentType === 'credit_card' && pm.paymentToken?.startsWith('nmi_vault_')
          );
          
          if (nmiVaultMethod) {
            existingVaultId = nmiVaultMethod.paymentToken.replace('nmi_vault_', '');
            console.log('📋 Found existing NMI vault ID:', existingVaultId);
          }

          // Add/update customer in vault
          const vaultResult = await nmiService.addCustomerToVault({
            customerVaultId: existingVaultId || undefined,
            ccnumber: cardNumber.replace(/\s/g, ''),
            ccexp: `${expiryMonth}${expiryYear.slice(-2)}`,
            firstName: cardName.split(' ')[0] || cardName,
            lastName: cardName.split(' ').slice(1).join(' ') || '',
            address: '',
            city: '',
            state: '',
            zip: zipCode || '',
          });

          if (!vaultResult.success || !vaultResult.customerVaultId) {
            console.error('❌ Failed to add customer to NMI vault:', vaultResult.message);
            return res.status(400).json({
              success: false,
              message: 'Unable to set up recurring payments. Please try again or contact support.',
            });
          }

          customerVaultId = vaultResult.customerVaultId;
          console.log('✅ Customer added to NMI vault:', customerVaultId);

          // Save payment method for recurring, future-dated, or user-requested
          // CRITICAL: Must save for ALL card storage scenarios (not just when user requests)
          savedPaymentMethod = await storage.createPaymentMethod({
            consumerId,
            tenantId,
            paymentType: 'credit_card',
            paymentToken: `nmi_vault_${customerVaultId}`,
            last4: cardLast4,
            cardBrand: cardBrand || 'unknown',
            expiryMonth,
            expiryYear,
            isDefault: false,
          });
          console.log('💾 Saved NMI vault payment method (ID:', savedPaymentMethod.id, ')');
          
          // Set vault token for downstream use
          smaxCardToken = `nmi_vault_${customerVaultId}`;

          // Charge via vault if not skipping immediate charge
          if (!shouldSkipImmediateCharge) {
            nmiResult = await nmiService.chargeCustomerVault({
              customerVaultId,
              amount: parseFloat((amountCents / 100).toFixed(2)),
              orderid: accountId || `consumer_${consumerId}`,
              firstName: cardName.split(' ')[0] || cardName,
              lastName: cardName.split(' ').slice(1).join(' ') || '',
            });
          }

        } else if (!shouldSkipImmediateCharge) {
          // Branch 2: Direct sale for one-time payments or when using SMAX
          console.log('💳 Charging NMI payment via direct sale...');
          
          nmiResult = await nmiService.processSale({
            amount: parseFloat((amountCents / 100).toFixed(2)),
            ccnumber: cardNumber.replace(/\s/g, ''),
            ccexp: `${expiryMonth}${expiryYear.slice(-2)}`,
            cvv,
            orderid: accountId || `consumer_${consumerId}`,
            firstName: cardName.split(' ')[0] || cardName,
            lastName: cardName.split(' ').slice(1).join(' ') || '',
            address: '',
            city: '',
            state: '',
            zip: zipCode || '',
          });
        }

        // Process result if payment was charged
        if (!shouldSkipImmediateCharge && nmiResult) {

          console.log('📥 NMI transaction response:', {
            success: nmiResult.success,
            transactionId: nmiResult.transactionId,
            responseText: nmiResult.responseText
          });

          // NMI service already checks response === '1' and sets success accordingly
          success = nmiResult.success;
          paymentProcessed = true;
          transactionId = nmiResult.transactionId || `nmi_${Date.now()}`;

          if (!success) {
            console.error('❌ NMI payment failed:', nmiResult.responseText || nmiResult.errorMessage);
            
            // Auto-change account status to "declined" when payment fails
            if (accountId && account.tenantId === tenantId) {
              try {
                const currentStatus = account.status?.toLowerCase();
                // Only change if not already terminal status (recalled/closed)
                if (currentStatus !== 'recalled' && currentStatus !== 'closed') {
                  await storage.updateAccount(accountId, { status: "declined" });
                  console.log(`🔄 Auto-changed account ${accountId} status to "declined" (payment declined)`);
                }
              } catch (statusError) {
                console.error('Failed to auto-update account status on payment decline:', statusError);
              }
            }
            
            return res.status(400).json({
              success: false,
              message: nmiResult.responseText || nmiResult.errorMessage || 'Payment declined',
            });
          }

          // Extract card brand if not already set
          if (!cardBrand && nmiResult.cc_type) {
            cardBrand = nmiResult.cc_type;
          }

          // Use unified payment processing helper
          payment = await processSuccessfulPayment({
            tenantId,
            consumerId,
            accountId,
            account,
            amountCents,
            transactionId,
            processorResponse: nmiResult,
            cardLast4,
            cardName,
            zipCode,
            arrangement,
            settings,
            isSmaxArrangementPayment,
          });

          // Sync payment to SMAX if enabled and account has filenumber
          // (matches Authorize.net pattern - each processor handles its own SMAX sync)
          // Fetch consumer for SMAX sync
          const consumerForSmax = await storage.getConsumer(consumerId);
          console.log('📤 NMI SMAX Sync Check:', {
            smaxEnabled: settings.smaxEnabled,
            hasFilenumber: !!account.filenumber,
            filenumber: account.filenumber,
            hasConsumer: !!consumerForSmax,
            amountCents,
            transactionId
          });
          
          if (settings.smaxEnabled && account.filenumber && consumerForSmax) {
            try {
              const { smaxService } = await import('./smaxService');
              const payorName = `${consumerForSmax.firstName || ''} ${consumerForSmax.lastName || ''}`.trim() || 'Consumer';
              
              console.log('📤 Sending payment to SMAX:', {
                filenumber: account.filenumber,
                payorName,
                amount: (amountCents / 100).toFixed(2),
                transactionId,
                status: 'PROCESSED'
              });
              
              await smaxService.insertPayment(tenantId, {
                filenumber: account.filenumber,
                paymentdate: new Date().toISOString().split('T')[0],
                payorname: payorName,
                paymentmethod: 'CREDIT CARD',
                paymentstatus: 'PROCESSED',
                typeofpayment: 'Online',
                checkaccountnumber: '',
                checkroutingnumber: '',
                checkaccounttype: '',
                checkaddress: '',
                checkcity: '',
                checkstate: '',
                checkzip: '',
                cardtype: cardBrand || '',
                cardnumber: cardLast4 ? `****${cardLast4}` : '',
                threedigitnumber: '',
                cardexpirationmonth: expiryMonth || '',
                cardexpirationyear: expiryYear || '',
                cardexpirationdate: expiryMonth && expiryYear ? `${expiryMonth}/${expiryYear.slice(-2)}` : '',
                paymentamount: (amountCents / 100).toFixed(2),
                acceptedfees: '0.00',
                printed: 'No',
                invoice: transactionId || '',
                cardLast4: cardLast4,
                transactionid: transactionId || undefined,
                cardtoken: customerVaultId ? `nmi_vault_${customerVaultId}` : undefined,
                cardholdername: cardName || undefined,
                billingzip: zipCode || undefined,
              });

              console.log('✅ NMI payment synced to SMAX');
            } catch (smaxError) {
              console.error('Failed to sync NMI payment to SMAX:', smaxError);
            }
          }
        }

        // Save payment method to SMAX (only if not using NMI vault)
        // Note: savedPaymentMethod and smaxCardToken already declared at top of NMI section
        
        // hasFuturePaymentDate already declared above
        const needsPaymentProfile = saveCard || setupRecurring || hasFuturePaymentDate;
        
        // Only use SMAX card storage if we're not using NMI vault AND card storage is needed
        if (needsPaymentProfile && useSMAXForCards) {
          console.log('💾 Saving payment method to SMAX...', {
            reason: saveCard ? 'user requested' : (setupRecurring ? 'recurring arrangement' : 'future-dated payment')
          });
          
          // Store card token in SMAX if enabled and account has filenumber
          if (settings.smaxEnabled && account.filenumber) {
            try {
              const { smaxService } = await import('./smaxService');
              const consumer = await storage.getConsumer(consumerId);
              
              if (consumer) {
                const smaxTokenResult = await smaxService.createCardToken(tenantId, {
                  filenumber: account.filenumber,
                  ccnumber: cardNumber.replace(/\s/g, ''),
                  ccexp: `${expiryMonth}${expiryYear.slice(-2)}`,
                  cardholdername: cardName,
                  billingzip: zipCode || '',
                });
                
                if (smaxTokenResult && smaxTokenResult.cardtoken) {
                  smaxCardToken = smaxTokenResult.cardtoken;
                  console.log('✅ Card token stored in SMAX:', smaxCardToken);
                } else {
                  console.warn('⚠️ SMAX card tokenization failed, will save card info locally for manual processing');
                }
              }
            } catch (smaxError) {
              console.error('Failed to create SMAX card token:', smaxError);
              console.warn('⚠️ Will save card info locally for manual processing');
            }
          }
          
          // Create local payment method record (use SMAX token if available, otherwise store card info for later)
          savedPaymentMethod = await storage.createPaymentMethod({
            tenantId,
            consumerId,
            paymentToken: smaxCardToken || `nmi_card_${cardLast4}_${Date.now()}`, // Placeholder if SMAX token not available
            cardLast4,
            cardBrand: cardBrand || 'unknown',
            expiryMonth: expiryMonth || '',
            expiryYear: expiryYear || '',
            cardholderName: cardName || '',
            billingZip: zipCode || null,
            isDefault: true,
          });
          console.log('💳 Payment method saved:', smaxCardToken ? 'with SMAX token' : 'locally for manual processing');
        }

        // Create payment schedule for recurring arrangements (mirrors Authorize.net pattern)
        let createdSchedule: any = null;
        if (arrangement && savedPaymentMethod) {
          const paymentStartDate = normalizedFirstPaymentDate ? new Date(normalizedFirstPaymentDate) : new Date();
          const nextMonth = new Date(paymentStartDate);
          nextMonth.setMonth(nextMonth.getMonth() + 1);

          let remainingPayments = null;
          let endDate = null;

          if (arrangement.planType === 'settlement') {
            // Check if this is a multi-payment settlement
            const isMultiPaymentSettlement = arrangement.settlementPaymentCount && arrangement.settlementPaymentCount > 1;
            
            if (isMultiPaymentSettlement) {
              // Multi-payment settlement - create a payment schedule
              const settlementPaymentCount = Number(arrangement.settlementPaymentCount);
              const isImmediatePayment = !normalizedFirstPaymentDate || normalizedFirstPaymentDate.getTime() <= today.getTime();
              remainingPayments = isImmediatePayment ? settlementPaymentCount - 1 : settlementPaymentCount;
              endDate = new Date(paymentStartDate);
              
              // Calculate end date - last payment is always (count-1) periods from start
              const frequency = arrangement.settlementPaymentFrequency || 'monthly';
              const periodsUntilLastPayment = settlementPaymentCount - 1;
              
              if (frequency === 'weekly') {
                endDate.setDate(endDate.getDate() + (periodsUntilLastPayment * 7));
              } else if (frequency === 'biweekly') {
                endDate.setDate(endDate.getDate() + (periodsUntilLastPayment * 14));
              } else {
                endDate.setMonth(endDate.getMonth() + periodsUntilLastPayment);
              }
            } else if (normalizedFirstPaymentDate && normalizedFirstPaymentDate.getTime() > today.getTime()) {
              // Single-payment settlement with future date
              remainingPayments = 1;
              endDate = new Date(paymentStartDate);
            }
          } else if (arrangement.planType === 'fixed_monthly' && arrangement.maxTermMonths) {
            const maxPayments = Number(arrangement.maxTermMonths);
            remainingPayments = maxPayments - 1;
            endDate = new Date(paymentStartDate);
            endDate.setMonth(endDate.getMonth() + Number(arrangement.maxTermMonths));
          } else if (arrangement.planType === 'range') {
            // Calculate remaining payments based on balance / payment amount
            const accountBalance = account.balanceCents || 0;
            const isImmediatePayment = !normalizedFirstPaymentDate || normalizedFirstPaymentDate.getTime() <= today.getTime();
            const balanceAfterImmediate = isImmediatePayment ? Math.max(0, accountBalance - amountCents) : accountBalance;
            const paymentsNeeded = balanceAfterImmediate > 0 ? Math.max(1, Math.ceil(balanceAfterImmediate / amountCents)) : 0;
            remainingPayments = paymentsNeeded;
            
            // Calculate end date based on remaining payments (assuming monthly)
            // End date is (remainingPayments - 1) months from start since first payment is at start
            if (remainingPayments > 0) {
              endDate = new Date(paymentStartDate);
              endDate.setMonth(endDate.getMonth() + Math.max(0, remainingPayments - 1));
            }
            console.log('💳 Range payment plan calculated (NMI):', { accountBalance, amountCents, isImmediatePayment, balanceAfterImmediate, paymentsNeeded, remainingPayments, endDate: endDate?.toISOString() });
          }

          const shouldCreateSchedule = arrangementId && (
            arrangement.planType === 'fixed_monthly' || arrangement.planType === 'range' || isMultiPaymentSettlement
          );

          if (shouldCreateSchedule) {
            const existingSchedules = await storage.getActivePaymentSchedulesByConsumerAndAccount(consumerId, accountId, tenantId);

            if (existingSchedules && existingSchedules.length > 0) {
              return res.status(400).json({
                success: false,
                message: "You already have an active payment arrangement for this account.",
              });
            }

            try {
              createdSchedule = await storage.createPaymentSchedule({
                tenantId,
                consumerId,
                accountId,
                paymentMethodId: savedPaymentMethod.id,
                arrangementType: arrangement.planType,
                amountCents,
                frequency: 'monthly',
                startDate: paymentStartDate.toISOString().split('T')[0],
                endDate: endDate ? endDate.toISOString().split('T')[0] : null,
                nextPaymentDate: nextMonth.toISOString().split('T')[0],
                remainingPayments,
                status: 'active',
                source: 'chain',
                smaxSynced: false,
              });

              console.log('✅ Payment schedule created for NMI arrangement');

              // Send arrangement notification
              if (consumer) {
                await notifyTenantAdmins({
                  tenantId,
                  subject: 'New Payment Arrangement Setup',
                  eventType: 'arrangement_setup',
                  consumer: {
                    firstName: consumer.firstName || '',
                    lastName: consumer.lastName || '',
                    email: consumer.email || '',
                  },
                  arrangementType: arrangement.name || arrangement.planType,
                }).catch(err => console.error('Failed to send arrangement notification:', err));

                await emailService.sendArrangementNotification({
                  tenantId,
                  consumerName: `${consumer.firstName} ${consumer.lastName}`,
                  accountNumber: account.accountNumber || 'N/A',
                  arrangementType: arrangement.name || arrangement.planType,
                  monthlyPayment: amountCents,
                  totalBalance: account.balanceCents || 0,
                  startDate: paymentStartDate.toISOString().split('T')[0],
                  endDate: endDate ? endDate.toISOString().split('T')[0] : undefined,
                  remainingPayments: remainingPayments || undefined,
                }).catch(err => console.error('Failed to send arrangement notification:', err));
              }

              // Update consumer status
              await storage.updateConsumer(consumerId, { paymentStatus: 'pending_payment' });

              // SMAX sync if enabled
              if (createdSchedule && settings.smaxEnabled && account.filenumber) {
                try {
                  const { smaxService } = await import('./smaxService');
                  const fileNumber = account.filenumber;
                  const arrangementName = arrangement.name || arrangement.planType;
                  const firstPaymentDate = paymentStartDate.toISOString().split('T')[0];
                  const nextPaymentDate = nextMonth.toISOString().split('T')[0];
                  const amountDollars = (amountCents / 100).toFixed(2);

                  await smaxService.insertAttempt(tenantId, {
                    filenumber: fileNumber,
                    attempttype: 'Promise To Pay',
                    attemptdate: firstPaymentDate,
                    notes: `Arrangement: ${arrangementName} | Amount: $${amountDollars} | Frequency: Monthly`,
                  });

                  await smaxService.insertNote(tenantId, {
                    filenumber: fileNumber,
                    collectorname: consumer ? `${consumer.firstName} ${consumer.lastName}`.trim() || 'System' : 'System',
                    logmessage: `Payment arrangement scheduled (${arrangementName}). First payment on ${firstPaymentDate} for $${amountDollars}.`,
                  });

                  const smaxArrangementSent = await smaxService.insertPaymentArrangement(tenantId, {
                    filenumber: fileNumber,
                    payorname: consumer ? `${consumer.firstName} ${consumer.lastName}`.trim() || 'Consumer' : 'Consumer',
                    arrangementtype: arrangementName,
                    monthlypayment: parseFloat(amountDollars),
                    startdate: firstPaymentDate,
                    enddate: endDate ? endDate.toISOString().split('T')[0] : undefined,
                    nextpaymentdate: nextPaymentDate,
                    remainingpayments: remainingPayments || undefined,
                    totalbalance: (account.balanceCents || 0) / 100,
                    cardtoken: savedPaymentMethod.paymentToken,
                    cardlast4: savedPaymentMethod.cardLast4,
                    cardbrand: savedPaymentMethod.cardBrand || undefined,
                    expirymonth: savedPaymentMethod.expiryMonth || undefined,
                    expiryyear: savedPaymentMethod.expiryYear || undefined,
                    cardholdername: savedPaymentMethod.cardholderName || undefined,
                    billingzip: savedPaymentMethod.billingZip || undefined,
                  });

                  if (smaxArrangementSent && createdSchedule.id) {
                    await storage.updatePaymentSchedule(createdSchedule.id, tenantId, {
                      smaxSynced: true,
                      smaxLastSyncAt: new Date(),
                    });
                    console.log('✅ NMI arrangement synced to SMAX');
                  }
                } catch (smaxError) {
                  console.error('Failed to sync NMI arrangement to SMAX:', smaxError);
                }
              }
            } catch (scheduleError) {
              console.error('Failed to create payment schedule:', scheduleError);
            }
          }
        }

        return res.json({
          success: true,
          message: 'Payment processed successfully',
          payment: payment ? {
            id: payment.id,
            amount: amountCents / 100,
            status: 'completed',
            transactionId: transactionId,
          } : undefined,
          schedule: createdSchedule ? {
            id: createdSchedule.id,
            nextPaymentDate: createdSchedule.nextPaymentDate,
            remainingPayments: createdSchedule.remainingPayments,
          } : undefined,
        });
      }

      // ===== USAEPAY PAYMENT PROCESSING =====
      console.log('🟢 Processing payment with USAePay');
      
      const merchantApiKey = settings.merchantApiKey!.trim();
      const merchantApiPin = settings.merchantApiPin!.trim();

      // Determine API endpoint based on sandbox mode
      const usaepayBaseUrl = useSandbox 
        ? "https://sandbox.usaepay.com/api/v2"
        : "https://secure.usaepay.com/api/v2";

      console.log('🌐 USAePay endpoint:', usaepayBaseUrl);

      // Generate proper USAePay API v2 authentication header with hash
      const authHeader = generateUSAePayAuthHeader(merchantApiKey, merchantApiPin);
      
      // Step 1: Tokenize the card if we need to save it
      let paymentToken = null;
      let cardLast4 = cardNumber.slice(-4);
      let cardBrand = null;

      // Tokenize card if: saving card, setting up recurring, OR has a future payment date
      const needsTokenization = saveCard || setupRecurring || (normalizedFirstPaymentDate !== null && normalizedFirstPaymentDate.getTime() > today.getTime());
      
      if (needsTokenization) {
        // USAePay v2 tokenization uses the transactions endpoint with cc:save command
        const tokenPayload = {
          command: "cc:save",
          creditcard: {
            number: cardNumber.replace(/\s/g, ''),
            expiration: `${expiryMonth}${expiryYear.slice(-2)}`,
            cardholder: cardName,
            cvc: cvv,
            avs_street: "",
            avs_zip: zipCode || ""
          }
        };

        console.log('🔐 Tokenizing card with USAePay (cc:save)...');
        const tokenResponse = await fetch(`${usaepayBaseUrl}/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
          },
          body: JSON.stringify(tokenPayload)
        });

        let tokenResult: any = null;
        const responseText = await tokenResponse.text();
        console.log('📥 USAePay tokenization response:', {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          bodyLength: responseText.length,
          bodyPreview: responseText.substring(0, 200)
        });

        try {
          tokenResult = responseText ? JSON.parse(responseText) : null;
        } catch (err) {
          console.error('❌ Failed to parse USAePay tokenization response:', err);
          console.error('Raw response text:', responseText);
        }

        // USAePay returns the saved card token in savedcard.key (not creditcard.cardref)
        const savedCardKey = tokenResult?.savedcard?.key;
        
        if (!tokenResponse.ok || !savedCardKey) {
          console.error('❌ Failed to tokenize card with USAePay:', {
            status: tokenResponse.status,
            statusText: tokenResponse.statusText,
            body: tokenResult,
            rawResponse: responseText,
            resultCode: tokenResult?.result_code,
            error: tokenResult?.error,
            hasSavedCard: !!tokenResult?.savedcard
          });

          const errorMessage = tokenResult?.error || tokenResult?.result || 'Unable to save your payment method. Please verify your card details or try again.';

          return res.status(400).json({
            success: false,
            message: errorMessage,
            debug: process.env.NODE_ENV === 'development' ? { 
              status: tokenResponse.status, 
              resultCode: tokenResult?.result_code,
              error: tokenResult?.error || 'No response body'
            } : undefined
          });
        }

        // USAePay v2 returns the token in savedcard.key after cc:save
        paymentToken = savedCardKey;
        cardBrand = tokenResult.savedcard?.type || tokenResult.creditcard?.type || null;
        console.log('✅ Card tokenized successfully:', {
          token: paymentToken,
          cardBrand,
          last4: tokenResult.savedcard?.cardnumber?.slice(-4) || cardLast4
        });
      }

      // Skip immediate charge ONLY if there's a future payment date
      // If first payment date is today (or not set), charge immediately even for recurring arrangements
      const isRecurringArrangement = arrangement && (
        arrangement.planType === 'fixed_monthly' || 
        arrangement.planType === 'range'
      );
      
      const shouldSkipImmediateCharge =
        (normalizedFirstPaymentDate !== null && normalizedFirstPaymentDate.getTime() > today.getTime());
      
      console.log('💰 Payment charge decision:', {
        setupRecurring,
        arrangementType: arrangement?.planType || 'full_balance',
        firstPaymentDate: normalizedFirstPaymentDate?.toISOString().split('T')[0] || 'none',
        today: today.toISOString().split('T')[0],
        isRecurringArrangement,
        shouldSkipImmediateCharge,
        willTokenizeCard: saveCard || setupRecurring
      });

      // Step 2: Process payment (use token if available, otherwise use card directly)
      let success = false;
      let paymentProcessed = false;
      let transactionId: string | null = null;
      let usaepayResult: any = null;

      let payment: any = null;

      if (!shouldSkipImmediateCharge) {
        // USAePay API v2 format for sale transaction
        let usaepayPayload: any = {
          command: "sale",
          amount: (amountCents / 100).toFixed(2),
          invoice: accountId || `consumer_${consumerId}`,
          description: arrangement
            ? `${arrangement.name} - Payment for account`
            : `Payment for account`,
          creditcard: {}
        };

        if (paymentToken) {
          // Use cardref token for payment
          // With cardref, the token goes in the number field
          usaepayPayload.creditcard = {
            number: paymentToken,
            cvc: cvv,  // CVV can be included for additional verification
            cardholder: cardName,
            avs_street: "",
            avs_zip: zipCode || ""
          };
        } else {
          // Use card directly
          usaepayPayload.creditcard = {
            number: cardNumber.replace(/\s/g, ''),
            expiration: `${expiryMonth}${expiryYear.slice(-2)}`,
            cvc: cvv,
            cardholder: cardName,
            avs_street: "",
            avs_zip: zipCode || ""
          };
        }

        console.log('💳 Sending payment transaction to USAePay:', {
          endpoint: `${usaepayBaseUrl}/transactions`,
          command: usaepayPayload.command,
          amount: usaepayPayload.amount,
          usingToken: !!paymentToken,
          cardLast4: cardLast4
        });

        const usaepayResponse = await fetch(`${usaepayBaseUrl}/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
          },
          body: JSON.stringify(usaepayPayload)
        });

        usaepayResult = await usaepayResponse.json();

        console.log('📥 USAePay transaction response:', {
          status: usaepayResponse.status,
          ok: usaepayResponse.ok,
          hasError: !!usaepayResult.error,
          errorcode: usaepayResult.errorcode,
          result: usaepayResult.result
        });

        // Log detailed error information for troubleshooting
        if (!usaepayResponse.ok || usaepayResult.error || usaepayResult.errorcode) {
          console.error('❌ USAePay Transaction Error:', {
            status: usaepayResponse.status,
            statusText: usaepayResponse.statusText,
            error: usaepayResult.error,
            errorcode: usaepayResult.errorcode,
            result: usaepayResult.result,
            fullResponse: JSON.stringify(usaepayResult)
          });
        }

        success = usaepayResult.result === 'Approved' || usaepayResult.status === 'Approved';
        paymentProcessed = true;
        transactionId = usaepayResult.refnum || usaepayResult.key || `tx_${Date.now()}`;

        console.log('✅ Payment processing result:', {
          success,
          paymentProcessed,
          transactionId,
          usaepayResult: usaepayResult.result,
          hasFilenumber: !!account.filenumber,
          filenumber: account.filenumber || 'NONE'
        });

        // Extract card brand if not already set
        if (!cardBrand && usaepayResult.cardtype) {
          cardBrand = usaepayResult.cardtype;
        }

        if (!success) {
          // Handle failed payment
          console.error('❌ USAePay payment failed:', usaepayResult.error || usaepayResult.result);
          
          // Create failed payment record
          payment = await storage.createPayment({
            tenantId: tenantId,
            consumerId: consumerId,
            accountId: accountId || null,
            amountCents,
            paymentMethod: 'credit_card',
            status: 'failed',
            transactionId: transactionId,
            processorResponse: JSON.stringify(usaepayResult),
            processedAt: null,
            notes: arrangement
              ? `${arrangement.name} - ${cardName} ending in ${cardLast4}`
              : `Online payment - ${cardName} ending in ${cardLast4}`,
          });
          
          await eventService.emitSystemEvent('payment_failed', {
            tenantId,
            consumerId,
            accountId: accountId || undefined,
            metadata: { paymentId: payment.id, amountCents, error: usaepayResult.error || usaepayResult.errorcode }
          });
          
          // Auto-change account status to "declined" when payment fails
          if (accountId && account.tenantId === tenantId) {
            try {
              const currentStatus = account.status?.toLowerCase();
              // Only change if not already terminal status (recalled/closed)
              if (currentStatus !== 'recalled' && currentStatus !== 'closed') {
                await storage.updateAccount(accountId, { status: "declined" });
                console.log(`🔄 Auto-changed account ${accountId} status to "declined" (payment declined)`);
              }
            } catch (statusError) {
              console.error('Failed to auto-update account status on payment decline:', statusError);
            }
          }
          
          return res.status(400).json({
            success: false,
            message: usaepayResult.error || usaepayResult.result || 'Payment declined',
          });
        }

        // Use unified payment processing helper for successful payments
        // This handles: payment record creation, balance updates, events, and notifications
        payment = await processSuccessfulPayment({
          tenantId,
          consumerId,
          accountId,
          account,
          amountCents,
          transactionId,
          processorResponse: usaepayResult,
          cardLast4,
          cardName,
          zipCode,
          arrangement,
          settings,
        });
        
        // Sync payment to SMAX if enabled and account has filenumber
        // (matches NMI pattern - each processor handles its own SMAX sync)
        if (settings.smaxEnabled && account.filenumber) {
          try {
            const consumerForSmax = await storage.getConsumer(consumerId);
            const payorName = consumerForSmax 
              ? `${consumerForSmax.firstName || ''} ${consumerForSmax.lastName || ''}`.trim() || 'Consumer'
              : 'Consumer';
            
            console.log('📤 Sending USAePay payment to SMAX:', {
              filenumber: account.filenumber,
              payorName,
              amount: (amountCents / 100).toFixed(2),
              transactionId,
              status: 'PROCESSED'
            });
            
            // Use the consumer-supplied paymentDate for SMAX attribution if provided
            const smaxPaymentData = smaxService.createSmaxPaymentData({
              filenumber: account.filenumber,
              paymentamount: amountCents / 100,
              paymentdate: normalizedPaymentDate 
                ? normalizedPaymentDate.toISOString().split('T')[0] 
                : new Date().toISOString().split('T')[0],
              payorname: payorName,
              paymentmethod: 'CREDIT CARD',
              cardtype: cardBrand || 'Unknown',
              cardLast4: cardLast4,
              transactionid: transactionId || undefined,
              cardtoken: paymentToken || undefined,
              cardholdername: cardName || undefined,
              billingzip: zipCode || undefined,
              cardexpirationmonth: expiryMonth || undefined,
              cardexpirationyear: expiryYear || undefined,
            });
            
            console.log('🔍 SMAX Payment Sync - Card Token Details:', {
              hasToken: !!paymentToken,
              token: paymentToken ? `${paymentToken.substring(0, 8)}...` : 'none',
              hasCardholderName: !!cardName,
              cardholderName: cardName || 'missing',
              hasBillingZip: !!zipCode,
              billingZip: zipCode || 'missing',
              hasExpiration: !!(expiryMonth && expiryYear),
              expiration: (expiryMonth && expiryYear) ? `${expiryMonth}/${expiryYear}` : 'missing',
              filenumber: account.filenumber
            });
            
            const smaxSuccess = await smaxService.insertPayment(tenantId, smaxPaymentData);
            if (smaxSuccess) {
              console.log('✅ USAePay payment synced to SMAX successfully');
              await smaxService.sendPaymentNote(tenantId, {
                filenumber: account.filenumber!,
                status: 'processed',
                amount: amountCents / 100,
                transactionId: transactionId || undefined
              });
            } else {
              console.log('⚠️ Failed to sync USAePay payment to SMAX (non-blocking)');
            }
          } catch (smaxError) {
            console.error('Failed to sync USAePay payment to SMAX:', smaxError);
          }
        } else if (!account.filenumber) {
          console.log('ℹ️ No filenumber available - skipping SMAX payment sync');
        }
      } else {
        success = true;
        console.log('⏭️ Skipping immediate charge - will create payment schedule instead');
      }

      // Step 3: Save payment method if requested and payment successful
      // Always save if we have a token (which means we tokenized for future payment, saveCard, or setupRecurring)
      let savedPaymentMethod = null;
      if ((success || shouldSkipImmediateCharge) && paymentToken) {
        savedPaymentMethod = await storage.createPaymentMethod({
          tenantId,
          consumerId,
          paymentToken,
          cardLast4,
          cardBrand: cardBrand || 'unknown',
          cardholderName: cardName,
          expiryMonth: expiryMonth,
          expiryYear: expiryYear,
          billingZip: zipCode || null,
          isDefault: true, // First card is default
        });
      }

      // Step 4: Create payment schedule if requested OR if there's a future payment date
      let createdSchedule: any = null;
      
      console.log('🔍 Schedule creation check:', {
        success,
        shouldSkipImmediateCharge,
        setupRecurring,
        hasArrangement: !!arrangement,
        hasSimplifiedArrangementData: !!simplifiedArrangementData,
        hasSavedPaymentMethod: !!savedPaymentMethod,
        arrangementType: arrangement?.planType,
        condition1: success || shouldSkipImmediateCharge,
        condition2: setupRecurring || shouldSkipImmediateCharge,
        allConditionsMet: (success || shouldSkipImmediateCharge) && (setupRecurring || shouldSkipImmediateCharge) && (arrangement || simplifiedArrangementData) && savedPaymentMethod
      });
      
      if ((success || shouldSkipImmediateCharge) && (setupRecurring || shouldSkipImmediateCharge) && (arrangement || simplifiedArrangementData) && savedPaymentMethod) {
        console.log('⚡ Entered schedule creation block');
        
        // Use firstPaymentDate if provided, otherwise use today
        const paymentStartDate = normalizedFirstPaymentDate ? new Date(normalizedFirstPaymentDate) : new Date();
        console.log('📆 Payment start date:', paymentStartDate.toISOString());
        
        const nextMonth = new Date(paymentStartDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if this is a multi-payment settlement (hoist for later use)
        const isMultiPaymentSettlement = arrangement?.planType === 'settlement' && arrangement.settlementPaymentCount && arrangement.settlementPaymentCount > 1;

        // Determine number of payments based on arrangement or simplified flow
        let remainingPayments = null;
        let endDate = null;
        
        if (simplifiedArrangementData) {
          // Simplified flow calculation
          console.log('✨ Calculating payments for simplified flow');
          const { selectedTerm, paymentFrequency, amountCents: paymentAmountCents } = simplifiedArrangementData;
          const accountBalance = account.balanceCents || 0;
          
          // Validate inputs to prevent invalid schedules
          if (paymentAmountCents <= 0 || accountBalance <= 0) {
            console.error('⚠️ VALIDATION FAILED: Cannot create payment schedule', {
              paymentAmountCents,
              accountBalance,
              tenantId: tenant.id,
              accountId: account.id,
              reason: paymentAmountCents <= 0 ? 'Invalid payment amount' : 'Zero or negative balance'
            });
            // Don't create schedule - exit early by not setting remainingPayments
          } else {
            // Use actual payment amount if payment was processed, otherwise use requested amount
            const actualPaymentAmount = payment?.amountCents || paymentAmountCents;
            
            // Calculate the remaining balance after the immediate payment (if any)
            // If shouldSkipImmediateCharge is false, an immediate payment has already been processed
            const balanceAfterImmediate = shouldSkipImmediateCharge 
              ? accountBalance 
              : Math.max(0, accountBalance - actualPaymentAmount);
            
            // Calculate how many FUTURE payments are needed to pay off the remaining balance
            // Use ceiling to ensure we always cover the full balance
            const paymentsNeeded = balanceAfterImmediate > 0 
              ? Math.max(1, Math.ceil(balanceAfterImmediate / paymentAmountCents))
              : 0;
            
            // Set remainingPayments to paymentsNeeded - this represents future scheduled payments
            // We don't subtract 1 because paymentsNeeded already accounts for the immediate payment
            remainingPayments = Math.max(0, paymentsNeeded);
            
            // Set end date based on actual number of scheduled payments and payment frequency
            if (remainingPayments > 0) {
              endDate = new Date(paymentStartDate);
              
              // Calculate end date based on payment frequency
              if (paymentFrequency === 'weekly') {
                endDate.setDate(endDate.getDate() + (remainingPayments * 7));
              } else if (paymentFrequency === 'biweekly') {
                endDate.setDate(endDate.getDate() + (remainingPayments * 14));
              } else {
                // Monthly or default
                endDate.setMonth(endDate.getMonth() + remainingPayments);
              }
            }
            
            console.log('💳 Simplified flow payment calculation:', {
              originalBalance: accountBalance,
              immediatePayment: shouldSkipImmediateCharge ? 0 : actualPaymentAmount,
              balanceAfterImmediate,
              paymentAmount: paymentAmountCents,
              actualPaymentAmount,
              paymentsNeeded,
              selectedTerm,
              paymentFrequency,
              finalRemainingPayments: remainingPayments,
              totalScheduled: paymentAmountCents * remainingPayments,
              totalAllPayments: (shouldSkipImmediateCharge ? 0 : actualPaymentAmount) + (paymentAmountCents * remainingPayments),
              endDate: endDate?.toISOString(),
              note: 'Final payment will be adjusted to remaining balance by automated processor'
            });
          }
        } else if (arrangement) {
          console.log('🔢 Calculating payments for arrangement type:', arrangement.planType);

          if (arrangement.planType === 'settlement') {
            if (isMultiPaymentSettlement) {
              // Multi-payment settlement - create a payment schedule
              console.log('💰 Multi-payment settlement detected, count:', arrangement.settlementPaymentCount);
              const settlementPaymentCount = Number(arrangement.settlementPaymentCount);
              remainingPayments = shouldSkipImmediateCharge ? settlementPaymentCount : settlementPaymentCount - 1; // Minus the one we just made
              endDate = new Date(paymentStartDate);
              
              // Calculate end date based on frequency
              // Last payment is always (count-1) periods from the start date
              // because the first payment happens at the start date (period 0)
              const frequency = arrangement.settlementPaymentFrequency || 'monthly';
              const periodsUntilLastPayment = settlementPaymentCount - 1;
              
              if (frequency === 'weekly') {
                endDate.setDate(endDate.getDate() + (periodsUntilLastPayment * 7));
              } else if (frequency === 'biweekly') {
                endDate.setDate(endDate.getDate() + (periodsUntilLastPayment * 14));
              } else {
                // Monthly or default
                endDate.setMonth(endDate.getMonth() + periodsUntilLastPayment);
              }
              console.log('✓ Multi-payment settlement calculated:', { remainingPayments, endDate: endDate.toISOString(), frequency, shouldSkipImmediateCharge, periodsUntilLastPayment });
            } else {
              // Single-payment settlement
              // If it's a future payment (shouldSkipImmediateCharge), we need a schedule to track it
              // If it's immediate (not shouldSkipImmediateCharge), we already charged it, no schedule needed
              if (!shouldSkipImmediateCharge) {
                // Already charged immediately, don't create schedule
              } else {
                // Future one-time payment, create schedule with 1 payment
                remainingPayments = 1;
                endDate = new Date(paymentStartDate);
              }
            }
          } else if (arrangement.planType === 'fixed_monthly' && arrangement.maxTermMonths) {
            console.log('💵 Fixed monthly arrangement detected, maxTermMonths:', arrangement.maxTermMonths);
            const maxPayments = Number(arrangement.maxTermMonths);
            remainingPayments = shouldSkipImmediateCharge ? maxPayments : maxPayments - 1; // Minus the one we just made
            endDate = new Date(paymentStartDate);
            endDate.setMonth(endDate.getMonth() + Number(arrangement.maxTermMonths));
            console.log('✓ Calculated:', { remainingPayments, endDate: endDate.toISOString() });
          } else if (arrangement.planType === 'range') {
            // Calculate remaining payments based on balance / payment amount
            const accountBalance = account.balanceCents || 0;
            // Use actual payment amount if payment was processed, otherwise use requested amount
            const actualPaymentAmount = payment?.amountCents || amountCents;
            const balanceAfterImmediate = shouldSkipImmediateCharge 
              ? accountBalance 
              : Math.max(0, accountBalance - actualPaymentAmount);
            const paymentsNeeded = balanceAfterImmediate > 0 ? Math.max(1, Math.ceil(balanceAfterImmediate / amountCents)) : 0;
            remainingPayments = paymentsNeeded;
            
            // Calculate end date based on remaining payments (assuming monthly)
            // End date is (remainingPayments - 1) months from start since first payment is at start
            if (remainingPayments > 0) {
              endDate = new Date(paymentStartDate);
              endDate.setMonth(endDate.getMonth() + Math.max(0, remainingPayments - 1));
            }
            console.log('💳 Range payment plan calculated:', { accountBalance, amountCents, shouldSkipImmediateCharge, balanceAfterImmediate, paymentsNeeded, remainingPayments, endDate: endDate?.toISOString() });
          }
        }

        // Create schedule for:
        // 1. Recurring arrangements (fixed_monthly, range) 
        // 2. Multi-payment settlements (even with immediate first payment)
        // 3. One-time future payments (settlement with future date)
        // Skip for: one_time_payment type, or single-payment settlement that already charged
        const shouldCreateSchedule = arrangementId && (
          (arrangement.planType !== 'one_time_payment' && shouldSkipImmediateCharge) || // Future one-time payments
          (arrangement.planType === 'fixed_monthly' || arrangement.planType === 'range') || // Recurring payments
          isMultiPaymentSettlement // Multi-payment settlements (added to OR expression)
        );
        
        console.log('📅 Should create schedule?', {
          shouldCreateSchedule,
          arrangementId,
          arrangementType: arrangement.planType,
          shouldSkipImmediateCharge,
          isRecurring: arrangement.planType === 'fixed_monthly' || arrangement.planType === 'range'
        });
        
        if (shouldCreateSchedule) {
          console.log('🔨 Creating payment schedule...');
          // Check if consumer already has an active payment schedule for this account
          const existingSchedules = await storage.getActivePaymentSchedulesByConsumerAndAccount(consumerId, accountId, tenantId);

          if (existingSchedules && existingSchedules.length > 0) {
            return res.status(400).json({
              success: false,
              message: "You already have an active payment arrangement for this account. Please cancel your existing arrangement before creating a new one."
            });
          }

          try {
            console.log('🔨 ATTEMPTING TO CREATE PAYMENT SCHEDULE IN DATABASE...');
            console.log('📋 Schedule data:', {
              tenantId,
              consumerId,
              accountId,
              paymentMethodId: savedPaymentMethod.id,
              arrangementType: arrangement.planType,
              amountCents,
              frequency: 'monthly',
              startDate: paymentStartDate.toISOString().split('T')[0],
              endDate: endDate ? endDate.toISOString().split('T')[0] : null,
              nextPaymentDate: shouldSkipImmediateCharge
                ? paymentStartDate.toISOString().split('T')[0]
                : nextMonth.toISOString().split('T')[0],
              remainingPayments,
              status: 'active',
            });

            createdSchedule = await storage.createPaymentSchedule({
              tenantId,
              consumerId,
              accountId,
              paymentMethodId: savedPaymentMethod.id,
              arrangementType: arrangement?.planType || 'simplified_plan',
              amountCents,
              frequency: simplifiedArrangementData?.paymentFrequency || 'monthly',
              startDate: paymentStartDate.toISOString().split('T')[0],
              endDate: endDate ? endDate.toISOString().split('T')[0] : null,
              nextPaymentDate: shouldSkipImmediateCharge
                ? paymentStartDate.toISOString().split('T')[0]
                : nextMonth.toISOString().split('T')[0],
              remainingPayments,
              status: 'active',
              source: 'chain', // Mark as Chain-created
              smaxSynced: false, // Will be set to true after SMAX sync
            });
            
            console.log('✅✅✅ PAYMENT SCHEDULE CREATED SUCCESSFULLY IN DATABASE! ✅✅✅');
            console.log('📦 Created schedule:', {
              scheduleId: createdSchedule.id,
              consumerId: createdSchedule.consumerId,
              accountId: createdSchedule.accountId,
              arrangementType: createdSchedule.arrangementType,
              amountCents: createdSchedule.amountCents,
              startDate: createdSchedule.startDate,
              nextPaymentDate: createdSchedule.nextPaymentDate,
              remainingPayments: createdSchedule.remainingPayments,
              status: createdSchedule.status
            });

            // Verify the schedule was actually saved
            const verifySchedule = await storage.getPaymentSchedulesByConsumer(consumerId, tenantId);
            console.log('🔍 Verification - Total schedules for consumer:', verifySchedule.length);
            
          } catch (scheduleError: any) {
            console.error('❌❌❌ CRITICAL ERROR: Failed to create payment schedule in database! ❌❌❌');
            console.error('Error details:', {
              message: scheduleError.message,
              stack: scheduleError.stack,
              name: scheduleError.name,
              code: scheduleError.code
            });
            throw scheduleError;
          }

          // Send notification to admins about new arrangement
          const consumer = await storage.getConsumer(consumerId);
          if (consumer) {
            await notifyTenantAdmins({
              tenantId,
              subject: 'New Payment Arrangement Setup',
              eventType: 'arrangement_setup',
              consumer: {
                firstName: consumer.firstName || '',
                lastName: consumer.lastName || '',
                email: consumer.email || '',
              },
              arrangementType: arrangement.name || arrangement.planType,
            }).catch(err => console.error('Failed to send arrangement notification:', err));

            // Also send notification to company contact email
            await emailService.sendArrangementNotification({
              tenantId,
              consumerName: `${consumer.firstName} ${consumer.lastName}`,
              accountNumber: account.accountNumber || 'N/A',
              arrangementType: arrangement.name || arrangement.planType,
              monthlyPayment: amountCents,
              totalBalance: account.balanceCents || 0,
              startDate: paymentStartDate.toISOString().split('T')[0],
              endDate: endDate ? endDate.toISOString().split('T')[0] : undefined,
              remainingPayments: remainingPayments || undefined,
            }).catch(err => console.error('Failed to send arrangement notification to contact email:', err));
          }

          // Update consumer status to pending_payment since they now have an active schedule
          await storage.updateConsumer(consumerId, { paymentStatus: 'pending_payment' });

          // Send confirmation email to consumer when no immediate payment is processed
          if (shouldSkipImmediateCharge) {
            try {
              const consumer = await storage.getConsumer(consumerId);
              const tenant = await storage.getTenant(tenantId);

              if (consumer && tenant && consumer.email) {
                const paymentAmountFormatted = `$${(amountCents / 100).toFixed(2)}`;
                const consumerName = `${consumer.firstName} ${consumer.lastName}`.trim();
                const startDateLabel = new Date(paymentStartDate).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                });

                const emailSubject = 'Payment Arrangement Scheduled';
                const emailBody = `
                  <h2>Your Payment Arrangement is Confirmed</h2>
                  <p>Dear ${consumerName || 'Valued Customer'},</p>
                  <p>Thank you for setting up a payment arrangement. Your first payment is scheduled for ${startDateLabel}.</p>
                  <h3>Arrangement Details:</h3>
                  <ul>
                    <li><strong>Payment Amount:</strong> ${paymentAmountFormatted}</li>
                    <li><strong>Frequency:</strong> Monthly</li>
                    <li><strong>Arrangement Type:</strong> ${arrangement.name || arrangement.planType}</li>
                  </ul>
                  <p>Your saved payment method will be charged automatically on the scheduled date. You can manage your arrangement at any time through your consumer portal.</p>
                  <p>If you have any questions, please contact us.</p>
                  <p>Best regards,<br/>${tenant.name}</p>
                `;

                await emailService.sendEmail({
                  to: consumer.email,
                  subject: emailSubject,
                  html: emailBody,
                  from: `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>`,
                  tenantId,
                });
              }
            } catch (emailError) {
              console.error('Error sending arrangement confirmation email:', emailError);
            }
          }

          if (createdSchedule) {
            try {
              const { smaxService } = await import('./smaxService');

              if (accountId) {
                const account = await storage.getAccount(accountId);
                const consumerForSmax =
                  (consumer && {
                    firstName: consumer.firstName,
                    lastName: consumer.lastName,
                  }) ||
                  (await storage.getConsumer(consumerId));

                const fileNumber = (account as any)?.filenumber;

                // Only send to SMAX if filenumber exists
                if (fileNumber) {
                  const arrangementName = arrangement.name || arrangement.planType;
                  const scheduleRecord = createdSchedule as any;
                  const firstPaymentDate =
                    scheduleRecord?.startDate || paymentStartDate.toISOString().split('T')[0];
                  const nextPaymentDate = scheduleRecord?.nextPaymentDate;
                  const endDateIso = scheduleRecord?.endDate;
                  const remainingPayments = scheduleRecord?.remainingPayments;
                  const amountDollars = (amountCents / 100).toFixed(2);

                  const attemptNotesParts = [
                    `Arrangement: ${arrangementName}`,
                    `Amount: $${amountDollars}`,
                    'Frequency: Monthly',
                    `First Payment: ${firstPaymentDate}`,
                    nextPaymentDate && nextPaymentDate !== firstPaymentDate
                      ? `Next Payment: ${nextPaymentDate}`
                      : null,
                    remainingPayments !== null && remainingPayments !== undefined
                      ? `Remaining Payments: ${remainingPayments}`
                      : null,
                  ].filter(Boolean) as string[];

                  const attemptSent = await smaxService.insertAttempt(tenantId, {
                    filenumber: fileNumber,
                    attempttype: 'Promise To Pay',
                    attemptdate: firstPaymentDate,
                    notes: attemptNotesParts.join(' | ') || undefined,
                  });

                  if (!attemptSent) {
                    console.log('ℹ️ SMAX attempt not sent (SMAX may be disabled or misconfigured).');
                  }

                  const noteSegments = [
                    `Payment arrangement scheduled (${arrangementName}).`,
                    `First payment on ${firstPaymentDate} for $${amountDollars}.`,
                    nextPaymentDate && nextPaymentDate !== firstPaymentDate
                      ? `Next payment date: ${nextPaymentDate}.`
                      : null,
                    endDateIso ? `Ends on ${endDateIso}.` : null,
                  ].filter(Boolean);

                  const collectorNameRaw = `${
                    consumerForSmax?.firstName || ''
                  } ${consumerForSmax?.lastName || ''}`.trim();
                  const collectorName = collectorNameRaw || 'System';

                  const noteSent = await smaxService.insertNote(tenantId, {
                    filenumber: fileNumber,
                    collectorname: collectorName || 'System',
                    logmessage:
                      noteSegments.join(' ') ||
                      `Payment arrangement scheduled starting ${firstPaymentDate} for $${amountDollars}.`,
                  });

                  if (!noteSent) {
                    console.log('ℹ️ SMAX note not sent (SMAX may be disabled or misconfigured).');
                  }

                  // Create actual payment arrangement in SMAX with payment method details
                  console.log('💰 Creating payment arrangement in SMAX with payment method...');
                  const arrangementTypeName = arrangement.name || arrangement.planType;
                  const accountBalance = (account as any)?.balanceCents || 0;
                  
                  // Build payor name from consumer data
                  const payorNameRaw = `${
                    consumerForSmax?.firstName || ''
                  } ${consumerForSmax?.lastName || ''}`.trim();
                  const payorName = payorNameRaw || 'Consumer';
                  
                  // Include payment method details so SMAX can process recurring payments
                  const smaxArrangementSent = await smaxService.insertPaymentArrangement(tenantId, {
                    filenumber: fileNumber,
                    payorname: payorName,
                    arrangementtype: arrangementTypeName,
                    monthlypayment: parseFloat(amountDollars),
                    startdate: firstPaymentDate,
                    enddate: endDateIso || undefined,
                    nextpaymentdate: nextPaymentDate || firstPaymentDate,
                    remainingpayments: remainingPayments || undefined,
                    totalbalance: accountBalance / 100,
                    // Payment method details for SMAX to process recurring payments
                    cardtoken: savedPaymentMethod?.paymentToken || undefined,
                    cardlast4: savedPaymentMethod?.cardLast4 || undefined,
                    cardbrand: savedPaymentMethod?.cardBrand || undefined,
                    expirymonth: savedPaymentMethod?.expiryMonth || undefined,
                    expiryyear: savedPaymentMethod?.expiryYear || undefined,
                    cardholdername: savedPaymentMethod?.cardholderName || undefined,
                    billingzip: savedPaymentMethod?.billingZip || undefined
                  });

                  if (smaxArrangementSent) {
                    console.log('✅✅✅ PAYMENT ARRANGEMENT CREATED IN SMAX WITH CARD DETAILS! ✅✅✅');
                    
                    // Mark the schedule as synced to prevent duplication when pulling from SMAX
                    if (createdSchedule?.id) {
                      await storage.updatePaymentSchedule(createdSchedule.id, tenantId, {
                        smaxSynced: true,
                        smaxLastSyncAt: new Date(),
                      });
                      console.log('✅ Payment schedule marked as synced to SMAX');
                    }
                  } else {
                    console.log('⚠️ SMAX payment arrangement not created (SMAX may be disabled, misconfigured, or endpoint not available)');
                  }
                }
              }
            } catch (smaxError) {
              console.error('Failed to sync payment arrangement to SMAX:', smaxError);
            }

            // Move account to "Payments Pending" folder after arrangement is created
            try {
              const paymentsPendingFolder = await storage.getPaymentsPendingFolder(tenantId);
              if (paymentsPendingFolder && accountId) {
                await storage.updateAccount(accountId, {
                  folderId: paymentsPendingFolder.id
                });
                console.log(`📁 Moved account to "Payments Pending" folder (ID: ${paymentsPendingFolder.id})`);
              } else if (!paymentsPendingFolder) {
                console.log('⚠️ "Payments Pending" folder not found - skipping folder move');
              }
            } catch (folderError) {
              console.error('Failed to move account to "Payments Pending" folder:', folderError);
            }
          }
        } else if (arrangement.planType === 'settlement' || arrangement.planType === 'one_time_payment') {
          // For single-payment settlements and one-time payments, set to current after successful payment
          // For multi-payment settlements, status is handled by the schedule creation above
          const isMultiPaymentSettlement = arrangement.planType === 'settlement' && arrangement.settlementPaymentCount && arrangement.settlementPaymentCount > 1;
          if (success && !isMultiPaymentSettlement) {
            await storage.updateConsumer(consumerId, { paymentStatus: 'current' });
          }
        } else if (shouldSkipImmediateCharge && !shouldCreateSchedule) {
          // Warning: skipped charge but no schedule created
          console.log('⚠️ WARNING: Skipped immediate charge but no schedule created!', {
            shouldSkipImmediateCharge,
            shouldCreateSchedule,
            arrangementType: arrangement?.planType,
            hasArrangement: !!arrangement,
            hasSavedPaymentMethod: !!savedPaymentMethod
          });
        }
      }

      // Step 5: Update account balance
      if (accountId && paymentProcessed && success) {
        const account = await storage.getAccount(accountId);
        if (account) {
          // For single-payment settlement, zero out the balance
          const isMultiPaymentSettlement = arrangement?.planType === 'settlement' && arrangement.settlementPaymentCount && arrangement.settlementPaymentCount > 1;
          if (arrangement && arrangement.planType === 'settlement' && !isMultiPaymentSettlement) {
            await storage.updateAccount(accountId, { balanceCents: 0 });
          } else {
            const newBalance = Math.max(0, (account.balanceCents || 0) - amountCents);
            console.log('💰 Balance update (Step 5):', {
              accountId,
              previousBalance: account.balanceCents,
              paymentAmount: amountCents,
              newBalance
            });
            await storage.updateAccount(accountId, { balanceCents: newBalance });
          }
        }
      }

      if (paymentProcessed && !success) {
        // Send payment failure notification to consumer
        try {
          const consumer = await storage.getConsumer(consumerId);
          const tenant = await storage.getTenant(tenantId);
          const account = await storage.getAccount(accountId);
          
          if (consumer && tenant && consumer.email) {
            const paymentAmountFormatted = `$${(amountCents / 100).toFixed(2)}`;
            const consumerName = `${consumer.firstName} ${consumer.lastName}`;
            const errorMessage = usaepayResult.error || usaepayResult.result_code || "Payment was declined";
            
            const emailSubject = 'Payment Processing Failed';
            const emailBody = `
              <h2>Payment Could Not Be Processed</h2>
              <p>Dear ${consumerName},</p>
              <p>We were unable to process your recent payment. Please review the details below and try again.</p>
              <h3>Payment Details:</h3>
              <ul>
                <li><strong>Amount:</strong> ${paymentAmountFormatted}</li>
                <li><strong>Account:</strong> ${account?.creditor || 'Your Account'}</li>
                <li><strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}</li>
                <li><strong>Reason:</strong> ${errorMessage}</li>
              </ul>
              <p>Please check your card details and try again, or contact us if you need assistance.</p>
              <p>Thank you,<br/>${tenant.name}</p>
            `;
            
            await emailService.sendEmail({
              to: consumer.email,
              subject: emailSubject,
              html: emailBody,
              from: `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>`,
              tenantId,
            });
            
            // Also notify agency admin about failed payment
            const tenantSettings = await storage.getTenantSettings(tenantId);
            const adminEmail = (tenantSettings as any)?.contactEmail || (tenant as any)?.contactEmail || tenant?.email;
            
            if (adminEmail) {
              const adminEmailSubject = `Payment Failed - ${consumerName}`;
              const adminEmailBody = `
                <h2>Payment Processing Failed</h2>
                <p>A payment attempt from ${consumerName} has failed.</p>
                <h3>Details:</h3>
                <ul>
                  <li><strong>Consumer:</strong> ${consumerName}</li>
                  <li><strong>Consumer Email:</strong> ${consumer.email}</li>
                  <li><strong>Amount:</strong> ${paymentAmountFormatted}</li>
                  <li><strong>Account:</strong> ${account?.accountNumber || account?.id}</li>
                  <li><strong>Creditor:</strong> ${account?.creditor || 'N/A'}</li>
                  <li><strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}</li>
                  <li><strong>Reason:</strong> ${errorMessage}</li>
                </ul>
                <p>The consumer has been notified about this failed payment attempt.</p>
              `;
              
              await emailService.sendEmail({
                to: adminEmail,
                subject: adminEmailSubject,
                html: adminEmailBody,
                from: `Chain Software <noreply@chainsoftwaregroup.com>`,
                tenantId,
              });
            }
          }
        } catch (emailError) {
          console.error("Error sending payment failure notification:", emailError);
          // Don't fail the response if email fails
        }
        
        // Send note to SMAX about declined payment
        try {
          const account = await storage.getAccount(accountId);
          if (account?.filenumber) {
            await smaxService.sendPaymentNote(tenantId, {
              filenumber: account.filenumber,
              status: 'declined',
              amount: amountCents / 100,
              reason: usaepayResult.error || usaepayResult.result_code || 'Payment declined'
            });
          }
        } catch (smaxError) {
          console.error('Failed to send declined payment note to SMAX:', smaxError);
        }
        
        return res.status(400).json({
          success: false,
          message: usaepayResult.error || usaepayResult.result_code || "Payment declined. Please check your card details and try again."
        });
      }

      if (paymentProcessed && success) {
        // Send thank you email for payment
        try {
          const consumer = await storage.getConsumer(consumerId);
          const tenant = await storage.getTenant(tenantId);
          const account = await storage.getAccount(accountId);

          if (consumer && tenant && consumer.email) {
            const paymentAmountFormatted = `$${(amountCents / 100).toFixed(2)}`;
            const consumerName = `${consumer.firstName} ${consumer.lastName}`;

            let emailSubject = 'Thank You for Your Payment';
            let emailBody = `
              <h2>Payment Received</h2>
              <p>Dear ${consumerName},</p>
              <p>Thank you for your payment. We have successfully received your payment and it has been applied to your account.</p>
              <h3>Payment Details:</h3>
              <ul>
                <li><strong>Amount Paid:</strong> ${paymentAmountFormatted}</li>
                <li><strong>Payment Date:</strong> ${new Date().toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}</li>
                <li><strong>Account:</strong> ${account?.creditor || 'Your Account'}</li>
                <li><strong>Transaction ID:</strong> ${transactionId}</li>
              </ul>`;

            // Check if payment schedule was created (need to recalculate next payment date)
            if (setupRecurring && arrangement && arrangement.planType !== 'settlement' && arrangement.planType !== 'one_time_payment' && savedPaymentMethod) {
              // Calculate next payment date (1 month from first payment or today)
              const paymentStartDate = normalizedFirstPaymentDate ? new Date(normalizedFirstPaymentDate) : new Date();
              const nextPaymentDate = new Date(paymentStartDate);
              nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

              emailSubject = 'Payment Arrangement Confirmed';
              emailBody += `
              <h3>Payment Arrangement:</h3>
              <p>You have successfully set up a recurring payment arrangement for this account.</p>
              <ul>
                <li><strong>Payment Amount:</strong> ${paymentAmountFormatted}</li>
                <li><strong>Frequency:</strong> Monthly</li>
                <li><strong>Next Payment Date:</strong> ${nextPaymentDate.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}</li>
              </ul>
              <p>Your payment method will be automatically charged on the scheduled dates. You can manage your payment arrangements anytime through your consumer portal.</p>`;
            }

            emailBody += `
              <p>If you have any questions about this payment, please don't hesitate to contact us.</p>
              <p>Best regards,<br>${tenant.name}</p>`;

            await emailService.sendEmail({
              to: consumer.email,
              subject: emailSubject,
              html: emailBody,
              from: `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>`,
            });
          }
        } catch (emailError) {
          console.error("Error sending payment confirmation email:", emailError);
          // Don't fail the payment if email fails
        }
      }

      const responseData = {
        success: true,
        payment: payment
          ? {
              id: payment.id,
              amount: amountCents,
              status: payment.status,
              transactionId: payment.transactionId,
              processedAt: payment.processedAt,
            }
          : null,
        schedule: createdSchedule
          ? {
              id: createdSchedule.id,
              startDate: createdSchedule.startDate,
              nextPaymentDate: createdSchedule.nextPaymentDate,
              amountCents: createdSchedule.amountCents,
            }
          : null,
        message: shouldSkipImmediateCharge
          ? "Payment arrangement saved. Your first payment will run on the scheduled date."
          : "Payment processed successfully"
      };
      
      console.log('✅ === PAYMENT PROCESSING COMPLETE ===');
      console.log('📤 Response:', JSON.stringify({
        hasPayment: !!payment,
        hasSchedule: !!createdSchedule,
        message: responseData.message
      }, null, 2));
      
      res.json(responseData);

    } catch (error) {
      console.error("Error processing consumer payment:", error);
      res.status(500).json({ 
        success: false,
        message: "Payment processing failed. Please try again or contact your agency." 
      });
    }
  });

  // Consumer payment methods management
  app.get('/api/consumer/payment-methods', authenticateConsumer, async (req: any, res) => {
    try {
      const { id: consumerId, tenantId } = req.consumer || {};

      if (!consumerId || !tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const paymentMethods = await storage.getPaymentMethodsByConsumer(consumerId, tenantId);
      res.json(paymentMethods);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  app.delete('/api/consumer/payment-methods/:id', authenticateConsumer, async (req: any, res) => {
    try {
      const { id: consumerId, tenantId } = req.consumer || {};
      const { id: paymentMethodId } = req.params;

      if (!consumerId || !tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const deleted = await storage.deletePaymentMethod(paymentMethodId, consumerId, tenantId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Payment method not found" });
      }

      res.json({ message: "Payment method deleted successfully" });
    } catch (error) {
      console.error("Error deleting payment method:", error);
      res.status(500).json({ message: "Failed to delete payment method" });
    }
  });

  app.put('/api/consumer/payment-methods/:id/default', authenticateConsumer, async (req: any, res) => {
    try {
      const { id: consumerId, tenantId } = req.consumer || {};
      const { id: paymentMethodId } = req.params;

      if (!consumerId || !tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const updatedMethod = await storage.setDefaultPaymentMethod(paymentMethodId, consumerId, tenantId);
      
      if (!updatedMethod) {
        return res.status(404).json({ message: "Payment method not found" });
      }

      res.json(updatedMethod);
    } catch (error) {
      console.error("Error setting default payment method:", error);
      res.status(500).json({ message: "Failed to set default payment method" });
    }
  });

  // Add new payment method (for token recovery)
  app.post('/api/consumer/payment-methods/add', authenticateConsumer, async (req: any, res) => {
    console.log('💳 === ADD PAYMENT METHOD REQUEST ===');
    try {
      const { id: consumerId, tenantId } = req.consumer || {};

      if (!consumerId || !tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { cardNumber, expiryMonth, expiryYear, cvv, cardName, zipCode } = req.body;

      if (!cardNumber || !expiryMonth || !expiryYear || !cvv || !cardName) {
        return res.status(400).json({ message: "All card details are required" });
      }

      // Get tenant settings for USAePay credentials
      const settings = await storage.getTenantSettings(tenantId);
      if (!settings?.enableOnlinePayments) {
        return res.status(403).json({ message: "Online payments are currently disabled" });
      }

      const merchantApiKey = settings.merchantApiKey?.trim();
      const merchantApiPin = settings.merchantApiPin?.trim();
      const useSandbox = settings.useSandbox;

      if (!merchantApiKey || !merchantApiPin) {
        return res.status(500).json({ message: "Payment processing is not configured" });
      }

      const usaepayBaseUrl = useSandbox 
        ? "https://sandbox.usaepay.com/api/v2"
        : "https://secure.usaepay.com/api/v2";

      const authHeader = generateUSAePayAuthHeader(merchantApiKey, merchantApiPin);

      // Tokenize card with USAePay
      const tokenPayload = {
        command: "cc:save",
        creditcard: {
          number: cardNumber.replace(/\s/g, ''),
          expiration: `${expiryMonth}${expiryYear.slice(-2)}`,
          cardholder: cardName,
          cvc: cvv,
          avs_street: "",
          avs_zip: zipCode || ""
        }
      };

      console.log('🔐 Tokenizing card...');
      const tokenResponse = await fetch(`${usaepayBaseUrl}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(tokenPayload)
      });

      const responseText = await tokenResponse.text();
      let tokenResult: any = null;

      try {
        tokenResult = responseText ? JSON.parse(responseText) : null;
      } catch (err) {
        console.error('❌ Failed to parse USAePay response:', err);
        return res.status(500).json({ message: "Payment processor error" });
      }

      const savedCardKey = tokenResult?.savedcard?.key;
      
      if (!tokenResponse.ok || !savedCardKey) {
        console.error('❌ Tokenization failed:', tokenResult);
        const errorMessage = tokenResult?.error || tokenResult?.result || 'Unable to save your payment method';
        return res.status(400).json({ message: errorMessage });
      }

      const paymentToken = savedCardKey;
      const cardBrand = tokenResult.savedcard?.type || null;
      const cardLast4 = tokenResult.savedcard?.cardnumber?.slice(-4) || cardNumber.slice(-4);

      console.log('✅ Card tokenized:', { token: paymentToken, brand: cardBrand, last4: cardLast4 });

      // Save payment method to database
      const paymentMethod = await storage.createPaymentMethod({
        tenantId,
        consumerId,
        paymentToken,
        cardLast4,
        cardBrand,
        expiryMonth,
        expiryYear,
        cardholderName: cardName,
        isDefault: false,
      });

      console.log('✅ Payment method saved:', paymentMethod.id);
      
      res.json({
        success: true,
        paymentMethod: {
          id: paymentMethod.id,
          cardLast4: paymentMethod.cardLast4,
          cardBrand: paymentMethod.cardBrand,
          expiryMonth: paymentMethod.expiryMonth,
          expiryYear: paymentMethod.expiryYear,
          cardholderName: paymentMethod.cardholderName,
        },
        message: "Payment method added successfully"
      });

    } catch (error) {
      console.error("Error adding payment method:", error);
      res.status(500).json({ message: "Failed to add payment method" });
    }
  });

  // Update payment method for a payment schedule with SMAX sync logic
  app.patch('/api/consumer/payment-schedules/:scheduleId/payment-method', authenticateConsumer, async (req: any, res) => {
    try {
      const { id: consumerId, tenantId } = req.consumer || {};
      const { scheduleId } = req.params;
      const { paymentMethodId } = req.body;

      if (!consumerId || !tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!paymentMethodId) {
        return res.status(400).json({ message: "Payment method ID is required" });
      }

      // Verify the payment schedule belongs to this consumer
      const schedules = await storage.getPaymentSchedulesByConsumer(consumerId, tenantId);
      const schedule = schedules.find(s => s.id === scheduleId);

      if (!schedule) {
        return res.status(404).json({ message: "Payment schedule not found" });
      }

      // Verify the payment method belongs to this consumer
      const paymentMethods = await storage.getPaymentMethodsByConsumer(consumerId, tenantId);
      const paymentMethod = paymentMethods.find(pm => pm.id === paymentMethodId);

      if (!paymentMethod) {
        return res.status(404).json({ message: "Payment method not found" });
      }

      // Get the account details
      const account = await storage.getAccount(schedule.accountId);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Always allow the card change in Chain (consumers can switch cards anytime)
      const updatedSchedule = await storage.updatePaymentSchedule(scheduleId, tenantId, {
        paymentMethodId,
        updatedAt: new Date(),
      });

      // Check if SMAX is enabled and we should sync card data
      const settings = await storage.getTenantSettings(tenantId);
      const smaxEnabled = settings?.smaxEnabled && account.filenumber;

      let canSyncToSmax = false;
      let comparisonResult: any = null;

      if (smaxEnabled) {
        try {
          // Fetch SMAX arrangement to check if we can sync
          const smaxArrangement = await smaxService.getPaymentArrangement(tenantId, account.filenumber!);
          
          if (smaxArrangement && (smaxArrangement.paymentAmount || smaxArrangement.monthlyPayment)) {
            // Compare dates and amounts
            const smaxAmount = parseFloat(smaxArrangement.paymentAmount || smaxArrangement.monthlyPayment) * 100; // Convert to cents
            const smaxNextDate = smaxArrangement.nextPaymentDate;
            
            const amountsMatch = Math.abs(smaxAmount - schedule.amountCents) < 10; // Within 10 cents tolerance
            const datesMatch = smaxNextDate === schedule.nextPaymentDate;

            comparisonResult = {
              smaxAmount,
              chainAmount: schedule.amountCents,
              amountsMatch,
              smaxNextDate,
              chainNextDate: schedule.nextPaymentDate,
              datesMatch,
              smaxArrangement: {
                type: smaxArrangement.arrangementType,
                frequency: smaxArrangement.paymentFrequency,
                remainingPayments: smaxArrangement.remainingPayments
              }
            };

            // Only sync to SMAX if dates and amounts match
            canSyncToSmax = amountsMatch && datesMatch;

            console.log('💳 Card change SMAX comparison:', {
              scheduleId,
              filenumber: account.filenumber,
              amountsMatch,
              datesMatch,
              canSyncToSmax,
              comparisonResult
            });
          }
        } catch (error) {
          console.error('⚠️ Error fetching SMAX arrangement for card change comparison:', error);
          // If we can't fetch SMAX, don't sync but still allow card change
          canSyncToSmax = false;
        }
      }

      // Sync card data to SMAX if schedules are aligned
      if (smaxEnabled && account.filenumber && canSyncToSmax) {
        try {
          const oldMethod = paymentMethods.find(pm => pm.id === schedule.paymentMethodId);
          
          // Update card details in SMAX (partial update with PCI-compliant data only)
          const smaxCardData: any = {
            filenumber: account.filenumber,
          };

          // Map card brand to SMAX card type
          if (paymentMethod.cardBrand) {
            const brandMap: Record<string, string> = {
              'Visa': 'Visa',
              'Mastercard': 'MasterCard',
              'MasterCard': 'MasterCard',
              'American Express': 'American Express',
              'Amex': 'American Express',
              'Discover': 'Discover',
            };
            smaxCardData.cardtype = brandMap[paymentMethod.cardBrand] || paymentMethod.cardBrand;
          }

          // Add expiration data
          if (paymentMethod.expiryMonth && paymentMethod.expiryYear) {
            smaxCardData.cardexpirationmonth = paymentMethod.expiryMonth;
            smaxCardData.cardexpirationyear = paymentMethod.expiryYear.slice(-2); // Use last 2 digits (YY)
            smaxCardData.cardexpirationdate = `${paymentMethod.expiryMonth}/${paymentMethod.expiryYear.slice(-2)}`;
          }

          // Add cardholder name if available
          if (paymentMethod.cardholderName) {
            smaxCardData.payorname = paymentMethod.cardholderName;
          }

          // Update SMAX payment record (PENDING payments only)
          await smaxService.updatePayment(tenantId, smaxCardData);
          console.log('✅ SMAX payment record updated with new card details');

          // Create a note for the card change
          const noteText = `Payment method updated by consumer. New card: ${paymentMethod.cardBrand || 'Card'} ending in ${paymentMethod.cardLast4}. Previous card: ${oldMethod?.cardBrand || 'Card'} ending in ${oldMethod?.cardLast4 || '****'}. Card expiration and type synced to SMAX.`;
          
          await smaxService.insertNote(tenantId, {
            filenumber: account.filenumber,
            collectorname: 'Consumer Portal',
            logmessage: noteText
          });

          console.log('✅ SMAX note created for card change');
        } catch (error) {
          console.error('⚠️ Error syncing card data to SMAX (non-blocking):', error);
        }
      } else if (smaxEnabled && account.filenumber && !canSyncToSmax) {
        // Schedules don't match - just create a note but don't update SMAX payment
        try {
          const oldMethod = paymentMethods.find(pm => pm.id === schedule.paymentMethodId);
          const noteText = `Payment method updated by consumer. New card: ${paymentMethod.cardBrand || 'Card'} ending in ${paymentMethod.cardLast4}. Previous card: ${oldMethod?.cardBrand || 'Card'} ending in ${oldMethod?.cardLast4 || '****'}. NOTE: Chain and SMAX schedules differ - card details not synced to SMAX payment record.`;
          
          await smaxService.insertNote(tenantId, {
            filenumber: account.filenumber,
            collectorname: 'Consumer Portal',
            logmessage: noteText
          });

          console.log('✅ SMAX note created (schedules out of sync - no card sync)');
        } catch (error) {
          console.error('⚠️ Error creating SMAX note (non-blocking):', error);
        }
      }

      console.log('✅ Card change completed:', scheduleId);

      res.json({
        message: "Payment method updated successfully",
        schedule: updatedSchedule,
        syncedToSmax: canSyncToSmax
      });
    } catch (error) {
      console.error("Error updating payment method for schedule:", error);
      res.status(500).json({ message: "Failed to update payment method" });
    }
  });

  // Process scheduled payments (called by cron/scheduler)
  app.post('/api/payments/process-scheduled', async (req: any, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get all active payment schedules due today
      const allTenants = await storage.getAllTenants();
      const processedPayments = [];
      const failedPayments = [];

      for (const tenant of allTenants) {
        const consumers = await storage.getConsumersByTenant(tenant.id);
        
        for (const consumer of consumers) {
          const schedules = await storage.getPaymentSchedulesByConsumer(consumer.id, tenant.id);
          
          for (const schedule of schedules) {
            // Skip SMAX-sourced arrangements (SMAX handles those payments)
            if ((schedule as any).source === 'smax') {
              console.log(`⏭️ Skipping SMAX-managed payment schedule: ${schedule.id}`);
              continue;
            }

            // Check if payment is due today and schedule is active
            if (schedule.status === 'active' && schedule.nextPaymentDate === today) {
              try {
                // Check if payment processing is enabled for this tenant (trial mode restriction)
                if (!tenant.paymentProcessingEnabled) {
                  console.log(`⏭️ Skipping scheduled payment for tenant with disabled payment processing: ${tenant.id} (trial mode)`);
                  failedPayments.push({
                    scheduleId: schedule.id,
                    accountId: schedule.accountId,
                    reason: 'Payment processing disabled for this account (trial mode)'
                  });
                  continue;
                }

                // Get tenant settings (used for blocked status check, SMAX preflight check, and USAePay credentials)
                const settings = await storage.getTenantSettings(tenant.id);
                
                // Check if account status is blocked (configured per tenant)
                // This checks SMAX statusname (if SMAX enabled) or Chain's account status
                const scheduleAccount = await storage.getAccount(schedule.accountId);
                if (scheduleAccount) {
                  const statusValidation = await validatePaymentStatus(scheduleAccount, tenant.id, settings);
                  if (statusValidation.isBlocked) {
                    console.log(`⏭️ Skipping scheduled payment: ${statusValidation.reason}`);
                    failedPayments.push({
                      scheduleId: schedule.id,
                      accountId: schedule.accountId,
                      reason: statusValidation.reason
                    });
                    continue;
                  }
                }

                // CRITICAL: Preflight check - Query SMAX for existing payments on this date
                // This prevents duplicate charges if SMAX already has a payment scheduled
                if (settings?.smaxEnabled && scheduleAccount?.filenumber) {
                  try {
                    console.log(`🔍 Preflight check: Querying SMAX for existing payments on ${today} for filenumber ${scheduleAccount.filenumber}`);
                    const smaxArrangement = await smaxService.getPaymentArrangement(tenant.id, scheduleAccount.filenumber);
                    
                    if (smaxArrangement) {
                      // Normalize dates for comparison (handle ISO timestamps, timezone strings, etc.)
                      const normalizeDate = (dateStr: string | null | undefined): string | null => {
                        if (!dateStr) return null;
                        try {
                          // Parse date and return YYYY-MM-DD format
                          const date = new Date(dateStr);
                          if (isNaN(date.getTime())) return null;
                          return date.toISOString().split('T')[0];
                        } catch {
                          return null;
                        }
                      };

                      // Check if SMAX has a payment scheduled for today
                      // Compare nextPaymentDate field
                      const smaxNextDate = normalizeDate(smaxArrangement.nextPaymentDate);
                      if (smaxNextDate === today) {
                        console.log(`⚠️ SMAX nextPaymentDate matches today - skipping Chain payment to prevent duplicate`);
                        failedPayments.push({
                          scheduleId: schedule.id,
                          accountId: schedule.accountId,
                          reason: 'SMAX payment already scheduled for this date'
                        });
                        continue;
                      }

                      // Also check futurePayments array if present
                      if (Array.isArray(smaxArrangement.futurePayments)) {
                        const hasPaymentToday = smaxArrangement.futurePayments.some((payment: any) => {
                          const paymentDate = normalizeDate(payment.paymentDate || payment.date || payment.scheduledDate);
                          return paymentDate === today;
                        });

                        if (hasPaymentToday) {
                          console.log(`⚠️ SMAX has future payment for today - skipping Chain payment to prevent duplicate`);
                          failedPayments.push({
                            scheduleId: schedule.id,
                            accountId: schedule.accountId,
                            reason: 'SMAX payment already scheduled for this date (future payments array)'
                          });
                          continue;
                        }
                      }
                    }
                  } catch (smaxError) {
                    console.warn('⚠️ SMAX preflight check failed (continuing with Chain payment):', smaxError);
                    // Continue with payment if SMAX check fails (better to process than skip)
                  }
                }
                
                // Get payment method
                const paymentMethods = await storage.getPaymentMethodsByConsumer(consumer.id, tenant.id);
                const paymentMethod = paymentMethods.find(pm => pm.id === schedule.paymentMethodId);
                
                if (!paymentMethod) {
                  console.error(`Payment method not found for schedule ${schedule.id}`);
                  continue;
                }

                // Determine payment provider
                const merchantProvider = settings?.merchantProvider || 'usaepay';
                
                // Determine payment amount - use remaining balance for final payment
                let paymentAmountCents = schedule.amountCents;
                const isFinalPayment = schedule.remainingPayments !== null && schedule.remainingPayments === 1;
                
                if (isFinalPayment) {
                  // Get current account balance for final payment
                  const account = await storage.getAccount(schedule.accountId);
                  if (account && account.balanceCents > 0) {
                    // Use actual remaining balance for final payment
                    paymentAmountCents = account.balanceCents;
                    console.log(`💳 Final payment - using remaining balance: $${(paymentAmountCents / 100).toFixed(2)} instead of scheduled $${(schedule.amountCents / 100).toFixed(2)}`);
                  }
                }

                let success = false;
                let paymentResult: any = null;

                // Route to appropriate payment processor
                if (merchantProvider === 'authorize_net') {
                  // ===== AUTHORIZE.NET SCHEDULED PAYMENT =====
                  console.log('🔵 Processing scheduled payment with Authorize.net');

                  // Verify Authorize.net is configured
                  if (!settings?.authnetApiLoginId || !settings?.authnetTransactionKey) {
                    console.error(`Authorize.net not configured for tenant ${tenant.id}`);
                    failedPayments.push({
                      scheduleId: schedule.id,
                      accountId: schedule.accountId,
                      reason: 'Authorize.net credentials not configured'
                    });
                    continue;
                  }

                  // Initialize Authorize.net service
                  const { AuthnetService } = await import('./authnetService');
                  const authnetService = new AuthnetService({
                    apiLoginId: settings.authnetApiLoginId.trim(),
                    transactionKey: settings.authnetTransactionKey.trim(),
                    useSandbox: settings.useSandbox ?? true,
                  });

                  // Parse payment token (format: customerProfileId|paymentProfileId)
                  const [customerProfileId, paymentProfileId] = paymentMethod.paymentToken.split('|');

                  if (!customerProfileId || !paymentProfileId) {
                    console.error(`Invalid Authorize.net payment token format for schedule ${schedule.id}`);
                    failedPayments.push({
                      scheduleId: schedule.id,
                      accountId: schedule.accountId,
                      reason: 'Invalid payment token format'
                    });
                    continue;
                  }

                  // Charge the saved payment profile
                  const authnetResult = await authnetService.chargeCustomerProfile({
                    customerProfileId,
                    paymentProfileId,
                    amount: paymentAmountCents / 100,
                    invoice: schedule.accountId.substring(0, 20),
                    description: `Scheduled ${schedule.arrangementType} payment`,
                  });

                  paymentResult = authnetResult;
                  success = authnetResult.success;
                  
                  if (!success) {
                    console.error('❌ Authorize.net scheduled payment failed:', authnetResult.errorMessage);
                    
                    // Auto-change account status to "declined" when scheduled payment fails
                    try {
                      const account = await storage.getAccount(schedule.accountId);
                      if (account && account.tenantId === tenant.id) {
                        const currentStatus = account.status?.toLowerCase();
                        // Only change if not already terminal status (recalled/closed)
                        if (currentStatus !== 'recalled' && currentStatus !== 'closed') {
                          await storage.updateAccount(schedule.accountId, { status: "declined" });
                          console.log(`🔄 Auto-changed account ${schedule.accountId} status to "declined" (scheduled payment declined)`);
                        }
                      }
                    } catch (statusError) {
                      console.error('Failed to auto-update account status on scheduled payment decline:', statusError);
                    }
                  }
                } else if (merchantProvider === 'nmi') {
                  // ===== NMI SCHEDULED PAYMENT =====
                  // Support both NMI Customer Vault and SMAX card storage
                  const isNMIVaultToken = paymentMethod.paymentToken.startsWith('nmi_vault_');
                  
                  if (isNMIVaultToken) {
                    // ===== NMI Customer Vault =====
                    console.log('🟣 Processing scheduled payment with NMI Customer Vault');

                    // Verify NMI is configured
                    if (!settings?.nmiSecurityKey) {
                      console.error(`NMI not configured for tenant ${tenant.id}`);
                      failedPayments.push({
                        scheduleId: schedule.id,
                        accountId: schedule.accountId,
                        reason: 'NMI credentials not configured'
                      });
                      continue;
                    }

                    // Extract vault ID from token
                    const vaultId = paymentMethod.paymentToken.replace('nmi_vault_', '').trim();

                    // Validate vault ID exists
                    if (!vaultId) {
                      console.error(`Invalid or missing NMI vault ID for schedule ${schedule.id}`);
                      failedPayments.push({
                        scheduleId: schedule.id,
                        accountId: schedule.accountId,
                        reason: 'Invalid payment method token'
                      });
                      continue;
                    }

                    try {
                      // Initialize NMI service
                      const { NMIService } = await import('./nmiService');
                      const nmiService = new NMIService({
                        securityKey: settings.nmiSecurityKey.trim(),
                      });

                      // Charge via Customer Vault
                      const nmiResult = await nmiService.chargeCustomerVault({
                        customerVaultId: vaultId,
                        amount: parseFloat((paymentAmountCents / 100).toFixed(2)),
                        orderid: schedule.accountId || `schedule_${schedule.id}`,
                      });

                      paymentResult = nmiResult;
                      success = nmiResult.success;
                      
                      if (!success) {
                        console.error('❌ NMI vault scheduled payment failed:', nmiResult.responseText);
                        
                        // Auto-change account status to "declined" when scheduled payment fails
                        try {
                          const account = await storage.getAccount(schedule.accountId);
                          if (account && account.tenantId === tenant.id) {
                            const currentStatus = account.status?.toLowerCase();
                            // Only change if not already terminal status (recalled/closed)
                            if (currentStatus !== 'recalled' && currentStatus !== 'closed') {
                              await storage.updateAccount(schedule.accountId, { status: "declined" });
                              console.log(`🔄 Auto-changed account ${schedule.accountId} status to "declined" (scheduled payment declined)`);
                            }
                          }
                        } catch (statusError) {
                          console.error('Failed to auto-update account status on scheduled payment decline:', statusError);
                        }
                        
                        failedPayments.push({
                          scheduleId: schedule.id,
                          accountId: schedule.accountId,
                          reason: nmiResult.errorMessage || nmiResult.responseText || 'NMI vault payment declined'
                        });
                        continue;
                      } else {
                        console.log('✅ NMI vault scheduled payment succeeded');
                      }
                    } catch (nmiError: any) {
                      console.error('❌ NMI vault scheduled payment exception:', nmiError);
                      paymentResult = { success: false, errorMessage: nmiError.message, responsetext: nmiError.message };
                      success = false;
                      failedPayments.push({
                        scheduleId: schedule.id,
                        accountId: schedule.accountId,
                        reason: nmiError.message || 'NMI vault payment processing failed'
                      });
                      continue;
                    }
                  } else {
                    // ===== NMI via SMAX (legacy flow) =====
                    console.log('🟣 Processing scheduled payment with NMI via SMAX');

                    // NMI uses SMAX for card storage and recurring payments
                    // Verify SMAX is enabled
                    if (!settings?.smaxEnabled || !settings?.smaxApiKey) {
                      console.error(`SMAX not configured for tenant ${tenant.id} (required for SMAX-based NMI payments)`);
                      failedPayments.push({
                        scheduleId: schedule.id,
                        accountId: schedule.accountId,
                        reason: 'SMAX integration required for this payment method'
                      });
                      continue;
                    }

                    // Get account for filenumber
                    const account = await storage.getAccount(schedule.accountId);
                    if (!account || !account.filenumber) {
                      console.error(`Account ${schedule.accountId} missing filenumber (required for SMAX)`);
                      failedPayments.push({
                        scheduleId: schedule.id,
                        accountId: schedule.accountId,
                        reason: 'Account missing SMAX filenumber'
                      });
                      continue;
                    }

                    try {
                      // Process payment via SMAX using stored card token
                      const { smaxService } = await import('./smaxService');
                      const smaxResult = await smaxService.processPaymentWithToken(tenant.id, {
                        filenumber: account.filenumber,
                        cardtoken: paymentMethod.paymentToken.trim(),
                        amount: (paymentAmountCents / 100).toFixed(2),
                      });

                      paymentResult = smaxResult;
                      success = smaxResult.success;
                      
                      if (!success) {
                        console.error('❌ SMAX scheduled payment failed:', smaxResult.errorMessage);
                      }
                    } catch (smaxError: any) {
                      console.error('❌ SMAX scheduled payment exception:', smaxError);
                      paymentResult = { success: false, errorMessage: smaxError.message };
                      success = false;
                      failedPayments.push({
                        scheduleId: schedule.id,
                        accountId: schedule.accountId,
                        reason: smaxError.message || 'SMAX payment processing failed'
                      });
                      continue;
                    }
                  }
                } else {
                  // ===== USAEPAY SCHEDULED PAYMENT =====
                  console.log('🟢 Processing scheduled payment with USAePay');

                  // Verify USAePay is configured
                  if (!settings?.merchantApiKey || !settings?.merchantApiPin) {
                    console.error(`USAePay not configured for tenant ${tenant.id}`);
                    failedPayments.push({
                      scheduleId: schedule.id,
                      accountId: schedule.accountId,
                      reason: 'USAePay credentials not configured'
                    });
                    continue;
                  }

                  const usaepayBaseUrl = settings.useSandbox 
                    ? "https://sandbox.usaepay.com/api/v2"
                    : "https://secure.usaepay.com/api/v2";

                  // Generate proper USAePay API v2 authentication header with hash
                  const authHeader = generateUSAePayAuthHeader(settings.merchantApiKey, settings.merchantApiPin);

                  // Process payment using saved token (USAePay v2 format)
                  const paymentPayload = {
                    amount: (paymentAmountCents / 100).toFixed(2),
                    invoice: schedule.accountId,
                    description: `Scheduled ${schedule.arrangementType} payment`,
                    source: {
                      key: paymentMethod.paymentToken
                    },
                    billingAddress: {
                      firstName: paymentMethod.cardholderName?.split(' ')[0] || '',
                      lastName: paymentMethod.cardholderName?.split(' ').slice(1).join(' ') || '',
                      zip: paymentMethod.billingZip || '',
                      street: '',
                      city: ''
                    }
                  };

                  const paymentResponse = await fetch(`${usaepayBaseUrl}/transactions`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': authHeader
                    },
                    body: JSON.stringify(paymentPayload)
                  });

                  paymentResult = await paymentResponse.json();
                  success = paymentResult.result === 'Approved' || paymentResult.status === 'Approved';
                }

                // Create payment record
                // Support all three processors: NMI (transactionid), USAePay (refnum), Authorize.net (key)
                const extractedTransactionId = paymentResult.transactionid || paymentResult.refnum || paymentResult.key || `tx_${Date.now()}`;
                
                await storage.createPayment({
                  tenantId: tenant.id,
                  consumerId: consumer.id,
                  accountId: schedule.accountId,
                  amountCents: paymentAmountCents,
                  paymentMethod: 'credit_card',
                  status: success ? 'completed' : 'failed',
                  transactionId: extractedTransactionId,
                  processorResponse: JSON.stringify(paymentResult),
                  processedAt: success ? new Date() : null,
                  notes: `Scheduled payment - ${paymentMethod.cardholderName} ending in ${paymentMethod.cardLast4}`,
                });

                if (success) {
                  // Update account balance
                  const account = await storage.getAccount(schedule.accountId);
                  if (account) {
                    const newBalance = Math.max(0, (account.balanceCents || 0) - paymentAmountCents);
                    console.log('💰 Scheduled payment balance update:', {
                      accountId: schedule.accountId,
                      previousBalance: account.balanceCents,
                      paymentAmount: paymentAmountCents,
                      newBalance
                    });
                    await storage.updateAccount(schedule.accountId, { balanceCents: newBalance });

                    // Create approval request for SMAX update
                    // Note: The payment already exists in SMAX as PENDING (from when arrangement was created)
                    // We need admin approval before updating it to COMPLETED
                    if (account.filenumber) {
                      try {
                        // Prepare SMAX payment data for approval
                        const smaxPaymentData = {
                          paymentdate: today,
                          paymentamount: (paymentAmountCents / 100).toString(),
                          payorname: `${consumer.firstName} ${consumer.lastName}`.trim() || 'Consumer',
                          paymentmethod: 'CREDIT CARD',
                          cardtype: paymentMethod.cardBrand || 'Unknown',
                          paymentstatus: 'COMPLETED',
                          transactionid: extractedTransactionId,
                        };

                        // Create payment approval request instead of auto-updating SMAX
                        await storage.createPaymentApproval({
                          tenantId: tenant.id,
                          approvalType: 'payment',
                          scheduleId: schedule.id,
                          accountId: schedule.accountId,
                          consumerId: consumer.id,
                          filenumber: account.filenumber,
                          paymentDate: schedule.nextPaymentDate,
                          amountCents: paymentAmountCents,
                          transactionId: extractedTransactionId,
                          paymentData: smaxPaymentData,
                          status: 'pending',
                        });

                        console.log(`✅ Payment approval request created for filenumber: ${account.filenumber}, date: ${schedule.nextPaymentDate}`);
                        console.log(`⏸️  SMAX update pending approval - admin must review before syncing to SMAX`);
                      } catch (approvalError) {
                        console.error(`❌ Failed to create payment approval request:`, approvalError);
                        
                        // Fallback: If approval creation fails, insert payment directly to SMAX (backwards compatibility)
                        console.warn(`⚠️ Falling back to direct SMAX insert due to approval creation failure`);
                        const smaxPaymentData = smaxService.createSmaxPaymentData({
                          filenumber: account.filenumber,
                          paymentamount: paymentAmountCents / 100,
                          paymentdate: today,
                          payorname: `${consumer.firstName} ${consumer.lastName}`.trim() || 'Consumer',
                          paymentmethod: 'CREDIT CARD',
                          cardtype: paymentMethod.cardBrand || 'Unknown',
                          cardLast4: paymentMethod.cardLast4,
                          transactionid: extractedTransactionId,
                        });
                        const smaxInserted = await smaxService.insertPayment(tenant.id, smaxPaymentData);
                        if (smaxInserted) {
                          console.log(`✅ SMAX payment inserted (fallback) for filenumber: ${account.filenumber}`);
                          // Send note about successful scheduled payment
                          await smaxService.sendPaymentNote(tenant.id, {
                            filenumber: account.filenumber,
                            status: 'processed',
                            amount: paymentAmountCents / 100,
                            transactionId: extractedTransactionId
                          });
                        }
                      }

                      // Insert payment attempt to SMAX
                      try {
                        await smaxService.insertAttempt(tenant.id, {
                          filenumber: account.filenumber,
                          attempttype: 'Payment',
                          attemptdate: today,
                          notes: `Scheduled payment of $${(paymentAmountCents / 100).toFixed(2)} processed successfully`,
                          result: 'Success',
                        });
                      } catch (smaxError) {
                        console.error('❌ Error sending payment attempt to SMAX:', smaxError);
                        // Don't fail the whole payment if SMAX sync fails
                      }
                    } else {
                      console.warn(`⚠️ No filenumber for account ${schedule.accountId} - skipping SMAX sync`);
                    }
                  }

                  // Update schedule for next payment
                  const nextPayment = new Date(schedule.nextPaymentDate);
                  nextPayment.setMonth(nextPayment.getMonth() + 1);
                  
                  const updatedRemainingPayments = schedule.remainingPayments !== null 
                    ? schedule.remainingPayments - 1 
                    : null;
                  
                  const scheduleStatus = updatedRemainingPayments === 0 ? 'completed' : 'active';

                  await storage.updatePaymentSchedule(schedule.id, tenant.id, {
                    nextPaymentDate: nextPayment.toISOString().split('T')[0],
                    remainingPayments: updatedRemainingPayments,
                    lastProcessedAt: new Date(),
                    status: scheduleStatus,
                    failedAttempts: 0,
                  });

                  // Update consumer payment status
                  // Check if consumer has any other active schedules
                  const allConsumerSchedules = await storage.getPaymentSchedulesByConsumer(consumer.id, tenant.id);
                  const hasActiveSchedules = allConsumerSchedules.some(s => 
                    s.id !== schedule.id && s.status === 'active'
                  );
                  
                  // Update status based on schedule state
                  if (hasActiveSchedules || scheduleStatus === 'active') {
                    // Still has active payment schedules
                    await storage.updateConsumer(consumer.id, { paymentStatus: 'pending_payment' });
                  } else if (!hasActiveSchedules) {
                    // No active schedules - check if account is fully paid
                    const account = await storage.getAccount(schedule.accountId);
                    const accountPaidOff = !account || account.balanceCents === 0;
                    
                    if (accountPaidOff) {
                      // Account paid off, consumer is current
                      await storage.updateConsumer(consumer.id, { paymentStatus: 'current' });
                    } else {
                      // Account still has balance but no payment plan
                      await storage.updateConsumer(consumer.id, { paymentStatus: 'no_payment_plan' });
                    }
                  }

                  // Send email notification to company contact
                  try {
                    const account = await storage.getAccount(schedule.accountId);
                    await emailService.sendPaymentNotification({
                      tenantId: tenant.id,
                      consumerName: `${consumer.firstName} ${consumer.lastName}`,
                      accountNumber: account?.accountNumber || 'N/A',
                      amountCents: paymentAmountCents,
                      paymentMethod: `Card ending in ${paymentMethod.cardLast4}`,
                      transactionId: paymentResult.refnum || paymentResult.key || undefined,
                      paymentType: 'scheduled',
                    }).catch(err => console.error('Failed to send scheduled payment notification:', err));

                    // Send receipt email to consumer
                    if (consumer.email) {
                      const paymentAmountFormatted = `$${(paymentAmountCents / 100).toFixed(2)}`;
                      const consumerName = `${consumer.firstName} ${consumer.lastName}`;
                      const nextPaymentFormatted = nextPayment.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      });
                      
                      // Check if there are remaining payments (guard against null)
                      const hasRemainingPayments = updatedRemainingPayments !== null && updatedRemainingPayments > 0;
                      const isFinalPayment = updatedRemainingPayments !== null && updatedRemainingPayments === 0;
                      
                      const emailSubject = 'Payment Received - Thank You';
                      const emailBody = `
                        <h2>Payment Received</h2>
                        <p>Dear ${consumerName},</p>
                        <p>Your scheduled payment has been successfully processed.</p>
                        <h3>Payment Details:</h3>
                        <ul>
                          <li><strong>Amount Paid:</strong> ${paymentAmountFormatted}</li>
                          <li><strong>Account:</strong> ${account?.creditor || 'Your Account'}</li>
                          <li><strong>Payment Date:</strong> ${new Date().toLocaleDateString('en-US', { 
                            month: 'long', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}</li>
                          <li><strong>Transaction ID:</strong> ${paymentResult.refnum || paymentResult.key || 'N/A'}</li>
                          ${hasRemainingPayments ? `<li><strong>Next Payment:</strong> ${nextPaymentFormatted}</li>` : ''}
                          ${hasRemainingPayments ? `<li><strong>Payments Remaining:</strong> ${updatedRemainingPayments}</li>` : ''}
                        </ul>
                        ${isFinalPayment ? '<p><strong>Congratulations!</strong> This was your final scheduled payment.</p>' : ''}
                        <p>Thank you for your payment.</p>
                        <p>Best regards,<br>${tenant.name}</p>
                      `;
                      
                      await emailService.sendEmail({
                        to: consumer.email,
                        subject: emailSubject,
                        html: emailBody,
                        from: `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>`,
                        tenantId: tenant.id,
                      });
                      console.log(`📧 Payment receipt sent to consumer: ${consumer.email}`);
                    }
                  } catch (notificationError) {
                    console.error('Error sending scheduled payment notification:', notificationError);
                  }

                  processedPayments.push({ scheduleId: schedule.id, consumerId: consumer.id });
                } else {
                  // Payment failed - update failed attempts and store failure reason
                  const failedAttempts = (schedule.failedAttempts || 0) + 1;
                  const scheduleStatus = failedAttempts >= 3 ? 'failed' : 'active';
                  const failureReason = paymentResult.error || paymentResult.result_code || 'Payment declined';
                  
                  // Get account details for comprehensive logging
                  const failedAccount = await storage.getAccount(schedule.accountId);
                  const consumerName = `${consumer.firstName} ${consumer.lastName}`.trim();
                  const accountInfo = failedAccount 
                    ? `Account: ${failedAccount.accountNumber || 'N/A'}, Creditor: ${failedAccount.creditor || 'N/A'}` 
                    : 'Account details unavailable';
                  
                  // Log comprehensive payment failure details
                  console.error(`❌ SCHEDULED PAYMENT FAILED:`);
                  console.error(`   Consumer: ${consumerName} (ID: ${consumer.id})`);
                  console.error(`   ${accountInfo}`);
                  console.error(`   Amount: $${(paymentAmountCents / 100).toFixed(2)}`);
                  console.error(`   Payment Method: ${paymentMethod.cardBrand || 'Card'} ending in ${paymentMethod.cardLast4}`);
                  console.error(`   Failure Reason: ${failureReason}`);
                  console.error(`   Failed Attempts: ${failedAttempts}/3`);
                  console.error(`   Status: ${scheduleStatus}`);

                  await storage.updatePaymentSchedule(schedule.id, tenant.id, {
                    failedAttempts,
                    status: scheduleStatus,
                    lastFailureReason: failureReason,
                    lastProcessedAt: new Date(),
                  });

                  // Update consumer status to payment_failed
                  await storage.updateConsumer(consumer.id, { paymentStatus: 'payment_failed' });

                  // Auto-change account status to "declined" when scheduled payment fails
                  if (failedAccount && failedAccount.tenantId === tenant.id) {
                    try {
                      const currentStatus = failedAccount.status?.toLowerCase();
                      // Only change if not already terminal status (recalled/closed)
                      if (currentStatus !== 'recalled' && currentStatus !== 'closed') {
                        await storage.updateAccount(schedule.accountId, { status: "declined" });
                        console.log(`🔄 Auto-changed account ${schedule.accountId} status to "declined" (scheduled payment declined)`);
                      }
                    } catch (statusError) {
                      console.error('Failed to auto-update account status on scheduled payment decline:', statusError);
                    }
                  }

                  // Send note to SMAX about failed scheduled payment
                  if (failedAccount?.filenumber) {
                    try {
                      await smaxService.sendPaymentNote(tenant.id, {
                        filenumber: failedAccount.filenumber,
                        status: 'declined',
                        amount: paymentAmountCents / 100,
                        reason: failureReason
                      });
                      console.log(`📝 SMAX note created for failed payment on account ${failedAccount.filenumber}`);
                    } catch (smaxError) {
                      console.error('Failed to send declined payment note to SMAX:', smaxError);
                    }
                  }

                  // Send decline notification email to consumer
                  if (consumer.email) {
                    try {
                      const paymentAmountFormatted = `$${(paymentAmountCents / 100).toFixed(2)}`;
                      const emailSubject = 'Scheduled Payment Could Not Be Processed';
                      const emailBody = `
                        <h2>Payment Could Not Be Processed</h2>
                        <p>Dear ${consumerName},</p>
                        <p>We were unable to process your scheduled payment. Please review the details below.</p>
                        <h3>Payment Details:</h3>
                        <ul>
                          <li><strong>Amount:</strong> ${paymentAmountFormatted}</li>
                          <li><strong>Account:</strong> ${failedAccount?.creditor || 'Your Account'}</li>
                          <li><strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { 
                            month: 'long', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}</li>
                          <li><strong>Reason:</strong> ${failureReason}</li>
                        </ul>
                        <p>Please log in to your account to update your payment method or contact us if you need assistance.</p>
                        <p>Thank you,<br/>${tenant.name}</p>
                      `;
                      
                      await emailService.sendEmail({
                        to: consumer.email,
                        subject: emailSubject,
                        html: emailBody,
                        from: `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>`,
                        tenantId: tenant.id,
                      });
                      console.log(`📧 Decline notification sent to consumer: ${consumer.email}`);
                    } catch (emailError) {
                      console.error('Failed to send decline notification to consumer:', emailError);
                    }
                  }

                  failedPayments.push({ 
                    scheduleId: schedule.id, 
                    consumerId: consumer.id,
                    consumerName,
                    accountNumber: failedAccount?.accountNumber || 'Unknown',
                    creditor: failedAccount?.creditor || 'Unknown',
                    amount: paymentAmountCents / 100,
                    error: failureReason,
                    attemptCount: failedAttempts
                  });
                }
              } catch (err) {
                console.error(`Error processing schedule ${schedule.id}:`, err);
                failedPayments.push({ 
                  scheduleId: schedule.id, 
                  error: err instanceof Error ? err.message : 'Unknown error'
                });
              }
            }
          }
        }
      }

      // Cleanup: Mark expired payment schedules as completed
      console.log('🧹 Cleaning up expired payment schedules...');
      let cleanedUpCount = 0;
      
      for (const tenant of allTenants) {
        const consumers = await storage.getConsumersByTenant(tenant.id);
        
        for (const consumer of consumers) {
          const schedules = await storage.getPaymentSchedulesByConsumer(consumer.id, tenant.id);
          
          for (const schedule of schedules) {
            // Skip if already completed or cancelled
            if (schedule.status === 'completed' || schedule.status === 'cancelled') {
              continue;
            }
            
            let shouldComplete = false;
            
            // Check if endDate has passed
            if (schedule.endDate) {
              const endDate = new Date(schedule.endDate);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              if (endDate < today) {
                shouldComplete = true;
                console.log(`📅 Schedule ${schedule.id} has passed its end date (${schedule.endDate})`);
              }
            }
            
            // Check if remainingPayments is 0
            if (schedule.remainingPayments !== null && schedule.remainingPayments <= 0) {
              shouldComplete = true;
              console.log(`✅ Schedule ${schedule.id} has no remaining payments`);
            }
            
            if (shouldComplete) {
              await storage.updatePaymentSchedule(schedule.id, tenant.id, {
                status: 'completed'
              });
              cleanedUpCount++;
              console.log(`🧹 Marked schedule ${schedule.id} as completed`);
            }
          }
        }
      }
      
      console.log(`✨ Cleanup complete: Marked ${cleanedUpCount} schedules as completed`);

      res.json({
        success: true,
        processed: processedPayments.length,
        failed: failedPayments.length,
        cleanedUp: cleanedUpCount,
        details: { processedPayments, failedPayments }
      });

    } catch (error) {
      console.error("Error processing scheduled payments:", error);
      res.status(500).json({ message: "Failed to process scheduled payments" });
    }
  });

  // Process due automations (called by cron/scheduler)
  app.post('/api/automations/process', async (req: any, res) => {
    try {
      const now = new Date();
      console.log(`🤖 Processing automations at ${now.toISOString()}`);
      
      const processedAutomations = [];
      const failedAutomations = [];
      
      // Get all active automations
      const automations = await storage.getActiveAutomations();
      console.log(`📋 Found ${automations.length} active automations to check`);
      
      // Log details for each automation
      automations.forEach((auto: any) => {
        console.log(`  - ${auto.name}: isActive=${auto.isActive}, triggerType=${auto.triggerType}, nextExecution=${auto.nextExecution ? new Date(auto.nextExecution).toISOString() : 'null'}`);
      });
      
      for (const automation of automations) {
        try {
          // Parse metadata safely
          const metadata = (automation as any).metadata && typeof (automation as any).metadata === 'object'
            ? (automation as any).metadata as any
            : {};

          const triggerType = metadata.triggerType
            || (automation as any).triggerType
            || (automation as any).trigger
            || 'schedule';
          // Read nextExecution from the database column (not metadata)
          const nextExecution = (automation as any).nextExecution ? new Date((automation as any).nextExecution) : null;

          console.log(`🔍 Checking automation "${automation.name}":`, {
            triggerType,
            nextExecution: nextExecution ? nextExecution.toISOString() : 'null',
            now: now.toISOString(),
            isDue: nextExecution ? (nextExecution <= now) : false
          });

          // Skip if not scheduled or not due yet
          if (triggerType !== 'schedule') {
            console.log(`  ⏭️  Skipping (not scheduled, triggerType=${triggerType})`);
            continue; // Event-based and manual automations handled separately
          }
          
          if (!nextExecution || nextExecution > now) {
            console.log(`  ⏭️  Skipping (not due yet or no nextExecution)`);
            continue; // Not due yet
          }
          
          console.log(`⚡ Processing automation: ${automation.name} (${automation.type})`);
          
          // Get target consumers
          const targetType = metadata.targetType
            || (automation as any).targetType
            || (automation as any).targetGroup
            || 'all';
          const targetFolderIds = Array.isArray(metadata.targetFolderIds) && metadata.targetFolderIds.length > 0
            ? metadata.targetFolderIds
            : Array.isArray((automation as any).targetFolderIds)
              ? (automation as any).targetFolderIds.filter(
                  (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0,
                )
              : [];
          const targetCustomerIds = Array.isArray(metadata.targetCustomerIds) && metadata.targetCustomerIds.length > 0
            ? metadata.targetCustomerIds
            : Array.isArray((automation as any).targetCustomerIds)
              ? (automation as any).targetCustomerIds.filter(
                  (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0,
                )
              : [];
          let targetConsumers: any[] = [];

          if (targetType === 'all') {
            // Get all consumers for the tenant
            targetConsumers = await storage.getConsumersByTenant(automation.tenantId);
          } else if (targetType === 'folder' && targetFolderIds.length > 0) {
            const accountsData = await storage.getAccountsByTenant(automation.tenantId);
            const folderSet = new Set(targetFolderIds);

            const consumersList = await storage.getConsumersByTenant(automation.tenantId);
            const consumerIds = new Set(
              accountsData
                .filter(acc => (acc.folderId && folderSet.has(acc.folderId)) || (acc.consumer?.folderId && folderSet.has(acc.consumer.folderId)))
                .map(acc => acc.consumerId),
            );

            targetConsumers = consumersList.filter(
              consumer => consumerIds.has(consumer.id) || (consumer.folderId && folderSet.has(consumer.folderId)),
            );
          } else if (targetType === 'custom' && targetCustomerIds.length > 0) {
            const allConsumers = await storage.getConsumersByTenant(automation.tenantId);
            const targetIds = new Set(targetCustomerIds);
            targetConsumers = allConsumers.filter(c => targetIds.has(c.id));
          }
          
          console.log(`👥 Found ${targetConsumers.length} target consumers (before filtering)`);
          
          // Exclude consumers with accounts in "Payments Pending" folder
          const paymentsPendingFolder = await storage.getPaymentsPendingFolder(automation.tenantId);
          if (paymentsPendingFolder) {
            const accountsInPaymentsPending = await storage.getAccountsByFolder(paymentsPendingFolder.id);
            const consumerIdsToExclude = new Set(accountsInPaymentsPending.map(acc => acc.consumerId));
            
            const originalCount = targetConsumers.length;
            targetConsumers = targetConsumers.filter(c => !consumerIdsToExclude.has(c.id));
            const excludedCount = originalCount - targetConsumers.length;
            
            if (excludedCount > 0) {
              console.log(`🚫 Excluded ${excludedCount} consumers with pending payment arrangements`);
            }
          }
          
          console.log(`👥 Final target consumers: ${targetConsumers.length}`);
          
          if (targetConsumers.length === 0) {
            console.log(`⚠️ No targets for automation ${automation.name} after filtering`);
            continue;
          }
          
          // Get templates
          const templateIds = Array.isArray(metadata.templateIds) && metadata.templateIds.length > 0
            ? metadata.templateIds
            : Array.isArray((automation as any).templateIds) && (automation as any).templateIds.length > 0
              ? (automation as any).templateIds
              : (automation as any).templateId
                ? [(automation as any).templateId]
                : [];
          let sentCount = 0;
          let failedCount = 0;
          
          // Get all accounts for consumers (for variable replacement)
          const allAccounts = await storage.getAccountsByTenant(automation.tenantId);
          
          // Send to each consumer
          for (const consumer of targetConsumers) {
            // Get consumer's primary account for variable replacement
            const consumerAccount = allAccounts.find(acc => acc.consumerId === consumer.id);
            
            for (const templateId of templateIds) {
              try {
                if (automation.type === 'email') {
                  // Get email template
                  const templates = await storage.getEmailTemplatesByTenant(automation.tenantId);
                  const template = templates.find(t => t.id === templateId);
                  if (!template) {
                    console.error(`Template ${templateId} not found`);
                    failedCount++;
                    continue;
                  }
                  
                  // Get tenant for branding
                  const tenant = await storage.getTenant(automation.tenantId);
                  if (!tenant) {
                    failedCount++;
                    continue;
                  }
                  
                  // Get tenant settings for additional context
                  const tenantSettings = await storage.getTenantSettings(automation.tenantId);
                  const tenantWithSettings = {
                    ...tenant,
                    contactEmail: tenantSettings?.contactEmail,
                    contactPhone: tenantSettings?.contactPhone,
                  };
                  
                  // Use the full replaceTemplateVariables function to support ALL fields including CSV additionalData
                  const subject = replaceTemplateVariables(
                    template.subject || '',
                    consumer,
                    consumerAccount,
                    tenantWithSettings
                  );
                  const html = replaceTemplateVariables(
                    template.html || '',
                    consumer,
                    consumerAccount,
                    tenantWithSettings
                  );
                  
                  // Send email via broadcast stream (marketing emails)
                  const { emailService } = await import('./emailService');
                  await emailService.sendEmail({
                    to: consumer.email || '',
                    subject,
                    html,
                    tenantId: automation.tenantId,
                    tag: 'automation',
                    useBroadcastStream: true, // Use broadcast stream for automation emails
                    metadata: {
                      automationId: automation.id,
                      automationName: automation.name,
                      consumerId: consumer.id,
                    },
                  });
                  
                  sentCount++;
                  console.log(`✉️ Sent email to ${consumer.email}`);
                  
                } else if (automation.type === 'sms') {
                  // SMS automations now create real campaigns for visibility and tracking
                  // This is handled at the automation level, not per-consumer
                  // Skip the inner loop - SMS handled by campaign creation below
                }
              } catch (sendError) {
                console.error(`Error sending to consumer ${consumer.id}:`, sendError);
                failedCount++;
              }
            }
          }
          
          // For SMS automations, create a real campaign instead of sending directly
          if (automation.type === 'sms' && templateIds.length > 0) {
            const templateId = templateIds[0]; // Use first template
            const templates = await storage.getSmsTemplatesByTenant(automation.tenantId);
            const template = templates.find(t => t.id === templateId);
            
            if (template && targetConsumers.length > 0) {
              const phonesToSendSetting = (automation as any).phonesToSend || '1';
              
              // Create campaign record with source='automation'
              const campaignName = `[Auto] ${automation.name} - ${now.toLocaleDateString()}`;
              console.log(`📱 Creating SMS campaign for automation "${automation.name}" with ${targetConsumers.length} recipients`);
              
              const campaign = await storage.createSmsCampaign({
                tenantId: automation.tenantId,
                templateId: templateId,
                name: campaignName,
                targetGroup: 'custom', // Custom targeting since we already resolved audience
                phonesToSend: phonesToSendSetting as any,
                status: 'sending',
                totalRecipients: targetConsumers.length,
                totalSent: 0,
                totalErrors: 0,
                source: 'automation',
                automationId: automation.id,
              } as any);
              
              console.log(`✅ Created campaign ${campaign.id} for automation "${automation.name}"`);
              
              // Get tenant context for variable replacement
              const tenant = await storage.getTenant(automation.tenantId);
              const tenantSettings = await storage.getTenantSettings(automation.tenantId);
              const tenantWithSettings = {
                ...tenant,
                contactEmail: tenantSettings?.contactEmail,
                contactPhone: tenantSettings?.contactPhone,
              };
              
              // Send SMS using campaign tracking
              const { smsService } = await import('./smsService');
              let campaignSentCount = 0;
              let campaignFailedCount = 0;
              
              for (const consumer of targetConsumers) {
                const consumerAccount = allAccounts.find(acc => acc.consumerId === consumer.id);
                
                // Replace template variables
                const message = replaceTemplateVariables(
                  template.message || '',
                  consumer,
                  consumerAccount,
                  tenantWithSettings
                );
                
                // Extract phone numbers
                const phones: string[] = [];
                const primaryPhone = consumer.phone || consumer.phoneNumber;
                if (primaryPhone) phones.push(primaryPhone);
                
                if (consumer.additionalData) {
                  const additionalData = consumer.additionalData as Record<string, any>;
                  const phoneKeys = Object.keys(additionalData)
                    .filter(key => key.toLowerCase().includes('phone'))
                    .sort((a, b) => {
                      const numA = parseInt(a.replace(/\D/g, '')) || 0;
                      const numB = parseInt(b.replace(/\D/g, '')) || 0;
                      return numA - numB;
                    });
                  
                  for (const key of phoneKeys) {
                    const value = additionalData[key];
                    if (value && typeof value === 'string') {
                      const trimmed = value.trim();
                      if (trimmed) {
                        const normalized = trimmed.replace(/\D/g, '');
                        if (normalized.length >= 10) phones.push(trimmed);
                      }
                    }
                  }
                }
                
                // Deduplicate and apply limit
                const uniquePhones = new Map<string, string>();
                for (const phone of phones) {
                  const normalized = phone.replace(/\D/g, '');
                  if (!uniquePhones.has(normalized)) {
                    uniquePhones.set(normalized, phone);
                  }
                }
                let targetPhones = Array.from(uniquePhones.values());
                if (phonesToSendSetting !== 'all') {
                  const limit = parseInt(phonesToSendSetting);
                  targetPhones = targetPhones.slice(0, limit);
                }
                
                // Send to each phone
                for (const phone of targetPhones) {
                  try {
                    await smsService.sendSms(
                      phone,
                      message,
                      automation.tenantId,
                      campaign.id, // Link to campaign for tracking
                      consumer.id,
                      { 
                        automationId: automation.id,
                        automationName: automation.name,
                        source: 'automation'
                      }
                    );
                    campaignSentCount++;
                    sentCount++;
                    
                    // Update campaign progress periodically
                    if (campaignSentCount % 10 === 0) {
                      await storage.updateSmsCampaign(campaign.id, {
                        totalSent: campaignSentCount,
                        totalErrors: campaignFailedCount,
                      });
                    }
                    
                    // Pace delivery
                    await new Promise(resolve => setTimeout(resolve, 100));
                  } catch (smsError) {
                    console.error(`Failed to send SMS to ${phone}:`, smsError);
                    campaignFailedCount++;
                    failedCount++;
                  }
                }
              }
              
              // Finalize campaign
              await storage.updateSmsCampaign(campaign.id, {
                status: 'completed',
                totalSent: campaignSentCount,
                totalErrors: campaignFailedCount,
                completedAt: new Date(),
              });
              
              console.log(`✅ Automation campaign completed: ${campaignSentCount} sent, ${campaignFailedCount} failed`);
            }
          }
          
          // Log execution
          await storage.createAutomationExecution({
            automationId: automation.id,
            status: failedCount > 0 ? 'partial' : 'success',
            totalSent: sentCount,
            totalFailed: failedCount,
            errorMessage: failedCount > 0 ? `${failedCount} sends failed` : null,
            executionDetails: { sentCount, failedCount, timestamp: now.toISOString() },
          });
          
          // Update automation for next run
          const scheduleType = metadata.scheduleType
            || (automation as any).scheduleType
            || 'once';

          if (scheduleType === 'once') {
            // Mark as inactive after one-time execution
            await storage.updateAutomation(automation.id, {
              isActive: false,
              lastExecuted: now,
              nextExecution: null,
              metadata: {
                ...metadata,
                lastExecution: now.toISOString(),
              } as any
            } as any);
            console.log(`✅ One-time automation ${automation.name} completed and deactivated`);
          } else {
            // Calculate next execution for recurring
            const scheduledDateSource = metadata.scheduledDate
              || (automation as any).scheduledDate
              || (automation as any).scheduledTime
              || null;
            const scheduledDateValue = scheduledDateSource ? new Date(scheduledDateSource) : null;

            const scheduleTimeValue = metadata.scheduleTime
              || (automation as any).scheduleTime
              || (automation as any).scheduledTimeOfDay
              || null;

            const scheduleWeekdaysValue = Array.isArray(metadata.scheduleWeekdays) && metadata.scheduleWeekdays.length > 0
              ? metadata.scheduleWeekdays
              : Array.isArray((automation as any).scheduleWeekdays)
                ? (automation as any).scheduleWeekdays
                : [];

            const scheduleDayOfMonthValue = metadata.scheduleDayOfMonth
              || (automation as any).scheduleDayOfMonth
              || null;

            const templateScheduleValue = Array.isArray(metadata.templateSchedule) && metadata.templateSchedule.length > 0
              ? metadata.templateSchedule
              : (automation as any).templateSchedule;

            const newNextExecution = calculateNextExecution({
              ...automation,
              scheduleType,
              scheduledDate: scheduledDateValue,
              scheduleTime: scheduleTimeValue,
              scheduleWeekdays: scheduleWeekdaysValue,
              scheduleDayOfMonth: scheduleDayOfMonthValue,
              templateSchedule: templateScheduleValue,
            });

            // Update both database column and metadata for backward compatibility
            await storage.updateAutomation(automation.id, {
              lastExecuted: now,
              nextExecution: newNextExecution,
              metadata: {
                ...metadata,
                scheduleType,
                scheduledDate: scheduledDateValue
                  ? scheduledDateValue.toISOString()
                  : scheduledDateSource,
                scheduleTime: scheduleTimeValue,
                scheduleWeekdays: scheduleWeekdaysValue,
                scheduleDayOfMonth: scheduleDayOfMonthValue,
                templateIds,
                targetFolderIds,
                targetCustomerIds,
                templateSchedule: templateScheduleValue,
                nextExecution: newNextExecution ? newNextExecution.toISOString() : null,
                lastExecution: now.toISOString(),
              } as any
            } as any);

            console.log(`🔄 Recurring automation ${automation.name} next run: ${newNextExecution?.toISOString()}`);
          }
          
          processedAutomations.push({
            id: automation.id,
            name: automation.name,
            sent: sentCount,
            failed: failedCount,
          });
          
        } catch (error) {
          console.error(`Error processing automation ${automation.id}:`, error);
          failedAutomations.push({
            id: automation.id,
            name: automation.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      
      console.log(`✅ Processed ${processedAutomations.length} automations, ${failedAutomations.length} failed`);

      // Check for overdue payments and trigger payment_overdue events
      try {
        console.log('🔍 Checking for overdue payments...');
        const tenants = await storage.getAllTenants();
        let overdueChecked = 0;
        let overdueTriggered = 0;

        for (const tenant of tenants) {
          if (!tenant.isActive) continue;

          const accounts = await storage.getAccountsByTenant(tenant.id);
          
          for (const account of accounts) {
            // Skip if account has no due date or no consumer
            if (!account.dueDate || !account.consumerId) continue;

            const dueDate = new Date(account.dueDate);
            const now = new Date();

            // Check if payment is overdue (due date is in the past)
            if (dueDate < now && account.balanceCents > 0) {
              overdueChecked++;

              // Check if we've already triggered this overdue event recently
              // Get all active enrollments for this consumer to avoid re-triggering
              const sequences = await storage.getCommunicationSequencesByTenant(tenant.id);
              const overdueSequences = sequences.filter(
                seq => seq.isActive && seq.triggerType === 'event' && seq.triggerEvent === 'payment_overdue'
              );

              let shouldTrigger = true;
              
              // For each overdue sequence, check if consumer is already enrolled or was recently enrolled
              for (const sequence of overdueSequences) {
                const enrollments = await storage.getSequenceEnrollments(sequence.id);
                const recentEnrollment = enrollments.find(enrollment => 
                  enrollment.consumerId === account.consumerId &&
                  (enrollment.status === 'active' || 
                   (enrollment.status === 'completed' && 
                    new Date(enrollment.completedAt || 0) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))) // Within last 7 days
                );

                if (recentEnrollment) {
                  shouldTrigger = false;
                  break;
                }
              }

              if (shouldTrigger) {
                // Trigger payment_overdue event
                await eventService.emitSystemEvent('payment_overdue', {
                  tenantId: tenant.id,
                  consumerId: account.consumerId,
                  accountId: account.id,
                  metadata: { 
                    dueDate: dueDate.toISOString(),
                    balanceCents: account.balanceCents,
                    creditor: account.creditor
                  }
                });
                overdueTriggered++;
              }
            }
          }
        }

        if (overdueTriggered > 0) {
          console.log(`⚠️ Triggered ${overdueTriggered} payment_overdue events (checked ${overdueChecked} overdue accounts)`);
        }
      } catch (error) {
        console.error('Error checking for overdue payments:', error);
        // Don't fail the entire processor if overdue check fails
      }
      
      res.json({
        success: true,
        processed: processedAutomations.length,
        failed: failedAutomations.length,
        details: { processedAutomations, failedAutomations }
      });
      
    } catch (error) {
      console.error("Error processing automations:", error);
      res.status(500).json({ message: "Failed to process automations" });
    }
  });

  // Scheduled payments calendar endpoint
  app.get('/api/scheduled-payments/calendar', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { startDate, endDate } = req.query;
      
      console.log('📅 Calendar request - date range:', { 
        hasStartDate: !!startDate, 
        hasEndDate: !!endDate 
      });
      
      // Get all consumers for this tenant
      const consumers = await storage.getConsumersByTenant(tenantId);
      console.log(`👥 Found ${consumers.length} consumers`);
      
      const dailySchedules: Record<string, any[]> = {};
      const dailyTotals: Record<string, number> = {};
      let totalSchedulesFound = 0;
      let activeSchedulesFound = 0;
      let filteredOutByDateRange = 0;

      // Import date-fns for proper month handling
      const { addMonths, format: formatDate } = await import('date-fns');

      for (const consumer of consumers) {
        const schedules = await storage.getPaymentSchedulesByConsumer(consumer.id, tenantId);
        totalSchedulesFound += schedules.length;
        
        for (const schedule of schedules) {
          if (schedule.status === 'active' && schedule.nextPaymentDate) {
            activeSchedulesFound++;
            
            // Generate all future payment dates for this schedule
            const futureDates: string[] = [];
            let currentDate = new Date(schedule.nextPaymentDate);
            
            // Determine how many payments to generate
            const maxPayments = schedule.remainingPayments || 12; // Default to 12 if indefinite
            const scheduleEndDate = schedule.endDate ? new Date(schedule.endDate) : null;
            
            // Generate future payment dates using date-fns addMonths for proper month handling
            for (let i = 0; i < maxPayments; i++) {
              // Stop if we've reached the schedule's end date
              if (scheduleEndDate && currentDate > scheduleEndDate) {
                break;
              }
              
              const dateStr = formatDate(currentDate, 'yyyy-MM-dd');
              futureDates.push(dateStr);
              
              // Move to next month using date-fns (handles month boundaries correctly)
              currentDate = addMonths(currentDate, 1);
            }
            
            // Add each future payment date to the calendar
            for (const date of futureDates) {
              // Filter by date range if provided
              if (startDate && date < startDate) {
                filteredOutByDateRange++;
                continue;
              }
              if (endDate && date > endDate) {
                filteredOutByDateRange++;
                continue;
              }

              if (!dailySchedules[date]) {
                dailySchedules[date] = [];
                dailyTotals[date] = 0;
              }

              dailySchedules[date].push({
                scheduleId: schedule.id,
                consumerId: consumer.id,
                consumerName: `${consumer.firstName || ''} ${consumer.lastName || ''}`.trim() || 'Unknown',
                amountCents: schedule.amountCents,
                arrangementType: schedule.arrangementType,
                accountId: schedule.accountId,
              });

              dailyTotals[date] += schedule.amountCents || 0;
            }
          }
        }
      }

      console.log(`📊 Calendar summary:`, {
        totalSchedules: totalSchedulesFound,
        activeSchedules: activeSchedulesFound,
        filteredByDateRange: filteredOutByDateRange,
        schedulesReturned: Object.values(dailySchedules).flat().length,
        daysWithSchedules: Object.keys(dailySchedules).length
      });

      res.json({
        dailySchedules,
        dailyTotals,
      });

    } catch (error) {
      console.error("❌ Error fetching calendar data:", error);
      res.status(500).json({ message: "Failed to fetch calendar data" });
    }
  });

  // Failed payments endpoint
  app.get('/api/scheduled-payments/failed', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const consumers = await storage.getConsumersByTenant(tenantId);
      const failedPayments: any[] = [];

      for (const consumer of consumers) {
        const schedules = await storage.getPaymentSchedulesByConsumer(consumer.id, tenantId);
        
        for (const schedule of schedules) {
          if (schedule.status === 'failed' || (schedule.failedAttempts && schedule.failedAttempts > 0)) {
            const account = schedule.accountId ? await storage.getAccount(schedule.accountId) : null;
            
            failedPayments.push({
              scheduleId: schedule.id,
              consumerId: consumer.id,
              consumerName: `${consumer.firstName || ''} ${consumer.lastName || ''}`.trim() || 'Unknown',
              consumerEmail: consumer.email,
              consumerPhone: consumer.phone,
              amountCents: schedule.amountCents,
              nextPaymentDate: schedule.nextPaymentDate,
              failedAttempts: schedule.failedAttempts || 0,
              status: schedule.status,
              arrangementType: schedule.arrangementType,
              accountNumber: account?.accountNumber,
              creditor: account?.creditor,
              lastFailureReason: schedule.lastFailureReason || 'No reason provided',
            });
          }
        }
      }

      // Sort by failed attempts (highest first) then by date
      failedPayments.sort((a, b) => {
        if (b.failedAttempts !== a.failedAttempts) {
          return b.failedAttempts - a.failedAttempts;
        }
        return (a.nextPaymentDate || '').localeCompare(b.nextPaymentDate || '');
      });

      res.json(failedPayments);

    } catch (error) {
      console.error("Error fetching failed payments:", error);
      res.status(500).json({ message: "Failed to fetch failed payments" });
    }
  });

  // Company management routes
  app.get('/api/company/consumers', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const tenant = await storage.getTenant(tenantId);
      const consumers = await storage.getConsumersByTenant(tenantId);

      // Add account count, total balance, and tenant slug for each consumer
      const consumersWithStats = await Promise.all(
        consumers.map(async (consumer) => {
          const accounts = await storage.getAccountsByConsumer(consumer.id);
          return {
            ...consumer,
            accountCount: accounts.length,
            totalBalanceCents: accounts.reduce((sum, acc) => sum + (acc.balanceCents || 0), 0),
            tenantSlug: tenant?.slug,
          };
        })
      );

      res.json(consumersWithStats);
    } catch (error) {
      console.error("Error fetching company consumers:", error);
      res.status(500).json({ message: "Failed to fetch consumers" });
    }
  });

  const mapPlatformRoleToDisplay = (role: string): string => {
    switch (role) {
      case 'platform_admin':
      case 'owner':
        return 'admin';
      case 'manager':
      case 'agent':
      case 'viewer':
      case 'uploader':
        return role;
      default:
        return role;
    }
  };

  const displayRoleToPlatformRole: Record<'admin' | 'manager' | 'agent', 'owner' | 'manager' | 'agent'> = {
    admin: 'owner',
    manager: 'manager',
    agent: 'agent',
  };

  app.get('/api/company/admins', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const admins = await storage.getPlatformUsersByTenant(tenantId);
      const formattedAdmins = admins.map(admin => ({
        id: admin.id,
        authId: admin.authId,
        tenantId: admin.tenantId,
        isActive: admin.isActive,
        permissions: admin.permissions,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
        role: mapPlatformRoleToDisplay(admin.role),
        platformRole: admin.role,
        email: admin.userDetails?.email ?? null,
        firstName: admin.userDetails?.firstName ?? null,
        lastName: admin.userDetails?.lastName ?? null,
        profileImageUrl: admin.userDetails?.profileImageUrl ?? null,
      }));

      res.json(formattedAdmins);
    } catch (error) {
      console.error("Error fetching company admins:", error);
      res.status(500).json({ message: "Failed to fetch admins" });
    }
  });

  app.post('/api/company/admins', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const adminSchema = z.object({
        email: z.string().email(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        role: z.enum(['admin', 'manager', 'agent']).default('admin'),
      });

      const { email, firstName, lastName, role } = adminSchema.parse(req.body);

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const userRecord = existingUser
        ? await storage.upsertUser({
            id: existingUser.id,
            email,
            firstName,
            lastName,
          })
        : await storage.upsertUser({
            email,
            firstName,
            lastName,
          });

      const [existingPlatformUser] = await db
        .select()
        .from(platformUsers)
        .where(
          and(
            eq(platformUsers.authId, userRecord.id),
            eq(platformUsers.tenantId, tenantId)
          )
        )
        .limit(1);

      const platformRole = displayRoleToPlatformRole[role];

      let platformUserRecord;
      if (existingPlatformUser) {
        const [updatedPlatformUser] = await db
          .update(platformUsers)
          .set({
            role: platformRole,
            updatedAt: new Date(),
          })
          .where(eq(platformUsers.id, existingPlatformUser.id))
          .returning();
        platformUserRecord = updatedPlatformUser;
      } else {
        platformUserRecord = await storage.createPlatformUser({
          authId: userRecord.id,
          tenantId,
          role: platformRole,
        });
      }

      const responsePayload = {
        id: platformUserRecord.id,
        authId: platformUserRecord.authId,
        tenantId: platformUserRecord.tenantId,
        isActive: platformUserRecord.isActive,
        permissions: platformUserRecord.permissions,
        createdAt: platformUserRecord.createdAt,
        updatedAt: platformUserRecord.updatedAt,
        role,
        platformRole: platformUserRecord.role,
        email: userRecord.email,
        firstName: userRecord.firstName ?? null,
        lastName: userRecord.lastName ?? null,
        profileImageUrl: userRecord.profileImageUrl ?? null,
      };

      res.status(existingPlatformUser ? 200 : 201).json(responsePayload);
    } catch (error) {
      console.error("Error creating company admin:", error);
      res.status(500).json({ message: "Failed to create admin" });
    }
  });

  app.patch('/api/company/consumers/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }
      const { id } = req.params;

      const consumer = await storage.getConsumer(id);
      if (!consumer || consumer.tenantId !== tenantId) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      const updatedConsumer = await storage.updateConsumer(id, req.body);
      res.json(updatedConsumer);
    } catch (error) {
      console.error("Error updating consumer:", error);
      res.status(500).json({ message: "Failed to update consumer" });
    }
  });

  // Payment routes
  app.get('/api/payments', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      console.log('📊 Fetching payments for tenant:', tenantId);
      
      if (!tenantId) { 
        console.log('❌ No tenant access for payments query');
        return res.status(403).json({ message: "No tenant access" });
      }

      const payments = await storage.getPaymentsByTenant(tenantId);
      console.log('✅ Payments fetched:', {
        count: payments.length,
        paymentIds: payments.slice(0, 5).map(p => p.id),
        totalShowing: Math.min(5, payments.length),
        totalCount: payments.length
      });
      
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.get('/api/payments/stats', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const stats = await storage.getPaymentStats(tenantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching payment stats:", error);
      res.status(500).json({ message: "Failed to fetch payment stats" });
    }
  });

  // Get payment history by consumer ID (admin)
  app.get('/api/payments/consumer/:consumerId', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { consumerId } = req.params;
      
      // Verify consumer belongs to this tenant
      const consumer = await storage.getConsumer(consumerId);
      if (!consumer || consumer.tenantId !== tenantId) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      const payments = await storage.getPaymentsByConsumer(consumerId, tenantId);
      
      console.log('📜 Admin fetching payment history for consumer:', {
        consumerId,
        tenantId,
        totalPayments: payments.length
      });

      res.json(payments);
    } catch (error) {
      console.error("Error fetching consumer payment history:", error);
      res.status(500).json({ message: "Failed to fetch payment history" });
    }
  });

  // Admin routes for viewing all payment schedules and methods
  app.get('/api/payment-schedules', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const schedules = await storage.getAllPaymentSchedulesByTenant(tenantId);
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching payment schedules:", error);
      res.status(500).json({ message: "Failed to fetch payment schedules" });
    }
  });

  // Get payment schedules for a specific consumer (admin access)
  app.get('/api/payment-schedules/consumer/:consumerId', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const { consumerId } = req.params;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Verify consumer belongs to this tenant
      const consumer = await storage.getConsumer(consumerId);
      if (!consumer || consumer.tenantId !== tenantId) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      // Get active payment schedules for this consumer
      const schedules = await storage.getPaymentSchedulesByConsumer(consumerId, tenantId);
      const activeSchedules = schedules.filter(s => s.status === 'active');

      // Enrich with account details
      const enrichedSchedules = await Promise.all(activeSchedules.map(async (schedule) => {
        const account = await storage.getAccount(schedule.accountId);
        const paymentMethod = await storage.getPaymentMethod(schedule.paymentMethodId);

        return {
          id: schedule.id,
          arrangementType: schedule.arrangementType,
          amountCents: schedule.amountCents,
          frequency: schedule.frequency,
          nextPaymentDate: schedule.nextPaymentDate,
          remainingPayments: schedule.remainingPayments,
          status: schedule.status,
          source: schedule.source,
          processor: schedule.processor,
          accountNumber: account?.accountNumber,
          accountCreditor: account?.creditor,
          cardLast4: paymentMethod?.cardLast4,
          cardBrand: paymentMethod?.cardBrand,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
        };
      }));

      res.json(enrichedSchedules);
    } catch (error) {
      console.error("Error fetching consumer payment schedules:", error);
      res.status(500).json({ message: "Failed to fetch consumer payment schedules" });
    }
  });

  app.get('/api/payment-methods', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const methods = await storage.getAllPaymentMethodsByTenant(tenantId);
      res.json(methods);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  // Approve payment arrangement (activate and sync to SMAX)
  app.post('/api/payment-schedules/:id/approve', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Get all schedules and find the one to approve
      const allSchedules = await storage.getAllPaymentSchedulesByTenant(tenantId);
      const schedule = allSchedules.find((s: any) => s.id === id);
      
      if (!schedule) {
        return res.status(404).json({ message: "Payment schedule not found" });
      }

      // State validation: Only allow approval if status is pending_approval
      if (schedule.status !== 'pending_approval') {
        return res.status(409).json({ 
          message: "Cannot approve this arrangement", 
          reason: `Arrangement is already ${schedule.status}` 
        });
      }

      // Update schedule status to active
      await storage.updatePaymentSchedule(id, tenantId, {
        status: 'active',
        updatedAt: new Date(),
      });

      // Sync to SMAX if configured
      try {
        const account = await storage.getAccount(schedule.accountId);
        const consumer = await storage.getConsumer(schedule.consumerId);
        const paymentMethod = await storage.getPaymentMethod(schedule.paymentMethodId);

        if (account?.filenumber) {
          console.log('💰 Syncing approved arrangement to SMAX...');
          
          const payorName = `${consumer?.firstName || ''} ${consumer?.lastName || ''}`.trim() || 'Consumer';
          const arrangementTypeName = schedule.arrangementType;
          const monthlyPayment = schedule.amountCents / 100;
          
          const smaxSyncResult = await smaxService.insertPaymentArrangement(tenantId, {
            filenumber: account.filenumber,
            payorname: payorName,
            arrangementtype: arrangementTypeName,
            monthlypayment: monthlyPayment,
            startdate: schedule.startDate,
            enddate: schedule.endDate || undefined,
            nextpaymentdate: schedule.nextPaymentDate,
            remainingpayments: schedule.remainingPayments || undefined,
            totalbalance: (account.balanceCents || 0) / 100,
            cardtoken: paymentMethod?.paymentToken || undefined,
            cardlast4: paymentMethod?.cardLast4 || undefined,
            cardbrand: paymentMethod?.cardBrand || undefined,
            expirymonth: paymentMethod?.expiryMonth || undefined,
            expiryyear: paymentMethod?.expiryYear || undefined,
            cardholdername: paymentMethod?.cardholderName || undefined,
            billingzip: paymentMethod?.billingZip || undefined,
          });

          if (smaxSyncResult) {
            // Mark as synced to prevent duplication when pulling from SMAX
            await storage.updatePaymentSchedule(id, tenantId, {
              source: 'chain',
              smaxSynced: true,
              smaxLastSyncAt: new Date(),
            });
            console.log('✅ Arrangement synced to SMAX successfully and marked as synced');
          } else {
            console.log('⚠️ SMAX sync returned false - not marking as synced');
          }
        }
      } catch (smaxError) {
        console.error('⚠️ Error syncing to SMAX (non-blocking):', smaxError);
        // Don't fail the approval if SMAX sync fails
      }

      res.json({ message: "Arrangement approved and activated" });
    } catch (error) {
      console.error("Error approving payment schedule:", error);
      res.status(500).json({ message: "Failed to approve arrangement" });
    }
  });

  // Reject payment arrangement (mark as cancelled)
  app.post('/api/payment-schedules/:id/reject', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Get the schedule and validate state
      const allSchedules = await storage.getAllPaymentSchedulesByTenant(tenantId);
      const schedule = allSchedules.find((s: any) => s.id === id);
      
      if (!schedule) {
        return res.status(404).json({ message: "Payment schedule not found" });
      }

      // State validation: Only allow rejection if status is pending_approval
      if (schedule.status !== 'pending_approval') {
        return res.status(409).json({ 
          message: "Cannot reject this arrangement", 
          reason: `Arrangement is already ${schedule.status}` 
        });
      }

      // Mark the payment schedule as cancelled instead of deleting
      await storage.updatePaymentSchedule(id, tenantId, {
        status: 'cancelled',
        updatedAt: new Date(),
      });

      console.log(`🚫 Payment arrangement rejected: ${id} by admin (tenant: ${tenantId})`);

      res.json({ message: "Arrangement rejected and cancelled" });
    } catch (error) {
      console.error("Error rejecting payment schedule:", error);
      res.status(500).json({ message: "Failed to reject arrangement" });
    }
  });

  // Cancel/Delete payment schedule (admin)
  app.delete('/api/payment-schedules/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Verify the schedule belongs to this tenant
      const allSchedules = await storage.getAllPaymentSchedulesByTenant(tenantId);
      const schedule = allSchedules.find((s: any) => s.id === id);
      
      if (!schedule) {
        return res.status(404).json({ message: "Payment schedule not found" });
      }

      // Cancel the schedule
      const success = await storage.cancelPaymentSchedule(id, tenantId);

      if (success) {
        console.log(`🗑️ Payment schedule ${id} cancelled by admin (tenant: ${tenantId})`);
        res.json({ message: "Payment schedule cancelled successfully" });
      } else {
        res.status(500).json({ message: "Failed to cancel payment schedule" });
      }
    } catch (error) {
      console.error("Error cancelling payment schedule:", error);
      res.status(500).json({ message: "Failed to cancel payment schedule" });
    }
  });

  // Update payment schedule (edit arrangement)
  app.patch('/api/payment-schedules/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { amountCents, nextPaymentDate, frequency, endDate, remainingPayments } = req.body;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Verify the schedule belongs to this tenant
      const allSchedules = await storage.getAllPaymentSchedulesByTenant(tenantId);
      const schedule = allSchedules.find((s: any) => s.id === id);
      
      if (!schedule) {
        return res.status(404).json({ message: "Payment schedule not found" });
      }

      // Build updates object
      const updates: any = { updatedAt: new Date() };
      if (amountCents !== undefined) updates.amountCents = amountCents;
      if (nextPaymentDate !== undefined) updates.nextPaymentDate = new Date(nextPaymentDate);
      if (frequency !== undefined) updates.frequency = frequency;
      if (endDate !== undefined) updates.endDate = new Date(endDate);
      if (remainingPayments !== undefined) updates.remainingPayments = remainingPayments;

      // Update the schedule in database
      const updatedSchedule = await storage.updatePaymentSchedule(id, tenantId, updates);

      // Sync to SMAX if enabled
      const tenant = await storage.getTenant(tenantId);
      const settings = await storage.getTenantSettings(tenantId);
      
      if (settings?.smaxEnabled && schedule.account?.accountNumber) {
        try {
          const smaxService = new SmaxService();
          
          // Use update_payment_external to sync changes to SMAX
          await smaxService.updatePayment(tenantId, {
            filenumber: schedule.account.accountNumber,
            paymentdate: nextPaymentDate ? new Date(nextPaymentDate).toISOString().split('T')[0] : undefined,
          });
          
          console.log(`✅ SMAX sync completed for schedule ${id}`);
        } catch (smaxError) {
          console.error('⚠️ SMAX sync failed (continuing):', smaxError);
        }
      }

      console.log(`✏️ Payment schedule ${id} updated by admin (tenant: ${tenantId}):`, updates);
      res.json(updatedSchedule);
    } catch (error) {
      console.error("Error updating payment schedule:", error);
      res.status(500).json({ message: "Failed to update payment schedule" });
    }
  });

  // Request cancellation of payment schedule (sends email to agency instead of deleting)
  app.post('/api/payment-schedules/:id/request-cancellation', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { reason } = req.body;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Verify the schedule belongs to this tenant
      const allSchedules = await storage.getAllPaymentSchedulesByTenant(tenantId);
      const schedule = allSchedules.find((s: any) => s.id === id);
      
      if (!schedule) {
        return res.status(404).json({ message: "Payment schedule not found" });
      }

      // Get tenant and consumer info
      const tenant = await storage.getTenant(tenantId);
      const consumer = schedule.consumer;
      const account = schedule.account;

      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      // Get tenant settings to find contact email
      const settings = await storage.getTenantSettings(tenantId);
      const recipientEmail = settings?.contactEmail || tenant.email;

      if (!recipientEmail) {
        return res.status(400).json({ message: "No agency contact email configured" });
      }

      // Format schedule details
      const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
      const formatDate = (date: Date | string | null) => date ? new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A';

      // Send cancellation request email to agency
      const emailSubject = `Arrangement Cancellation Request - ${consumer?.firstName} ${consumer?.lastName}`;
      const emailBody = `
        <h2>Arrangement Cancellation Request</h2>
        <p>A consumer has requested to cancel their payment arrangement.</p>
        
        <h3>Consumer Information:</h3>
        <ul>
          <li><strong>Name:</strong> ${consumer?.firstName} ${consumer?.lastName}</li>
          <li><strong>Email:</strong> ${consumer?.email || 'N/A'}</li>
          <li><strong>Phone:</strong> ${consumer?.phone || 'N/A'}</li>
        </ul>
        
        <h3>Account Information:</h3>
        <ul>
          <li><strong>Account Number:</strong> ${account?.accountNumber || 'N/A'}</li>
          <li><strong>Creditor:</strong> ${account?.creditor || 'N/A'}</li>
          <li><strong>Current Balance:</strong> ${account?.balanceCents ? formatCurrency(account.balanceCents) : 'N/A'}</li>
        </ul>
        
        <h3>Arrangement Details:</h3>
        <ul>
          <li><strong>Payment Amount:</strong> ${formatCurrency(schedule.amountCents)}</li>
          <li><strong>Frequency:</strong> ${schedule.frequency || 'Monthly'}</li>
          <li><strong>Next Payment Date:</strong> ${formatDate(schedule.nextPaymentDate)}</li>
          <li><strong>Remaining Payments:</strong> ${schedule.remainingPayments ?? 'N/A'}</li>
          <li><strong>Schedule Status:</strong> ${schedule.status}</li>
        </ul>
        
        ${reason ? `<h3>Reason for Cancellation:</h3><p>${reason}</p>` : ''}
        
        <p><em>Please review this request and take appropriate action in the Chain platform.</em></p>
        
        <p>Best regards,<br>Chain Platform</p>
      `;

      await emailService.sendEmail({
        to: recipientEmail,
        subject: emailSubject,
        html: emailBody,
        from: `Chain Platform <notifications@chainsoftwaregroup.com>`,
        tenantId: tenantId,
      });

      console.log(`📧 Cancellation request email sent to ${recipientEmail} for schedule ${id}`);
      res.json({ message: "Cancellation request sent successfully" });
    } catch (error) {
      console.error("Error sending cancellation request:", error);
      res.status(500).json({ message: "Failed to send cancellation request" });
    }
  });


  // Payment approval routes
  app.get('/api/payment-approvals', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const approvals = await storage.getPendingPaymentApprovals(tenantId);
      res.json(approvals);
    } catch (error) {
      console.error("Error fetching payment approvals:", error);
      res.status(500).json({ message: "Failed to fetch payment approvals" });
    }
  });

  app.post('/api/payment-approvals/:id/approve', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const approval = await storage.approvePaymentApproval(id, userId);

      if (!approval) {
        return res.status(404).json({ message: "Approval not found" });
      }

      // Handle different approval types
      if (approval.approvalType === 'card_change') {
        // Card change approval: update the payment schedule with new payment method
        if (approval.newPaymentMethodId && approval.scheduleId) {
          try {
            await storage.updatePaymentSchedule(approval.scheduleId, tenantId, {
              paymentMethodId: approval.newPaymentMethodId,
              updatedAt: new Date(),
            });

            // Sync card data to SMAX if enabled
            if (approval.filenumber) {
              try {
                const oldMethod = await storage.getPaymentMethod(approval.oldPaymentMethodId!);
                const newMethod = await storage.getPaymentMethod(approval.newPaymentMethodId);
                
                // Update card details in SMAX (partial update with PCI-compliant data only)
                if (newMethod) {
                  const smaxCardData: any = {
                    filenumber: approval.filenumber,
                  };

                  // Map card brand to SMAX card type
                  if (newMethod.cardBrand) {
                    const brandMap: Record<string, string> = {
                      'Visa': 'Visa',
                      'Mastercard': 'MasterCard',
                      'MasterCard': 'MasterCard',
                      'American Express': 'American Express',
                      'Amex': 'American Express',
                      'Discover': 'Discover',
                    };
                    smaxCardData.cardtype = brandMap[newMethod.cardBrand] || newMethod.cardBrand;
                  }

                  // Add expiration data
                  if (newMethod.expiryMonth && newMethod.expiryYear) {
                    smaxCardData.cardexpirationmonth = newMethod.expiryMonth;
                    smaxCardData.cardexpirationyear = newMethod.expiryYear.slice(-2); // Use last 2 digits (YY)
                    smaxCardData.cardexpirationdate = `${newMethod.expiryMonth}/${newMethod.expiryYear.slice(-2)}`;
                  }

                  // Add cardholder name if available
                  if (newMethod.cardholderName) {
                    smaxCardData.payorname = newMethod.cardholderName;
                  }

                  // Update SMAX payment record (PENDING payments only)
                  await smaxService.updatePayment(tenantId, smaxCardData);
                  console.log('✅ SMAX payment record updated with new card details');
                }

                // Also create a note for additional context
                const noteText = `Card change approved by admin. New card: ${newMethod?.cardBrand || 'Card'} ending in ${newMethod?.cardLast4}. Previous card: ${oldMethod?.cardBrand || 'Card'} ending in ${oldMethod?.cardLast4 || '****'}. Card expiration and type synced to SMAX. Admin: ${userId}`;
                
                await smaxService.insertNote(tenantId, {
                  filenumber: approval.filenumber,
                  collectorname: userId,
                  logmessage: noteText
                });

                console.log('✅ SMAX note created for approved card change');
              } catch (smaxError) {
                console.warn('⚠️ Failed to sync card data to SMAX after approval (non-blocking):', smaxError);
              }
            }

            console.log('✅ Payment schedule updated after card change approval');
          } catch (updateError) {
            console.error('❌ Failed to update payment schedule after approval:', updateError);
            throw updateError;
          }
        }
      } else {
        // Payment approval: update SMAX with payment details
        if (approval.filenumber && approval.paymentData) {
          try {
            await smaxService.updatePayment(tenantId, {
              filenumber: approval.filenumber,
              ...approval.paymentData
            });
            console.log('✅ SMAX payment updated successfully after approval');
          } catch (smaxError) {
            console.warn('⚠️ Failed to update SMAX after approval (non-blocking):', smaxError);
          }
        }
      }

      res.json({ success: true, approval });
    } catch (error) {
      console.error("Error approving payment:", error);
      res.status(500).json({ message: "Failed to approve payment" });
    }
  });

  app.post('/api/payment-approvals/:id/reject', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const { id } = req.params;
      const { reason } = req.body;

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const approval = await storage.rejectPaymentApproval(id, userId, reason);

      if (!approval) {
        return res.status(404).json({ message: "Approval not found" });
      }

      res.json({ success: true, approval });
    } catch (error) {
      console.error("Error rejecting payment:", error);
      res.status(500).json({ message: "Failed to reject payment" });
    }
  });

  // Payment methods routes (tokenized cards)
  app.get('/api/payment-methods/consumer/:consumerId', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { consumerId } = req.params;
      const paymentMethods = await storage.getPaymentMethodsByConsumer(consumerId, tenantId);
      
      // Mask the payment token for security
      const maskedMethods = paymentMethods.map(method => ({
        ...method,
        paymentToken: `tok_****${method.paymentToken.slice(-4)}` // Mask token, show last 4 chars
      }));
      
      res.json(maskedMethods);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  // Real-time payment processing endpoint (admin-initiated payments)
  app.post('/api/payments/process', authenticateUser, requirePaymentProcessing, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { 
        consumerEmail, 
        amountCents, 
        cardNumber, 
        expiryDate, 
        cvv, 
        cardName, 
        zipCode 
      } = req.body;

      if (!consumerEmail || !amountCents || !cardNumber || !expiryDate || !cvv || !cardName) {
        return res.status(400).json({ message: "Missing required payment information" });
      }

      // Get consumer by email
      const consumer = await storage.getConsumerByEmailAndTenant(consumerEmail, tenantId);
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found" });
      }
      
      // Get tenant settings for merchant provider and credentials
      const settings = await storage.getTenantSettings(tenantId);
      
      // Check if consumer has any active accounts before processing payment
      // This checks SMAX statusname (if SMAX enabled) or Chain's account status for each account
      const consumerAccounts = await storage.getAccountsByConsumer(consumer.id);
      if (consumerAccounts && consumerAccounts.length > 0) {
        const accountValidations = await Promise.all(
          consumerAccounts.map(acc => validatePaymentStatus(acc, tenantId, settings))
        );
        const allBlocked = accountValidations.every(v => v.isBlocked);
        if (allBlocked) {
          const blockedStatuses = accountValidations.map(v => v.status).filter(Boolean).join(', ');
          console.log(`❌ Payment blocked: All consumer accounts have blocked statuses (${blockedStatuses})`);
          return res.status(403).json({ 
            success: false,
            message: "All accounts for this consumer are not eligible for payments at this time." 
          });
        }
      }
      
      // Determine which merchant provider is configured
      const merchantProvider = settings?.merchantProvider;
      const useSandbox = settings?.useSandbox;

      if (!merchantProvider) {
        console.error("No merchant provider configured for tenant:", tenantId);
        return res.status(500).json({ 
          success: false,
          message: "Payment processing is not configured. Please contact support." 
        });
      }

      // DUPLICATE PAYMENT PROTECTION: Check if a similar payment was processed recently
      // This prevents double-charges from network timeouts, double-clicks, or browser back/refresh
      if (amountCents > 0) {
        const recentDuplicate = await storage.checkRecentDuplicatePayment(
          consumer.id,
          null, // Admin payments don't track specific accountId
          amountCents,
          5 // 5-minute window
        );
        
        if (recentDuplicate) {
          console.log(`⚠️ DUPLICATE ADMIN PAYMENT BLOCKED: Found recent payment for same consumer/amount`, {
            existingPaymentId: recentDuplicate.id,
            existingTransactionId: recentDuplicate.transactionId,
            existingCreatedAt: recentDuplicate.createdAt,
            consumerId: consumer.id,
            amountCents
          });
          return res.status(409).json({
            success: false,
            message: "A payment for this amount was already processed within the last few minutes. Please check your payment history before trying again.",
            existingPaymentId: recentDuplicate.id,
            existingTransactionId: recentDuplicate.transactionId
          });
        }
      }

      console.log('🏦 Admin payment - merchant provider:', merchantProvider);

      // Parse expiry date (MM/YY format)
      const expiryParts = expiryDate.split('/');
      const expiryMonth = expiryParts[0]?.trim();
      const expiryYear = expiryParts[1]?.trim();

      if (!expiryMonth || !expiryYear) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid expiry date format. Use MM/YY" 
        });
      }

      let success = false;
      let transactionId: string;
      let cardLast4 = cardNumber.slice(-4);
      let paymentResult: any;

      // Route to appropriate payment processor
      if (merchantProvider === 'nmi') {
        // ===== NMI ADMIN PAYMENT =====
        console.log('🟣 Processing admin payment with NMI');

        if (!settings?.nmiSecurityKey) {
          console.error("NMI credentials not configured for tenant:", tenantId);
          return res.status(500).json({ 
            success: false,
            message: "Payment processing is not configured. Please contact support." 
          });
        }

        const { NMIService } = await import('./nmiService');
        const nmiService = new NMIService({
          securityKey: settings.nmiSecurityKey.trim(),
        });

        // Admin payments use direct sale (no vault)
        const nmiResult = await nmiService.processSale({
          amount: parseFloat((amountCents / 100).toFixed(2)),
          ccnumber: cardNumber.replace(/\s/g, ''),
          ccexp: `${expiryMonth}${expiryYear.slice(-2)}`,
          cvv,
          orderid: `admin_${Date.now()}`,
          firstName: cardName.split(' ')[0] || cardName,
          lastName: cardName.split(' ').slice(1).join(' ') || '',
          address: '',
          city: '',
          state: '',
          zip: zipCode || '',
        });

        paymentResult = nmiResult;
        success = nmiResult.success;
        transactionId = nmiResult.transactionId || `nmi_${Date.now()}`;

        if (!success) {
          console.error('❌ NMI admin payment failed:', nmiResult.responseText);
          return res.status(400).json({
            success: false,
            message: nmiResult.errorMessage || nmiResult.responseText || 'Payment declined',
          });
        }

      } else if (merchantProvider === 'authorize_net') {
        // ===== AUTHORIZE.NET ADMIN PAYMENT =====
        console.log('🔵 Processing admin payment with Authorize.net');

        if (!settings?.authnetApiLoginId || !settings?.authnetTransactionKey) {
          console.error("Authorize.net credentials not configured for tenant:", tenantId);
          return res.status(500).json({ 
            success: false,
            message: "Payment processing is not configured. Please contact support." 
          });
        }

        const { AuthnetService } = await import('./authnetService');
        const authnetService = new AuthnetService({
          apiLoginId: settings.authnetApiLoginId.trim(),
          transactionKey: settings.authnetTransactionKey.trim(),
          useSandbox: useSandbox ?? true,
        });

        // Admin payments use direct charge (no profile)
        const authnetResult = await authnetService.processPayment({
          amount: (amountCents / 100).toString(),
          cardNumber: cardNumber.replace(/\s/g, ''),
          expirationDate: `${expiryYear}-${expiryMonth}`,
          cardCode: cvv,
          invoice: `admin_${Date.now()}`,
          description: `Admin payment for ${consumer.firstName} ${consumer.lastName}`,
        });

        paymentResult = authnetResult;
        success = authnetResult.success;
        transactionId = authnetResult.transactionId || `authnet_${Date.now()}`;

        if (!success) {
          console.error('❌ Authorize.net admin payment failed:', authnetResult.errorMessage);
          return res.status(400).json({
            success: false,
            message: authnetResult.errorMessage || 'Payment declined',
          });
        }

      } else {
        // ===== USAEPAY ADMIN PAYMENT =====
        console.log('🟢 Processing admin payment with USAePay');

        const merchantApiKey = settings?.merchantApiKey?.trim();
        const merchantApiPin = settings?.merchantApiPin?.trim();

        if (!merchantApiKey || !merchantApiPin) {
          console.error("USAePay credentials not configured for tenant:", tenantId);
          return res.status(500).json({ 
            success: false,
            message: "Payment processing is not configured. Please contact support." 
          });
        }

        const usaepayBaseUrl = useSandbox 
          ? "https://sandbox.usaepay.com/api/v2"
          : "https://secure.usaepay.com/api/v2";

        // Generate authentication header
        const generateAuthHeader = (apiKey: string, apiPin: string): string => {
          const seed = Array.from({ length: 16 }, () => 
            Math.random().toString(36).charAt(2)
          ).join('');
          const prehash = apiKey + seed + apiPin;
          const hash = crypto.createHash('sha256').update(prehash).digest('hex');
          const apihash = `s2/${seed}/${hash}`;
          const authKey = Buffer.from(`${apiKey}:${apihash}`).toString('base64');
          return `Basic ${authKey}`;
        };

        const authHeader = generateAuthHeader(merchantApiKey, merchantApiPin);

        const usaepayPayload = {
          command: "sale",
          amount: (amountCents / 100).toFixed(2),
          invoice: `admin_payment_${Date.now()}`,
          description: `Admin-initiated payment for ${consumer.firstName} ${consumer.lastName}`,
          creditcard: {
            number: cardNumber.replace(/\s/g, ''),
            expiration: `${expiryMonth}${expiryYear}`,
            cvc: cvv,
            cardholder: cardName,
            avs_street: "",
            avs_zip: zipCode || ""
          }
        };

        const usaepayResponse = await fetch(`${usaepayBaseUrl}/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
          },
          body: JSON.stringify(usaepayPayload)
        });

        const usaepayResult = await usaepayResponse.json();
        paymentResult = usaepayResult;

        success = usaepayResult.result === 'Approved' || usaepayResult.status === 'Approved';
        transactionId = usaepayResult.refnum || usaepayResult.key || `tx_${Date.now()}`;
        
        if (!success) {
          console.error('❌ USAePay admin payment failed:', {
            error: usaepayResult.error,
            errorcode: usaepayResult.errorcode,
            result: usaepayResult.result
          });

          return res.status(400).json({
            success: false,
            message: usaepayResult.error || usaepayResult.result || 'Payment declined',
          });
        }
      }

      // Create payment record
      const payment = await storage.createPayment({
        tenantId: tenantId,
        consumerId: consumer.id,
        amountCents,
        paymentMethod: 'credit_card',
        status: 'completed',
        transactionId: transactionId,
        processorResponse: JSON.stringify(usaepayResult),
        processedAt: new Date(),
        notes: `Admin payment - ${cardName} ending in ${cardLast4}`,
      });

      // Sync to SMAX if enabled
      try {
        const { smaxService } = await import('./smaxService');
        const accounts = await storage.getAccountsByConsumer(consumer.id);
        if (accounts && accounts.length > 0) {
          const account = accounts[0];
          if (account.filenumber) {
            const paymentData = smaxService.createSmaxPaymentData({
              filenumber: account.filenumber,
              paymentamount: amountCents / 100,
              paymentdate: new Date().toISOString().split('T')[0],
              payorname: `${consumer.firstName} ${consumer.lastName}`,
              paymentmethod: 'CREDIT CARD',
              cardLast4: cardLast4,
              transactionid: transactionId,
            });
            await smaxService.insertPayment(tenantId, paymentData);
            console.log(`✅ Admin payment synced to SMAX for filenumber: ${account.filenumber}`);
          } else {
            console.warn(`⚠️ No filenumber for account ${account.accountNumber || account.id} - skipping SMAX sync`);
          }
        }
      } catch (smaxError) {
        console.error('SMAX sync failed:', smaxError);
      }

      res.json({
        success: true,
        payment: {
          id: payment.id,
          amount: amountCents,
          status: payment.status,
          transactionId: payment.transactionId,
          processedAt: payment.processedAt,
        },
        message: "Payment processed successfully"
      });

    } catch (error) {
      console.error("Error processing admin payment:", error);
      res.status(500).json({ 
        success: false,
        message: "Payment processing failed. Please try again." 
      });
    }
  });

  app.post('/api/payments/manual', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { consumerEmail, accountId, amountCents, paymentMethod, transactionId, notes } = req.body;

      // Get consumer
      const consumer = await storage.getConsumerByEmailAndTenant(consumerEmail, tenantId);
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      // Check if account status is blocked (if accountId is provided)
      if (accountId) {
        const account = await storage.getAccount(accountId);
        if (account) {
          const tenantSettings = await storage.getTenantSettings(tenantId);
          const statusValidation = await validatePaymentStatus(account, tenantId, tenantSettings);
          if (statusValidation.isBlocked) {
            console.log(`❌ Manual payment blocked: ${statusValidation.reason}`);
            return res.status(403).json({ 
              success: false,
              message: "This account is not eligible for payments at this time." 
            });
          }
        }
      }

      // Create payment record
      const payment = await storage.createPayment({
        tenantId: tenantId,
        consumerId: consumer.id,
        accountId: accountId || null,
        amountCents,
        paymentMethod,
        transactionId,
        notes,
        status: "completed", // Manual payments are immediately completed
        processedAt: new Date(),
      });

      // Notify SMAX if enabled
      try {
        const { smaxService } = await import('./smaxService');
        let filenumber = null;
        if (accountId) {
          const account = await storage.getAccount(accountId);
          filenumber = account?.filenumber || null;
        } else {
          const accounts = await storage.getAccountsByConsumer(consumer.id);
          if (accounts && accounts.length > 0) {
            filenumber = accounts[0].filenumber || null;
          }
        }
        
        // Only send to SMAX if filenumber exists
        if (filenumber) {
          const paymentData = smaxService.createSmaxPaymentData({
            filenumber: filenumber,
            paymentamount: amountCents / 100,
            paymentdate: new Date().toISOString().split('T')[0],
            payorname: `${consumer.firstName} ${consumer.lastName}`,
            paymentmethod: paymentMethod || 'MANUAL',
            transactionid: transactionId || `manual_${Date.now()}`,
          });
          await smaxService.insertPayment(tenantId, paymentData);
          console.log(`✅ Manual payment sent to SMAX for filenumber: ${filenumber}`);
        } else {
          console.warn(`⚠️ No filenumber found for manual payment - skipping SMAX sync`);
        }
      } catch (smaxError) {
        console.error('SMAX notification failed:', smaxError);
      }

      // Send email notification to company contact
      try {
        const account = accountId ? await storage.getAccount(accountId) : null;
        await emailService.sendPaymentNotification({
          tenantId,
          consumerName: `${consumer.firstName} ${consumer.lastName}`,
          accountNumber: account?.accountNumber || 'N/A',
          amountCents,
          paymentMethod: paymentMethod || 'Manual',
          transactionId,
          paymentType: 'manual',
        }).catch(err => console.error('Failed to send manual payment notification:', err));
      } catch (notificationError) {
        console.error('Error sending manual payment notification:', notificationError);
      }

      res.json(payment);
    } catch (error) {
      console.error("Error recording manual payment:", error);
      res.status(500).json({ message: "Failed to record payment" });
    }
  });

  // Delete payment
  app.delete('/api/payments/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const paymentId = req.params.id;
      await storage.deletePayment(paymentId, tenantId);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting payment:", error);
      res.status(500).json({ message: "Failed to delete payment" });
    }
  });

  // Bulk delete payments
  app.delete('/api/payments/bulk-delete', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { ids } = req.body ?? {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Payment IDs array is required" });
      }

      const deletedCount = await storage.bulkDeletePayments(ids, tenantId);

      if (deletedCount === 0) {
        return res.status(404).json({ message: "No payments found to delete" });
      }

      return res.status(200).json({
        success: true,
        message: `${deletedCount} payments deleted successfully`,
        deletedCount,
      });
    } catch (error) {
      console.error("Error bulk deleting payments:", error);
      return res.status(500).json({ message: "Failed to delete payments" });
    }
  });

  // Manually sync payment to SMAX
  app.post('/api/payments/:id/sync-to-smax', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const paymentId = req.params.id;
      
      const payment = await storage.getPaymentById(paymentId, tenantId);
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      if (!payment.accountId) {
        return res.status(400).json({ message: "Payment has no associated account" });
      }

      const account = await storage.getAccount(payment.accountId);
      if (!account || account.tenantId !== tenantId) {
        return res.status(404).json({ message: "Account not found" });
      }

      if (!account.filenumber) {
        return res.status(400).json({ message: "Account has no SMAX filenumber - cannot sync" });
      }

      const consumer = await storage.getConsumer(payment.consumerId);
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      console.log('🔄 Manually syncing payment to SMAX:', {
        paymentId: payment.id,
        filenumber: account.filenumber,
        amount: payment.amountCents / 100,
        transactionId: payment.transactionId
      });

      const { smaxService } = await import('./smaxService');
      
      const processorResponse = payment.processorResponse 
        ? (typeof payment.processorResponse === 'string' 
          ? JSON.parse(payment.processorResponse) 
          : payment.processorResponse)
        : {};

      // Get the saved payment method for this consumer to retrieve the token
      const paymentMethods = await storage.getPaymentMethodsByConsumer(payment.consumerId, tenantId);
      const savedPaymentMethod = paymentMethods.length > 0 ? paymentMethods[0] : null;
      
      // Extract card details from processor response
      const cardLast4 = processorResponse.card?.last4 || payment.notes?.match(/ending in (\d{4})/)?.[1] || '';
      const cardExpiryMatch = payment.notes?.match(/(\d{2})\/(\d{2,4})/);
      
      console.log('💳 Payment method details for SMAX sync:', {
        hasSavedMethod: !!savedPaymentMethod,
        paymentToken: savedPaymentMethod?.paymentToken ? `${savedPaymentMethod.paymentToken.substring(0, 8)}...` : 'none',
        cardLast4,
        cardExpiry: cardExpiryMatch ? `${cardExpiryMatch[1]}/${cardExpiryMatch[2]}` : 'none'
      });

      const smaxPaymentData = smaxService.createSmaxPaymentData({
        filenumber: account.filenumber,
        paymentamount: payment.amountCents / 100,
        paymentdate: payment.processedAt 
          ? new Date(payment.processedAt).toISOString().split('T')[0]
          : (payment.createdAt ? new Date(payment.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
        payorname: `${consumer.firstName} ${consumer.lastName}`,
        paymentmethod: 'CREDIT CARD',
        cardtype: processorResponse.cardtype || savedPaymentMethod?.cardBrand || 'Unknown',
        cardLast4: cardLast4,
        transactionid: payment.transactionId || undefined,
        // CRITICAL: Pass the USAePay token so SMAX can use it for future payments
        cardtoken: savedPaymentMethod?.paymentToken || undefined,
        cardholdername: savedPaymentMethod?.cardholderName || undefined,
        billingzip: savedPaymentMethod?.billingZip || undefined,
        cardexpirationmonth: cardExpiryMatch?.[1] || undefined,
        cardexpirationyear: cardExpiryMatch?.[2] || undefined,
      });

      const smaxSuccess = await smaxService.insertPayment(tenantId, smaxPaymentData);
      
      if (smaxSuccess) {
        console.log('✅ Payment manually synced to SMAX successfully');
        // Send note to SMAX about successful payment
        await smaxService.sendPaymentNote(tenantId, {
          filenumber: account.filenumber!,
          status: 'processed',
          amount: payment.amountCents / 100,
          transactionId: payment.transactionId || undefined
        });
        res.json({ 
          success: true, 
          message: 'Payment synced to SMAX successfully' 
        });
      } else {
        console.log('❌ Failed to manually sync payment to SMAX');
        res.status(500).json({ 
          success: false, 
          message: 'Failed to sync payment to SMAX - please check SMAX configuration' 
        });
      }
    } catch (error) {
      console.error("Error manually syncing payment to SMAX:", error);
      res.status(500).json({ message: "Failed to sync payment to SMAX" });
    }
  });

  // Billing endpoints
  app.get('/api/billing/subscription', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const subscription = await storage.getSubscriptionByTenant(tenantId);
      if (!subscription) {
        return res.json(null);
      }

      // Get the plan details
      const [plan] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, subscription.planId))
        .limit(1);

      if (!plan) {
        return res.status(500).json({ message: "Subscription plan not found" });
      }

      res.json({
        ...subscription,
        planId: plan.slug,
        planName: plan.name,
        planPrice: plan.monthlyPriceCents / 100,
        setupFee: (plan.setupFeeCents ?? 10000) / 100,
        includedEmails: plan.includedEmails,
        includedSmsSegments: plan.includedSms,
        emailsUsed: subscription.emailsUsedThisPeriod || 0,
        smsUsed: subscription.smsUsedThisPeriod || 0,
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  app.get('/api/billing/plans', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Get tenant settings to determine business type
      const tenantSettings = await storage.getTenantSettings(tenantId);
      const businessType = (tenantSettings?.businessType || 'call_center') as import('../shared/terminology').BusinessType;

      // Get business-type-specific plans
      const { getPlanListForBusinessType, EMAIL_OVERAGE_RATE_PER_THOUSAND, SMS_OVERAGE_RATE_PER_SEGMENT } = await import('../shared/billing-plans');
      const plans = getPlanListForBusinessType(businessType);

      const formattedPlans = plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        price: plan.price,
        setupFee: 100, // Standard setup fee
        includedEmails: plan.includedEmails,
        includedSmsSegments: plan.includedSmsSegments,
        emailOverageRatePer1000: EMAIL_OVERAGE_RATE_PER_THOUSAND,
        smsOverageRatePerSegment: SMS_OVERAGE_RATE_PER_SEGMENT,
        features: [], // Can be customized per business type later
      }));

      res.json({
        plans: formattedPlans,
        emailOverageRatePerThousand: EMAIL_OVERAGE_RATE_PER_THOUSAND,
        smsOverageRatePerSegment: SMS_OVERAGE_RATE_PER_SEGMENT,
      });
    } catch (error) {
      console.error("Error fetching subscription plans:", error);
      res.status(500).json({ message: "Failed to fetch subscription plans" });
    }
  });

  app.post('/api/billing/select-plan', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const bodySchema = z.object({
        planId: z.string(), // This is the plan slug
        billingEmail: z.string().email().optional(),
      });

      const parseResult = bodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "Invalid plan selection",
          errors: parseResult.error.flatten(),
        });
      }

      const { planId: planSlug, billingEmail } = parseResult.data;
      
      // Get the plan from database by slug
      const [plan] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.slug, planSlug))
        .limit(1);

      if (!plan) {
        return res.status(400).json({ message: "Unknown plan selection" });
      }

      const now = new Date();
      const periodStart = now;
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const existingSubscription = await storage.getSubscriptionByTenant(tenantId);
      const subscriptionPayload = {
        planId: plan.id,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        status: 'pending_approval' as const,
        billingEmail: billingEmail ?? existingSubscription?.billingEmail ?? null,
        emailsUsedThisPeriod: existingSubscription?.emailsUsedThisPeriod ?? 0,
        smsUsedThisPeriod: existingSubscription?.smsUsedThisPeriod ?? 0,
        requestedBy: req.user.email || req.user.username || 'Unknown',
        requestedAt: now,
      };

      const updatedSubscription = existingSubscription
        ? await storage.updateSubscription(existingSubscription.id, {
            ...subscriptionPayload,
            updatedAt: new Date(),
          })
        : await storage.createSubscription({
            tenantId,
            ...subscriptionPayload,
          });

      res.json({
        ...updatedSubscription,
        planId: plan.slug,
        planName: plan.name,
        planPrice: plan.monthlyPriceCents / 100,
        setupFee: (plan.setupFeeCents ?? 10000) / 100,
        includedEmails: plan.includedEmails,
        includedSmsSegments: plan.includedSms,
        message: 'Subscription request submitted for admin approval',
      });
    } catch (error) {
      console.error("Error updating billing plan:", error);
      res.status(500).json({ message: "Failed to update billing plan" });
    }
  });

  app.get('/api/billing/invoices', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const invoices = await storage.getInvoicesByTenant(tenantId);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get('/api/billing/stats', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const stats = await storage.getBillingStats(tenantId);
      
      // Get tenant settings to determine business type for correct plan limits
      const tenantSettings = await storage.getTenantSettings(tenantId);
      const businessType = (tenantSettings?.businessType || 'call_center') as import('../shared/terminology').BusinessType;
      
      // Get business-type-specific plans
      const { getPlansForBusinessType, EMAIL_OVERAGE_RATE_PER_THOUSAND, SMS_OVERAGE_RATE_PER_SEGMENT } = await import('../shared/billing-plans');
      const businessTypePlans = getPlansForBusinessType(businessType);
      
      // Find the current plan based on planId (if exists)
      let currentPlan = stats.planId ? businessTypePlans[stats.planId as import('../shared/billing-plans').MessagingPlanId] : null;
      
      // If we have a current plan, recalculate usage with business-type-specific limits
      if (currentPlan && stats.billingPeriod) {
        const includedEmails = currentPlan.includedEmails;
        const includedSms = currentPlan.includedSmsSegments;
        
        const emailOverage = Math.max(0, stats.emailUsage.used - includedEmails);
        const smsOverage = Math.max(0, stats.smsUsage.used - includedSms);
        
        const emailOverageCharge = Number((emailOverage * (EMAIL_OVERAGE_RATE_PER_THOUSAND / 1000)).toFixed(2));
        const smsOverageCharge = Number((smsOverage * SMS_OVERAGE_RATE_PER_SEGMENT).toFixed(2));
        
        const usageCharges = Number((emailOverageCharge + smsOverageCharge).toFixed(2));
        const totalBill = Number((currentPlan.price + (stats.addonFees || 0) + usageCharges).toFixed(2));
        
        // Update stats with business-type-specific limits
        stats.emailUsage = {
          used: stats.emailUsage.used,
          included: includedEmails,
          overage: emailOverage,
          overageCharge: emailOverageCharge,
        };
        
        stats.smsUsage = {
          used: stats.smsUsage.used,
          included: includedSms,
          overage: smsOverage,
          overageCharge: smsOverageCharge,
        };
        
        stats.monthlyBase = currentPlan.price;
        stats.usageCharges = usageCharges;
        stats.totalBill = totalBill;
        stats.planName = currentPlan.name;
      } else {
        // À la carte billing - calculate based on enabled services
        const enabledAddons = tenantSettings?.enabledAddons || [];
        const aLaCarteBase = enabledAddons.length * 125;
        
        // For à la carte, no included email/SMS, so all usage is overage
        const emailOverageCharge = Number((stats.emailUsage.used * (EMAIL_OVERAGE_RATE_PER_THOUSAND / 1000)).toFixed(2));
        const smsOverageCharge = Number((stats.smsUsage.used * SMS_OVERAGE_RATE_PER_SEGMENT).toFixed(2));
        const usageCharges = Number((emailOverageCharge + smsOverageCharge).toFixed(2));
        
        stats.monthlyBase = aLaCarteBase;
        stats.usageCharges = usageCharges;
        stats.totalBill = Number((aLaCarteBase + (stats.addonFees || 0) + usageCharges).toFixed(2));
        
        // Update usage to show zero included
        stats.emailUsage = {
          used: stats.emailUsage.used,
          included: 0,
          overage: stats.emailUsage.used,
          overageCharge: emailOverageCharge,
        };
        
        stats.smsUsage = {
          used: stats.smsUsage.used,
          included: 0,
          overage: stats.smsUsage.used,
          overageCharge: smsOverageCharge,
        };
      }
      
      // Enhanced logging for SMS usage debugging
      console.log(`📊 Billing Stats for tenant ${tenantId} (${businessType}):`, JSON.stringify({
        emailUsage: stats.emailUsage,
        smsUsage: stats.smsUsage,
        billingPeriod: stats.billingPeriod,
        planId: stats.planId,
        planName: stats.planName
      }, null, 2));
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching billing stats:", error);
      res.status(500).json({ message: "Failed to fetch billing stats" });
    }
  });

  app.get('/api/billing/current-invoice', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const currentInvoice = await storage.getCurrentInvoice(tenantId);
      res.json(currentInvoice);
    } catch (error) {
      console.error("Error fetching current invoice:", error);
      res.status(500).json({ message: "Failed to fetch current invoice" });
    }
  });

  // Mark invoice as paid (admin only)
  app.post('/api/billing/invoices/:invoiceId/mark-paid', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const { invoiceId } = req.params;

      // Verify invoice belongs to this tenant
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      if (invoice.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Mark as paid
      const [updatedInvoice] = await db.update(invoices)
        .set({ status: 'paid', paidAt: new Date() })
        .where(eq(invoices.id, invoiceId))
        .returning();

      res.json(updatedInvoice);
    } catch (error) {
      console.error("Error marking invoice as paid:", error);
      res.status(500).json({ message: "Failed to mark invoice as paid" });
    }
  });

  // Process subscription renewals (called by cron job)
  app.post('/api/billing/process-renewals', async (req, res) => {
    try {
      console.log('🔄 Processing subscription renewals...');
      const now = new Date();
      let renewedCount = 0;
      let invoicesCreated = 0;
      
      // Get all active subscriptions
      const allSubscriptions = await db.select().from(subscriptions).where(eq(subscriptions.status, 'active'));
      
      for (const subscription of allSubscriptions) {
        const periodEnd = new Date(subscription.currentPeriodEnd);
        
        // Check if period has ended
        if (periodEnd <= now) {
          console.log(`📅 Renewing subscription for tenant ${subscription.tenantId}`);
          
          // Calculate next period (30 days)
          const newPeriodStart = new Date(periodEnd);
          newPeriodStart.setHours(0, 0, 0, 0);
          const newPeriodEnd = new Date(newPeriodStart);
          newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);
          newPeriodEnd.setHours(23, 59, 59, 999);
          
          // Get usage data for the completed period
          const stats = await storage.getBillingStats(subscription.tenantId);
          
          // Create invoice for the completed period (with idempotency check)
          if (stats) {
            try {
              // Check if invoice already exists for this period
              const existingInvoice = await db.select()
                .from(invoices)
                .where(
                  and(
                    eq(invoices.subscriptionId, subscription.id),
                    eq(invoices.periodStart, subscription.currentPeriodStart),
                    eq(invoices.periodEnd, subscription.currentPeriodEnd)
                  )
                )
                .limit(1);
              
              if (existingInvoice.length > 0) {
                console.log(`⏭️  Invoice already exists for tenant ${subscription.tenantId} (${existingInvoice[0].invoiceNumber}) - skipping creation`);
              } else {
                const invoiceNumber = `INV-${subscription.tenantId.substring(0, 8)}-${Date.now()}`;
                const [invoice] = await db.insert(invoices).values({
                  tenantId: subscription.tenantId,
                  subscriptionId: subscription.id,
                  invoiceNumber,
                  periodStart: subscription.currentPeriodStart,
                  periodEnd: subscription.currentPeriodEnd,
                  status: 'pending',
                  baseAmountCents: Math.round((stats.monthlyBase + stats.addonFees) * 100),
                  perConsumerCents: 0,
                  consumerCount: stats.activeConsumers,
                  totalAmountCents: Math.round(stats.totalBill * 100),
                  dueDate: newPeriodEnd,
                  paidAt: null,
                }).returning();
                invoicesCreated++;
                console.log(`✅ Invoice created for tenant ${subscription.tenantId}: $${stats.totalBill} (${invoiceNumber})`);
                
                // Send invoice email to company
                try {
                  const tenant = await storage.getTenant(subscription.tenantId);
                  if (tenant?.email) {
                    const periodStartStr = new Date(subscription.currentPeriodStart).toLocaleDateString();
                    const periodEndStr = new Date(subscription.currentPeriodEnd).toLocaleDateString();
                    const dueDate = newPeriodEnd.toLocaleDateString();
                    
                    const emailHtml = `
                      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Monthly Invoice</h2>
                        <p>Dear ${tenant.name},</p>
                        <p>Your monthly invoice for Chain platform services is now available.</p>
                        
                        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                          <h3 style="margin-top: 0;">Invoice #${invoiceNumber}</h3>
                          <p><strong>Billing Period:</strong> ${periodStartStr} - ${periodEndStr}</p>
                          <p><strong>Due Date:</strong> ${dueDate}</p>
                          <hr style="border: 0; border-top: 1px solid #ddd; margin: 15px 0;">
                          <p><strong>Monthly Base Fee:</strong> $${stats.monthlyBase.toFixed(2)}</p>
                          ${stats.addonFees > 0 ? `<p><strong>Add-on Fees:</strong> $${stats.addonFees.toFixed(2)}</p>` : ''}
                          ${stats.addons.documentSigning ? `<p style="margin-left: 20px;">• Document Signing: $${stats.addons.documentSigningFee.toFixed(2)}</p>` : ''}
                          ${stats.usageCharges > 0 ? `<p><strong>Usage Overage Charges:</strong> $${stats.usageCharges.toFixed(2)}</p>` : ''}
                          ${stats.emailUsage.overage > 0 ? `<p style="margin-left: 20px;">• Email Overage: ${stats.emailUsage.overage} emails @ $${stats.emailUsage.overageCharge.toFixed(2)}</p>` : ''}
                          ${stats.smsUsage.overage > 0 ? `<p style="margin-left: 20px;">• SMS Overage: ${stats.smsUsage.overage} segments @ $${stats.smsUsage.overageCharge.toFixed(2)}</p>` : ''}
                          <hr style="border: 0; border-top: 2px solid #333; margin: 15px 0;">
                          <p style="font-size: 18px;"><strong>Total Due:</strong> $${stats.totalBill.toFixed(2)}</p>
                        </div>
                        
                        <p>This invoice is available in your billing dashboard. Log in to view details and payment history.</p>
                        <p>Thank you for using Chain!</p>
                      </div>
                    `;
                    
                    await emailService.sendEmail({
                      to: tenant.email,
                      subject: `Chain Invoice ${invoiceNumber} - $${stats.totalBill.toFixed(2)} Due ${dueDate}`,
                      html: emailHtml,
                      tenantId: subscription.tenantId,
                    });
                    console.log(`📧 Invoice email sent to ${tenant.email}`);
                  }
                } catch (emailError) {
                  console.error(`❌ Failed to send invoice email for tenant ${subscription.tenantId}:`, emailError);
                }
              }
            } catch (invoiceError) {
              console.error(`❌ Failed to create invoice for tenant ${subscription.tenantId}:`, invoiceError);
            }
          }
          
          // Update subscription to next period and reset usage
          await db.update(subscriptions)
            .set({
              currentPeriodStart: newPeriodStart,
              currentPeriodEnd: newPeriodEnd,
              emailsUsedThisPeriod: 0,
              smsUsedThisPeriod: 0,
            })
            .where(eq(subscriptions.id, subscription.id));
          
          renewedCount++;
          console.log(`✅ Subscription renewed for tenant ${subscription.tenantId}: ${newPeriodStart.toLocaleDateString()} - ${newPeriodEnd.toLocaleDateString()}`);
        }
      }
      
      const message = `Subscription renewal complete: ${renewedCount} subscriptions renewed, ${invoicesCreated} invoices created`;
      console.log(`✅ ${message}`);
      
      res.json({
        success: true,
        message,
        renewedCount,
        invoicesCreated,
      });
    } catch (error) {
      console.error('❌ Subscription renewal processing failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process subscription renewals',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Generate monthly invoices and send to all active tenants (called by monthly cron)
  app.post('/api/billing/generate-monthly-invoices', async (req, res) => {
    try {
      console.log('📊 Generating monthly invoices for all active tenants...');
      let invoicesSent = 0;
      let errors = 0;
      let skipped = 0;
      
      // Get all active subscriptions
      const allSubscriptions = await db.select().from(subscriptions).where(eq(subscriptions.status, 'active'));
      
      for (const subscription of allSubscriptions) {
        try {
          // Check if invoice already exists for this billing period (idempotency)
          const existingInvoice = await db.select()
            .from(invoices)
            .where(
              and(
                eq(invoices.subscriptionId, subscription.id),
                eq(invoices.periodStart, subscription.currentPeriodStart),
                eq(invoices.periodEnd, subscription.currentPeriodEnd)
              )
            )
            .limit(1);
          
          if (existingInvoice.length > 0) {
            console.log(`⏭️  Invoice already exists for tenant ${subscription.tenantId} (period ${new Date(subscription.currentPeriodStart).toLocaleDateString()} - ${new Date(subscription.currentPeriodEnd).toLocaleDateString()})`);
            skipped++;
            continue;
          }
          
          // Get billing stats for this tenant
          const stats = await storage.getBillingStats(subscription.tenantId);
          const tenant = await storage.getTenant(subscription.tenantId);
          
          if (!tenant?.email) {
            console.log(`⚠️ Skipping tenant ${subscription.tenantId} - no email address`);
            skipped++;
            continue;
          }
          
          // Create invoice record
          const invoiceNumber = `INV-${subscription.tenantId.substring(0, 8)}-${Date.now()}`;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 15); // Due in 15 days
          
          const [invoice] = await db.insert(invoices).values({
            tenantId: subscription.tenantId,
            subscriptionId: subscription.id,
            invoiceNumber,
            periodStart: subscription.currentPeriodStart,
            periodEnd: subscription.currentPeriodEnd,
            status: 'pending',
            baseAmountCents: Math.round((stats.monthlyBase + stats.addonFees) * 100),
            perConsumerCents: 0,
            consumerCount: stats.activeConsumers,
            totalAmountCents: Math.round(stats.totalBill * 100),
            dueDate,
            paidAt: null,
          }).returning();
          
          // Send invoice email
          const periodStartStr = new Date(subscription.currentPeriodStart).toLocaleDateString();
          const periodEndStr = new Date(subscription.currentPeriodEnd).toLocaleDateString();
          const dueDateStr = dueDate.toLocaleDateString();
          
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1e40af;">Monthly Invoice</h2>
              <p>Dear ${tenant.name},</p>
              <p>Your monthly invoice for Chain platform services is now available.</p>
              
              <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #1e40af;">Invoice #${invoiceNumber}</h3>
                <p><strong>Billing Period:</strong> ${periodStartStr} - ${periodEndStr}</p>
                <p><strong>Due Date:</strong> ${dueDateStr}</p>
                <hr style="border: 0; border-top: 1px solid #ddd; margin: 15px 0;">
                <p><strong>Monthly Base Fee:</strong> $${stats.monthlyBase.toFixed(2)}</p>
                ${stats.addonFees > 0 ? `
                  <p><strong>Add-on Fees:</strong> $${stats.addonFees.toFixed(2)}</p>
                  ${stats.addons.documentSigning ? `<p style="margin-left: 20px; color: #666;">• Document Signing: $${stats.addons.documentSigningFee.toFixed(2)}</p>` : ''}
                  ${stats.addons.aiAutoResponse ? `<p style="margin-left: 20px; color: #666;">• AI Auto-Response: $${stats.addons.aiAutoResponseFee.toFixed(2)}</p>` : ''}
                ` : ''}
                ${stats.usageCharges > 0 ? `
                  <p><strong>Usage Overage Charges:</strong> $${stats.usageCharges.toFixed(2)}</p>
                  ${stats.emailUsage.overage > 0 ? `<p style="margin-left: 20px; color: #666;">• Email Overage: ${stats.emailUsage.overage} emails - $${stats.emailUsage.overageCharge.toFixed(2)}</p>` : ''}
                  ${stats.smsUsage.overage > 0 ? `<p style="margin-left: 20px; color: #666;">• SMS Overage: ${stats.smsUsage.overage} segments - $${stats.smsUsage.overageCharge.toFixed(2)}</p>` : ''}
                  ${stats.aiAutoResponseUsage.overage > 0 ? `<p style="margin-left: 20px; color: #666;">• AI Response Overage: ${stats.aiAutoResponseUsage.overage} responses - $${stats.aiAutoResponseUsage.overageCharge.toFixed(2)}</p>` : ''}
                ` : ''}
                <hr style="border: 0; border-top: 2px solid #333; margin: 15px 0;">
                <p style="font-size: 18px;"><strong>Total Due:</strong> $${stats.totalBill.toFixed(2)}</p>
              </div>
              
              <p>This invoice is available in your billing dashboard. Log in to view details and payment history.</p>
              <p style="color: #666; font-size: 12px; margin-top: 30px;">Thank you for using Chain!</p>
            </div>
          `;
          
          await emailService.sendEmail({
            to: tenant.email,
            subject: `Chain Invoice ${invoiceNumber} - $${stats.totalBill.toFixed(2)} Due ${dueDateStr}`,
            html: emailHtml,
            tenantId: subscription.tenantId,
          });
          
          invoicesSent++;
          console.log(`✅ Invoice sent to ${tenant.name} (${tenant.email}): $${stats.totalBill.toFixed(2)}`);
        } catch (error) {
          errors++;
          console.error(`❌ Failed to generate invoice for tenant ${subscription.tenantId}:`, error);
        }
      }
      
      const message = `Monthly invoice generation complete: ${invoicesSent} invoices sent, ${skipped} skipped (already exist), ${errors} errors`;
      console.log(`✅ ${message}`);
      
      res.json({
        success: true,
        message,
        invoicesSent,
        skipped,
        errors,
      });
    } catch (error) {
      console.error('❌ Monthly invoice generation failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate monthly invoices',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Request à la carte service activation (creates pending request for global admin approval)
  app.post('/api/billing/activate-service', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userEmail = req.user.email;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { serviceType } = req.body;

      // Validate service type
      const validServices = ['portal_processing', 'email_service', 'sms_service'];
      if (!validServices.includes(serviceType)) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid service type. Must be one of: portal_processing, email_service, sms_service" 
        });
      }

      // Get current tenant settings (create default if missing)
      let settings = await storage.getTenantSettings(tenantId);
      if (!settings) {
        // Create default settings if they don't exist
        settings = await storage.upsertTenantSettings({
          tenantId,
          showPaymentPlans: true,
          showDocuments: true,
          allowSettlementRequests: true,
          smsThrottleLimit: 10,
          customBranding: {},
          consumerPortalSettings: {},
        });
      }

      // Check if service is already enabled
      const currentAddons = settings.enabledAddons || [];
      if (currentAddons.includes(serviceType)) {
        return res.json({ 
          success: true, 
          message: "Service is already activated",
          alreadyEnabled: true
        });
      }

      // Check if there's already a pending request for this service
      const existingRequest = await db.select()
        .from(serviceActivationRequests)
        .where(
          and(
            eq(serviceActivationRequests.tenantId, tenantId),
            eq(serviceActivationRequests.serviceType, serviceType),
            eq(serviceActivationRequests.status, 'pending')
          )
        )
        .limit(1);

      if (existingRequest.length > 0) {
        return res.json({ 
          success: true, 
          message: "A request for this service is already pending approval",
          isPending: true,
          requestId: existingRequest[0].id
        });
      }

      // Create a new service activation request
      const [newRequest] = await db.insert(serviceActivationRequests)
        .values({
          tenantId,
          serviceType,
          status: 'pending',
          requestedBy: userEmail,
        })
        .returning();

      console.log(`📝 Service activation request created for tenant ${tenantId}: ${serviceType} (by ${userEmail})`);

      res.json({ 
        success: true, 
        message: "Service activation request submitted. A platform administrator will review your request shortly.",
        isPending: true,
        requestId: newRequest.id
      });

    } catch (error: any) {
      console.error("❌ Service activation request error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to submit service activation request. Please try again.",
        error: error.message
      });
    }
  });

  // ============================================
  // Platform-Level Payment Processing (Chain's Own Authorize.net)
  // This is separate from tenant consumer payment processing
  // Uses CHAIN_AUTHNET_API_LOGIN_ID and CHAIN_AUTHNET_TRANSACTION_KEY
  // ============================================
  
  app.post('/api/billing/platform-payment', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      // Get Chain's platform Authorize.net credentials from environment variables
      const chainApiLoginId = process.env.CHAIN_AUTHNET_API_LOGIN_ID;
      const chainTransactionKey = process.env.CHAIN_AUTHNET_TRANSACTION_KEY;
      const chainUseSandbox = process.env.CHAIN_AUTHNET_SANDBOX !== 'false'; // Default to sandbox

      if (!chainApiLoginId || !chainTransactionKey) {
        console.log('⚠️ Platform payment credentials not configured');
        return res.status(503).json({
          success: false,
          message: "Payment processing is not yet configured. Please contact Chain Software Group at (716) 534-3086.",
        });
      }

      const {
        paymentMethod,
        amount,
        // Card fields
        cardholderName,
        cardNumber,
        expiryMonth,
        expiryYear,
        cvv,
        billingAddress,
        billingCity,
        billingState,
        billingZip,
        // ACH fields
        accountHolderName,
        routingNumber,
        accountNumber,
        // Invoice reference
        invoiceId,
      } = req.body;

      // Validate payment amount
      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid payment amount" });
      }

      // Get tenant info for logging
      const tenant = await storage.getTenant(tenantId);
      const tenantName = tenant?.name || 'Unknown';

      console.log(`💳 Platform payment request from ${tenantName}:`, {
        paymentMethod,
        amount,
        invoiceId: invoiceId || 'none',
      });

      const authnetService = new AuthnetService({
        apiLoginId: chainApiLoginId,
        transactionKey: chainTransactionKey,
        useSandbox: chainUseSandbox,
      });

      let paymentResult;

      if (paymentMethod === 'card') {
        // Validate card fields
        if (!cardholderName || !cardNumber || !expiryMonth || !expiryYear || !cvv) {
          return res.status(400).json({ success: false, message: "Missing required card information" });
        }

        // Format expiration date (MMYY)
        const expirationDate = `${expiryMonth.padStart(2, '0')}${expiryYear.padStart(2, '0')}`;
        
        // Remove spaces from card number
        const cleanCardNumber = cardNumber.replace(/\s/g, '');

        // Process card payment directly
        paymentResult = await authnetService.processPayment({
          amount: amount,
          cardNumber: cleanCardNumber,
          expirationDate: expirationDate,
          cvv: cvv,
          cardholderName: cardholderName,
          billingAddress: {
            firstName: cardholderName.split(' ')[0] || '',
            lastName: cardholderName.split(' ').slice(1).join(' ') || '',
            address: billingAddress || '',
            city: billingCity || '',
            state: billingState || '',
            zip: billingZip || '',
          },
          invoice: invoiceId || undefined,
          description: `Chain Software Group - Subscription Payment for ${tenantName}`,
        });
      } else if (paymentMethod === 'ach') {
        // ACH payments require a different API approach
        // For now, return that ACH is coming soon
        return res.status(400).json({
          success: false,
          message: "ACH payments are coming soon. Please use a credit or debit card, or contact us at (716) 534-3086.",
        });
      } else {
        return res.status(400).json({ success: false, message: "Invalid payment method" });
      }

      if (paymentResult.success) {
        console.log(`✅ Platform payment successful for ${tenantName}:`, {
          transactionId: paymentResult.transactionId,
          amount: amount,
          cardLast4: paymentResult.cardLast4,
        });

        // If invoiceId was provided, mark it as paid
        if (invoiceId) {
          try {
            await db.update(invoices)
              .set({
                status: 'paid',
                paidAt: new Date(),
                paidAmountCents: Math.round(amount * 100),
                paymentReference: paymentResult.transactionId,
              })
              .where(eq(invoices.id, invoiceId));
            console.log(`📄 Invoice ${invoiceId} marked as paid`);
          } catch (invErr) {
            console.error('⚠️ Could not update invoice status:', invErr);
          }
        }

        return res.json({
          success: true,
          message: "Payment processed successfully! Thank you.",
          transactionId: paymentResult.transactionId,
          authCode: paymentResult.authCode,
          cardLast4: paymentResult.cardLast4,
        });
      } else {
        console.error(`❌ Platform payment failed for ${tenantName}:`, paymentResult.errorMessage);
        return res.status(400).json({
          success: false,
          message: paymentResult.errorMessage || "Payment could not be processed. Please verify your payment information and try again.",
        });
      }
    } catch (error: any) {
      console.error("❌ Platform payment error:", error);
      return res.status(500).json({
        success: false,
        message: "Payment processing error. Please try again or contact support.",
        error: error.message,
      });
    }
  });

  // Global Admin Routes (Platform Owner Only)
  
  // Seed subscription plans endpoint (no auth required - safe to call multiple times)
  // Support both GET and POST for easy browser access
  app.get('/api/admin/seed-plans', async (req, res) => {
    try {
      const { seedSubscriptionPlans } = await import('./seed-subscription-plans');
      await seedSubscriptionPlans();
      res.json({ success: true, message: 'Subscription plans seeded successfully' });
    } catch (error) {
      console.error('Error seeding plans:', error);
      res.status(500).json({ success: false, message: 'Failed to seed subscription plans' });
    }
  });
  
  app.post('/api/admin/seed-plans', async (req, res) => {
    try {
      const { seedSubscriptionPlans } = await import('./seed-subscription-plans');
      await seedSubscriptionPlans();
      res.json({ success: true, message: 'Subscription plans seeded successfully' });
    } catch (error) {
      console.error('Error seeding plans:', error);
      res.status(500).json({ success: false, message: 'Failed to seed subscription plans' });
    }
  });
  
  // Admin login endpoint (simple password-based)
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      // Hardcoded admin credentials (same as frontend)
      if (username === 'ChainAdmin' && password === 'W@yp0intsolutions') {
        if (!process.env.JWT_SECRET) {
          return res.status(500).json({ message: "Server configuration error" });
        }
        
        // Create admin token
        const adminToken = jwt.sign(
          {
            isAdmin: true,
            type: 'global_admin'
          },
          process.env.JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        res.json({ 
          success: true,
          token: adminToken,
          message: "Admin authenticated successfully"
        });
      } else {
        res.status(401).json({ 
          success: false,
          message: "Invalid credentials" 
        });
      }
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ message: "Login failed" });
    }
  });
  
  const isPlatformAdmin = async (req: any, res: any, next: any) => {
    // Check for admin token first
    const authHeader = req.headers.authorization;
    console.log('🔐 isPlatformAdmin middleware - Auth header:', authHeader ? `Bearer ${authHeader.slice(7, 20)}...` : 'NO AUTH HEADER');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
        console.log('✅ Token decoded:', decoded);
        if (decoded.isAdmin && decoded.type === 'global_admin') {
          req.user = { isGlobalAdmin: true };
          return next();
        }
      } catch (error) {
        console.log('❌ Token verification failed:', error);
        // Token invalid, fall through to normal auth check
      }
    }
    
    const userId = req.user?.id ?? req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user has platform_admin role (they might have multiple roles)
    const userRoles = await db.select().from(platformUsers).where(eq(platformUsers.authId, userId));
    const hasPlatformAdminRole = userRoles.some((user: any) => user.role === 'platform_admin');

    if (!hasPlatformAdminRole) {
      return res.status(403).json({ message: "Platform admin access required" });
    }
    
    next();
  };

  // Impersonate tenant (Global Admin only) - generates a JWT token to log in as any tenant
  app.post('/api/admin/impersonate-tenant/:tenantId', isPlatformAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      
      // Get tenant info
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ success: false, message: "Tenant not found" });
      }
      
      // Get or create an agency credential for this tenant to use as the user
      const [credential] = await db.select()
        .from(agencyCredentials)
        .where(eq(agencyCredentials.tenantId, tenantId))
        .limit(1);
      
      // Generate a JWT token for impersonation
      const impersonationToken = jwt.sign(
        {
          userId: credential?.id || `admin-impersonate-${tenantId}`,
          tenantId: tenantId,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          isImpersonation: true, // Mark this as an impersonation session
          role: 'owner', // Give full access
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '4h' } // Shorter expiry for impersonation sessions
      );
      
      console.log(`🔐 Global Admin impersonating tenant: ${tenant.name} (${tenant.slug})`);
      
      res.json({
        success: true,
        token: impersonationToken,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        message: `Now logged in as ${tenant.name}`,
      });
    } catch (error: any) {
      console.error('Impersonation error:', error);
      res.status(500).json({ success: false, message: "Failed to impersonate tenant" });
    }
  });

  // Update tenant SMS configuration (platform admin only)
  app.put('/api/admin/tenants/:id/sms-config', isPlatformAdmin, async (req: any, res) => {
    try {
      const { 
        twilioAccountSid, 
        twilioAuthToken, 
        twilioPhoneNumber, 
        twilioBusinessName, 
        twilioCampaignId 
      } = req.body;
      
      // Update tenant Twilio settings
      await storage.updateTenantTwilioSettings(req.params.id, {
        twilioAccountSid: twilioAccountSid || null,
        twilioAuthToken: twilioAuthToken || null,
        twilioPhoneNumber: twilioPhoneNumber || null,
        twilioBusinessName: twilioBusinessName || null,
        twilioCampaignId: twilioCampaignId || null,
      });
      
      res.json({ message: "SMS configuration updated successfully" });
    } catch (error) {
      console.error('Error updating SMS configuration:', error);
      res.status(500).json({ message: "Failed to update SMS configuration" });
    }
  });

  // Get service activation requests (global admin sees all, tenant users see their own)
  app.get('/api/service-activation-requests', authenticateUser, async (req: any, res) => {
    try {
      const isAdmin = req.user.isGlobalAdmin || req.user.role === 'platform_admin';
      const tenantId = req.user.tenantId;
      
      let query = db.select({
        request: serviceActivationRequests,
        tenant: tenants,
      })
      .from(serviceActivationRequests)
      .leftJoin(tenants, eq(serviceActivationRequests.tenantId, tenants.id));
      
      // Filter by tenant if not admin
      if (!isAdmin && tenantId) {
        query = query.where(eq(serviceActivationRequests.tenantId, tenantId)) as any;
      }
      
      // Filter by status if provided
      const { status } = req.query;
      if (status && typeof status === 'string') {
        query = query.where(eq(serviceActivationRequests.status, status)) as any;
      }
      
      const results = await query.orderBy(desc(serviceActivationRequests.requestedAt));
      
      res.json({
        success: true,
        requests: results.map(r => ({
          ...r.request,
          tenantName: r.tenant?.name,
          tenantSlug: r.tenant?.slug,
        }))
      });
    } catch (error: any) {
      console.error('Error fetching service activation requests:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch service activation requests' });
    }
  });

  // Approve or reject a service activation request (global admin only)
  app.post('/api/admin/service-activation-requests/:id/review', isPlatformAdmin, async (req: any, res) => {
    try {
      const requestId = req.params.id;
      const { action, rejectionReason } = req.body; // action: 'approve' or 'reject'
      const adminEmail = req.user.email || 'admin';
      
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Invalid action. Must be "approve" or "reject"' });
      }
      
      // Get the request
      const [request] = await db.select()
        .from(serviceActivationRequests)
        .where(eq(serviceActivationRequests.id, requestId))
        .limit(1);
      
      if (!request) {
        return res.status(404).json({ success: false, message: 'Service activation request not found' });
      }
      
      if (request.status !== 'pending') {
        return res.status(400).json({ success: false, message: `Request has already been ${request.status}` });
      }
      
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      
      // Update request status
      await db.update(serviceActivationRequests)
        .set({
          status: newStatus,
          approvedBy: adminEmail,
          approvedAt: new Date(),
          rejectionReason: action === 'reject' ? rejectionReason : null,
        })
        .where(eq(serviceActivationRequests.id, requestId));
      
      // If approved, activate the service
      if (action === 'approve') {
        const settings = await storage.getTenantSettings(request.tenantId);
        if (settings) {
          const currentAddons = settings.enabledAddons || [];
          if (!currentAddons.includes(request.serviceType)) {
            const updatedAddons = [...currentAddons, request.serviceType];
            
            // Prepare updates for tenant settings
            const updates: any = { enabledAddons: updatedAddons };
            
            // Map service types to their corresponding service flags
            const serviceFlagMap: Record<string, string> = {
              'portal_processing': 'both', // Special case: activates both portal and processing
              'email_service': 'emailServiceEnabled',
              'sms_service': 'smsServiceEnabled',
            };
            
            const flagToUpdate = serviceFlagMap[request.serviceType];
            if (flagToUpdate === 'both') {
              updates.portalAccessEnabled = true;
              updates.paymentProcessingEnabled = true;
            } else if (flagToUpdate) {
              updates[flagToUpdate] = true;
            }
            
            await db.update(tenantSettings)
              .set(updates)
              .where(eq(tenantSettings.tenantId, request.tenantId));
            
            // Take tenant out of trial mode
            await db.update(tenants)
              .set({ 
                isTrialAccount: false,
                isPaidAccount: true
              })
              .where(eq(tenants.id, request.tenantId));
            
            console.log(`✅ Service activated for tenant ${request.tenantId}: ${request.serviceType} (approved by ${adminEmail})`);
            console.log(`✅ Tenant ${request.tenantId} moved out of trial mode`);
          }
        }
      }
      
      console.log(`📝 Service activation request ${newStatus} for tenant ${request.tenantId}: ${request.serviceType} (by ${adminEmail})`);
      
      res.json({
        success: true,
        message: `Service request ${newStatus} successfully`,
        status: newStatus
      });
    } catch (error: any) {
      console.error('Error reviewing service activation request:', error);
      res.status(500).json({ success: false, message: 'Failed to review service activation request' });
    }
  });

  // Fix services for subscribed tenants (auto-enable all services if they have active subscription)
  app.post('/api/admin/tenants/:id/fix-services', isPlatformAdmin, async (req: any, res) => {
    try {
      const tenantId = req.params.id;

      // Check if tenant has active subscription
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.tenantId, tenantId),
            eq(subscriptions.status, 'active')
          )
        )
        .limit(1);

      if (subscription) {
        // Enable CORE services for subscribed tenant (not add-ons)
        await db
          .update(tenants)
          .set({
            isTrialAccount: false,
            isPaidAccount: true,
            emailServiceEnabled: true,
            smsServiceEnabled: true,
            paymentProcessingEnabled: true,
            portalAccessEnabled: true,
          })
          .where(eq(tenants.id, tenantId));

        res.json({ 
          message: 'Core services enabled for subscribed tenant (add-ons require separate activation)',
          servicesEnabled: true
        });
      } else {
        res.status(400).json({ message: 'Tenant has no active subscription' });
      }
    } catch (error) {
      console.error("Error fixing tenant services:", error);
      res.status(500).json({ message: "Failed to fix services" });
    }
  });

  // BULK fix services for ALL subscribed tenants at once
  app.post('/api/admin/bulk-fix-services', isPlatformAdmin, async (req: any, res) => {
    try {
      // Get all active subscriptions
      const activeSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.status, 'active'));

      if (activeSubscriptions.length === 0) {
        return res.json({
          message: 'No active subscriptions found',
          fixed: 0,
          tenants: []
        });
      }

      const fixedTenants = [];
      
      // Enable CORE services for each tenant with active subscription (not add-ons)
      for (const subscription of activeSubscriptions) {
        await db
          .update(tenants)
          .set({
            isTrialAccount: false,
            isPaidAccount: true,
            emailServiceEnabled: true,
            smsServiceEnabled: true,
            paymentProcessingEnabled: true,
            portalAccessEnabled: true,
          })
          .where(eq(tenants.id, subscription.tenantId));

        // Get tenant name for response
        const [tenant] = await db
          .select({ name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, subscription.tenantId))
          .limit(1);

        fixedTenants.push(tenant?.name || subscription.tenantId);
      }

      console.log(`✅ Bulk fixed CORE services for ${fixedTenants.length} subscribed tenants`);

      res.json({
        message: `Successfully enabled core services for ${fixedTenants.length} subscribed tenant(s). Add-ons require separate activation.`,
        fixed: fixedTenants.length,
        tenants: fixedTenants
      });
    } catch (error) {
      console.error("Error bulk fixing tenant services:", error);
      res.status(500).json({ message: "Failed to bulk fix services" });
    }
  });

  // Direct admin control: Update tenant services and trial status
  app.post('/api/admin/tenants/:id/services', isPlatformAdmin, async (req: any, res) => {
    try {
      const tenantId = req.params.id;
      const { isTrialAccount, enabledServices } = req.body; // enabledServices: ['portal_processing', 'email_service', 'sms_service']
      
      // Update trial status in tenants table
      await db.update(tenants)
        .set({ 
          isTrialAccount: isTrialAccount,
          isPaidAccount: !isTrialAccount,
          emailServiceEnabled: enabledServices.includes('email_service'),
          smsServiceEnabled: enabledServices.includes('sms_service'),
          portalAccessEnabled: enabledServices.includes('portal_processing'),
          paymentProcessingEnabled: enabledServices.includes('portal_processing'),
        })
        .where(eq(tenants.id, tenantId));
      
      // Update enabled addons in tenant settings
      await db.update(tenantSettings)
        .set({ enabledAddons: enabledServices })
        .where(eq(tenantSettings.tenantId, tenantId));
      
      console.log(`✅ Admin updated tenant ${tenantId} services: ${enabledServices.join(', ')} | Trial: ${isTrialAccount}`);
      
      res.json({
        success: true,
        message: 'Tenant services updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating tenant services:', error);
      res.status(500).json({ success: false, message: 'Failed to update tenant services' });
    }
  });

  // Get all tenants for platform admin overview
  app.get('/api/admin/tenants', isPlatformAdmin, async (req: any, res) => {
    try {
      const tenants = await storage.getAllTenants();
      
      // Get additional stats for each tenant
      const tenantsWithStats = await Promise.all(
        tenants.map(async (tenant) => {
          const consumerCount = await storage.getConsumerCountByTenant(tenant.id);
          const accountCount = await storage.getAccountCountByTenant(tenant.id);
          const totalBalance = await storage.getTotalBalanceByTenant(tenant.id);
          const emailCount = await storage.getEmailCountByTenant(tenant.id);
          const smsCount = await storage.getSmsCountByTenant(tenant.id);
          
          // Get tenant settings to include enabled addons
          const settings = await storage.getTenantSettings(tenant.id);
          
          // Get active subscription for billing dates
          const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(and(
              eq(subscriptions.tenantId, tenant.id),
              eq(subscriptions.status, 'active')
            ))
            .limit(1);
          
          return {
            ...tenant,
            enabledAddons: settings?.enabledAddons || [],
            currentPeriodStart: subscription?.currentPeriodStart,
            currentPeriodEnd: subscription?.currentPeriodEnd,
            subscriptionId: subscription?.id,
            planId: subscription?.planId,
            stats: {
              consumerCount,
              accountCount,
              totalBalanceCents: totalBalance,
              emailCount,
              smsCount,
            }
          };
        })
      );
      
      res.json(tenantsWithStats);
    } catch (error) {
      console.error("Error fetching tenants:", error);
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  // Get platform-wide statistics
  app.get('/api/admin/stats', isPlatformAdmin, async (req: any, res) => {
    try {
      const stats = await storage.getPlatformStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching platform stats:", error);
      res.status(500).json({ message: "Failed to fetch platform stats" });
    }
  });

  // Get all invoices across all tenants (global admin)
  app.get('/api/admin/invoices', isPlatformAdmin, async (req: any, res) => {
    try {
      const { status, tenantId, limit } = req.query;
      
      let query = db.select({
        invoice: invoices,
        tenant: tenants,
        subscription: subscriptions,
      })
      .from(invoices)
      .leftJoin(tenants, eq(invoices.tenantId, tenants.id))
      .leftJoin(subscriptions, eq(invoices.subscriptionId, subscriptions.id))
      .orderBy(desc(invoices.createdAt));
      
      // Filter by status if provided
      if (status && typeof status === 'string') {
        query = query.where(eq(invoices.status, status)) as any;
      }
      
      // Filter by tenantId if provided
      if (tenantId && typeof tenantId === 'string') {
        query = query.where(eq(invoices.tenantId, tenantId)) as any;
      }
      
      // Limit results if provided
      if (limit && typeof limit === 'string') {
        const limitNum = parseInt(limit, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          query = query.limit(limitNum) as any;
        }
      }
      
      const results = await query;
      
      const invoicesWithDetails = results.map(row => ({
        ...row.invoice,
        tenantName: row.tenant?.name,
        tenantSlug: row.tenant?.slug,
        tenantEmail: row.tenant?.email,
        planId: row.subscription?.planId,
      }));
      
      res.json(invoicesWithDetails);
    } catch (error) {
      console.error("Error fetching all invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Mark invoice as paid (global admin)
  app.put('/api/admin/invoices/:id/mark-paid', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      
      // Validate notes length
      if (notes && typeof notes === 'string' && notes.length > 500) {
        return res.status(400).json({ message: "Payment notes must be 500 characters or less" });
      }
      
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      // Check if invoice is already paid
      if (invoice.status === 'paid') {
        return res.status(400).json({ message: "Invoice is already marked as paid" });
      }
      
      // Update invoice to paid status
      const [updatedInvoice] = await db
        .update(invoices)
        .set({
          status: 'paid',
          paidAt: new Date(),
        })
        .where(eq(invoices.id, id))
        .returning();
      
      console.log(`✅ Invoice ${invoice.invoiceNumber} marked as paid by global admin`, notes ? `Notes: ${notes.substring(0, 100)}` : '');
      
      res.json({
        ...updatedInvoice,
        message: 'Invoice marked as paid successfully'
      });
    } catch (error) {
      console.error("Error marking invoice as paid:", error);
      res.status(500).json({ message: "Failed to mark invoice as paid" });
    }
  });

  // Update subscription billing dates (global admin)
  app.put('/api/admin/tenants/:tenantId/billing-dates', isPlatformAdmin, async (req: any, res) => {
    console.log('📅 Billing dates endpoint hit - user:', req.user);
    try {
      const { tenantId } = req.params;
      const { periodStart, periodEnd } = req.body;
      
      // Validate required fields
      if (!periodStart || !periodEnd) {
        return res.status(400).json({ message: "Both period start and end dates are required" });
      }
      
      // Validate date formats and parse
      let startDate: Date;
      let endDate: Date;
      
      try {
        startDate = new Date(periodStart);
        endDate = new Date(periodEnd);
        
        // Validate dates are valid
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format. Use ISO 8601 format" });
        }
      } catch (err) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      // Validate date range (start must be before end)
      if (startDate >= endDate) {
        return res.status(400).json({ message: "Period start date must be before period end date" });
      }
      
      // Verify tenant exists
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      // Get tenant's active subscription OR create one if it doesn't exist (for à la carte tenants)
      let [subscription] = await db
        .select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.tenantId, tenantId),
          eq(subscriptions.status, 'active')
        ))
        .limit(1);
      
      // If no subscription exists, create an à la carte subscription
      if (!subscription) {
        console.log(`📦 Creating à la carte subscription for tenant ${tenantId}`);
        
        // Get or create "À La Carte" plan
        let [alaCartePlan] = await db
          .select()
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.slug, 'a-la-carte'))
          .limit(1);
        
        if (!alaCartePlan) {
          // Create the À La Carte plan if it doesn't exist
          [alaCartePlan] = await db
            .insert(subscriptionPlans)
            .values({
              name: 'À La Carte',
              slug: 'a-la-carte',
              monthlyPriceCents: 0, // No base fee
              setupFeeCents: 0,
              includedEmails: 0,
              includedSms: 0,
              emailOverageRatePer1000: 250,
              smsOverageRatePerSegment: 3,
              features: JSON.stringify(['Pay per use', 'No monthly commitment', 'Flexible service selection']),
              isActive: true,
              displayOrder: 999
            })
            .returning();
        }
        
        // Create subscription for this tenant
        [subscription] = await db
          .insert(subscriptions)
          .values({
            tenantId: tenantId,
            planId: alaCartePlan.id,
            status: 'active',
            currentPeriodStart: startDate,
            currentPeriodEnd: endDate,
            emailsUsedThisPeriod: 0,
            smsUsedThisPeriod: 0,
            approvedBy: 'system',
            approvedAt: new Date()
          })
          .returning();
        
        console.log(`✅ Created à la carte subscription ${subscription.id} for tenant ${tenantId}`);
      }
      
      // Update subscription billing period
      const [updated] = await db
        .update(subscriptions)
        .set({
          currentPeriodStart: startDate,
          currentPeriodEnd: endDate,
          updatedAt: new Date(),
        })
        .where(and(
          eq(subscriptions.id, subscription.id),
          eq(subscriptions.tenantId, tenantId)
        ))
        .returning();
      
      console.log(`✅ Billing dates updated for tenant ${tenant.name} (${tenantId}): ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      res.json({
        ...updated,
        message: 'Billing dates updated successfully'
      });
    } catch (error) {
      console.error("Error updating billing dates:", error);
      res.status(500).json({ message: "Failed to update billing dates" });
    }
  });

  // Send test email to agency
  app.post('/api/admin/test-email', isPlatformAdmin, async (req: any, res) => {
    try {
      const { tenantId, toEmail } = req.body;
      
      if (!tenantId || !toEmail) {
        return res.status(400).json({ message: "Tenant ID and email address are required" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      await emailService.sendEmail({
        to: toEmail,
        subject: "Test Email - Chain Platform",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Test Email</h2>
            <p>This is a test email sent from the Chain platform for <strong>${tenant.name}</strong>.</p>
            <p>This email is being sent to verify email tracking for agency-specific usage statistics.</p>
            <hr style="margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">Agency: ${tenant.name} (${tenant.slug})</p>
            <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toISOString()}</p>
          </div>
        `,
        tenantId: tenant.id,
      });

      res.json({ message: "Test email sent successfully" });
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({ message: "Failed to send test email" });
    }
  });

  // Update tenant status (activate/suspend)
  app.put('/api/admin/tenants/:id/status', isPlatformAdmin, async (req: any, res) => {
    try {
      const { isActive, suspensionReason } = req.body;
      
      const updatedTenant = await storage.updateTenantStatus(req.params.id, {
        isActive,
        suspensionReason: isActive ? null : suspensionReason,
        suspendedAt: isActive ? null : new Date(),
      });
      
      res.json(updatedTenant);
    } catch (error) {
      console.error("Error updating tenant status:", error);
      res.status(500).json({ message: "Failed to update tenant status" });
    }
  });

  // Upgrade tenant from trial to paid
  app.put('/api/admin/tenants/:id/upgrade', isPlatformAdmin, async (req: any, res) => {
    try {
      const updatedTenant = await storage.upgradeTenantToPaid(req.params.id);
      res.json(updatedTenant);
    } catch (error) {
      console.error("Error upgrading tenant:", error);
      res.status(500).json({ message: "Failed to upgrade tenant" });
    }
  });

  // Get all subscription requests (pending approval)
  app.get('/api/admin/subscription-requests', isPlatformAdmin, async (req: any, res) => {
    try {
      const pendingSubscriptions = await db
        .select({
          subscription: subscriptions,
          tenant: tenants,
          plan: subscriptionPlans,
          settings: tenantSettings,
        })
        .from(subscriptions)
        .innerJoin(tenants, eq(subscriptions.tenantId, tenants.id))
        .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id))
        .where(eq(subscriptions.status, 'pending_approval'))
        .orderBy(subscriptions.requestedAt);

      const formattedRequests = pendingSubscriptions.map(({ subscription, tenant, plan, settings }) => ({
        id: subscription.id,
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        planName: plan.name,
        planSlug: plan.slug,
        monthlyPrice: plan.monthlyPriceCents / 100,
        setupFee: (plan.setupFeeCents ?? 10000) / 100,
        includedEmails: plan.includedEmails,
        includedSms: plan.includedSms,
        requestedBy: subscription.requestedBy,
        requestedAt: subscription.requestedAt,
        billingEmail: subscription.billingEmail,
        enabledAddons: settings?.enabledAddons || [],
      }));

      res.json(formattedRequests);
    } catch (error) {
      console.error("Error fetching subscription requests:", error);
      res.status(500).json({ message: "Failed to fetch subscription requests" });
    }
  });

  // Approve subscription request
  app.post('/api/admin/subscription-requests/:id/approve', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { setupFeeWaived } = req.body;
      const adminEmail = req.user.email || req.user.username || 'Platform Admin';

      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, id))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({ message: "Subscription request not found" });
      }

      if (subscription.status !== 'pending_approval') {
        return res.status(400).json({ message: "Subscription is not pending approval" });
      }

      const updatedSubscription = await storage.updateSubscription(id, {
        status: 'active',
        approvedBy: adminEmail,
        approvedAt: new Date(),
        setupFeeWaived: setupFeeWaived ?? false,
        updatedAt: new Date(),
      });

      // Update tenant to remove trial status, mark as paid, and enable CORE services only
      // (Add-ons like document signing must be enabled separately)
      await db
        .update(tenants)
        .set({ 
          isTrialAccount: false,
          isPaidAccount: true,
          emailServiceEnabled: true,
          smsServiceEnabled: true,
          paymentProcessingEnabled: true,
          portalAccessEnabled: true,
        })
        .where(eq(tenants.id, subscription.tenantId));

      res.json({
        ...updatedSubscription,
        message: 'Subscription approved successfully',
      });
    } catch (error) {
      console.error("Error approving subscription:", error);
      res.status(500).json({ message: "Failed to approve subscription" });
    }
  });

  // Reject subscription request
  app.post('/api/admin/subscription-requests/:id/reject', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminEmail = req.user.email || req.user.username || 'Platform Admin';

      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, id))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({ message: "Subscription request not found" });
      }

      if (subscription.status !== 'pending_approval') {
        return res.status(400).json({ message: "Subscription is not pending approval" });
      }

      const updatedSubscription = await storage.updateSubscription(id, {
        status: 'rejected',
        approvedBy: adminEmail,
        approvedAt: new Date(),
        rejectionReason: reason || 'No reason provided',
        updatedAt: new Date(),
      });

      res.json({
        ...updatedSubscription,
        message: 'Subscription request rejected',
      });
    } catch (error) {
      console.error("Error rejecting subscription:", error);
      res.status(500).json({ message: "Failed to reject subscription" });
    }
  });

  // Get all subscription plans for admin - uses billing-plans.ts for accurate pricing
  app.get('/api/admin/subscription-plans', isPlatformAdmin, async (req: any, res) => {
    try {
      const { getPlanListForBusinessType, DOCUMENT_SIGNING_ADDON_PRICE, AI_AUTO_RESPONSE_ADDON_PRICE } = await import('../shared/billing-plans');
      
      // Get businessType from query param, default to call_center
      const businessType = (req.query.businessType as string) || 'call_center';
      
      // Get plans for this business type from billing-plans.ts
      const billingPlans = getPlanListForBusinessType(businessType as any);
      
      // Convert to the expected format (matching subscriptionPlans table structure)
      const plans = billingPlans.map((plan, index) => ({
        id: plan.id,
        name: plan.name,
        monthlyPriceCents: plan.price * 100, // Convert dollars to cents
        setupFeeCents: 0, // No setup fee for base plans
        includedEmails: plan.includedEmails,
        includedSmsSegments: plan.includedSmsSegments,
        displayOrder: index,
        isActive: true,
        // Include add-on pricing info
        addons: {
          document_signing: DOCUMENT_SIGNING_ADDON_PRICE * 100,
          ai_auto_response: AI_AUTO_RESPONSE_ADDON_PRICE * 100
        }
      }));

      res.json(plans);
    } catch (error) {
      console.error("Error fetching subscription plans:", error);
      res.status(500).json({ message: "Failed to fetch subscription plans" });
    }
  });

  // Manually assign plan to tenant (skip approval workflow)
  app.post('/api/admin/tenants/:tenantId/assign-plan', isPlatformAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const { planId, setupFeeWaived } = req.body;
      const adminEmail = req.user.email || req.user.username || 'Platform Admin';

      // Verify tenant exists
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Agency not found" });
      }

      // Verify plan exists
      const [plan] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId))
        .limit(1);

      if (!plan) {
        return res.status(404).json({ message: "Subscription plan not found" });
      }

      // Check if tenant already has an active subscription
      const [existingSubscription] = await db
        .select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.tenantId, tenantId),
          eq(subscriptions.status, 'active')
        ))
        .limit(1);

      let subscription;
      if (existingSubscription) {
        // Update existing subscription
        subscription = await storage.updateSubscription(existingSubscription.id, {
          planId: planId,
          approvedBy: adminEmail,
          approvedAt: new Date(),
          setupFeeWaived: setupFeeWaived ?? false,
          updatedAt: new Date(),
        });
      } else {
        // Create new subscription
        const now = new Date();
        subscription = await storage.createSubscription({
          tenantId,
          planId,
          status: 'active',
          approvedBy: adminEmail,
          approvedAt: now,
          setupFeeWaived: setupFeeWaived ?? false,
          setupFeePaidAt: setupFeeWaived ? now : null,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
          emailsUsedThisPeriod: 0,
          smsUsedThisPeriod: 0,
        });
      }

      // Update tenant to remove trial status, mark as paid, and enable CORE services only
      // (Add-ons like document signing must be enabled separately)
      await db
        .update(tenants)
        .set({ 
          isTrialAccount: false,
          isPaidAccount: true,
          emailServiceEnabled: true,
          smsServiceEnabled: true,
          paymentProcessingEnabled: true,
          portalAccessEnabled: true,
        })
        .where(eq(tenants.id, tenantId));

      res.json({
        ...subscription,
        planName: plan.name,
        message: 'Plan assigned successfully',
      });
    } catch (error) {
      console.error("Error assigning plan:", error);
      res.status(500).json({ message: "Failed to assign plan" });
    }
  });

  // Get all global document templates
  app.get('/api/admin/global-document-templates', isPlatformAdmin, async (req: any, res) => {
    try {
      const templates = await storage.getGlobalDocumentTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching global document templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Generate the full contract content for signing page (separate from email)
  function generateContractDocument(metadata: Record<string, any>): string {
    return `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 30px; color: #333;">
  <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #2563eb;">
    <h1 style="color: #1e40af; margin: 0; font-size: 28px;">Chain Software Group</h1>
    <p style="color: #64748b; margin: 5px 0 0;">Agency SaaS Agreement</p>
  </div>
  
  <div style="background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%); padding: 20px; border-radius: 10px; margin-bottom: 25px; border-left: 4px solid #2563eb;">
    <h3 style="margin: 0 0 10px; color: #1e40af;">Your Subscription Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #64748b;">Company:</td><td style="padding: 8px 0; font-weight: 600;">${metadata.companyName || ''}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Plan:</td><td style="padding: 8px 0; font-weight: 600;">${metadata.pricingTier || ''}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Base Monthly Rate:</td><td style="padding: 8px 0; font-weight: 600;">${metadata.monthlyPrice || ''}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Add-ons:</td><td style="padding: 8px 0;">${metadata.addonsList || 'None'}</td></tr>
      <tr style="border-top: 1px solid #cbd5e1;"><td style="padding: 12px 0; color: #1e40af; font-weight: 600;">Total Monthly:</td><td style="padding: 12px 0; font-weight: 700; font-size: 18px; color: #059669;">${metadata.totalMonthlyPrice || ''}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Billing Start:</td><td style="padding: 8px 0;">${metadata.billingStartDate || ''}</td></tr>
    </table>
    <p style="font-size: 12px; color: #f59e0b; margin: 15px 0 0; font-style: italic;">* Amount subject to change based on overage usage</p>
  </div>

  <h2 style="color: #1e40af; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Agency SaaS Agreement</h2>
  <p><strong>Parties:</strong> Chain Software Group ("Provider") and the subscribing agency ("Customer").</p>
  <p><strong>Scope:</strong> Access to the multi-tenant platform for uploading account data, communicating with consumers, and optional payment facilitation via third parties.</p>

  <h3 style="color: #334155;">Key Terms</h3>
  <ul style="line-height: 1.8;">
    <li><strong>Term & Renewal:</strong> This agreement is month-to-month and auto-renews each month unless either party gives 30 days' written notice to cancel.</li>
    <li><strong>Customer Data:</strong> Customer is the controller of its Consumer Data. Chain processes it solely to provide the Service, under the Data Processing Addendum (DPA).</li>
    <li><strong>Acceptable Use & Compliance:</strong> Customer agrees to comply with applicable law (e.g., FDCPA/Reg F, TCPA, state laws) and to only send lawful, consented communications via the Service. Customer is responsible for A2P 10DLC brand/campaign registration where required.</li>
    <li><strong>Security:</strong> Chain implements administrative, technical, and physical safeguards appropriate to the risk. Customer must secure its credentials and restrict access to authorized personnel.</li>
    <li><strong>Messaging & Payments:</strong> Messaging is provided via third-party carriers/providers; delivery is not guaranteed. Payments are processed via third-party processors under their terms. Chain is not a debt collector and does not decide settlement terms or lawful contact windows.</li>
    <li><strong>Confidentiality; IP:</strong> Each party will protect the other's Confidential Information. Chain retains all rights to the Service and underlying IP.</li>
    <li><strong>Warranties; Disclaimers:</strong> The Service is provided "AS IS." Chain disclaims implied warranties. No legal, compliance, or collection advice is provided.</li>
    <li><strong>Indemnity:</strong> Customer will indemnify Chain for claims arising from Customer's data, instructions, or unlawful communications. Chain will indemnify Customer for third-party IP claims alleging the Service infringes IP rights.</li>
    <li><strong>Liability Cap:</strong> Each party's aggregate liability is capped at the fees paid in the 12 months preceding the claim; no indirect or consequential damages.</li>
    <li><strong>Termination:</strong> Either party may terminate for material breach uncured within 30 days. Upon termination, Customer may export its data for 30 days.</li>
    <li><strong>Governing Law; Venue:</strong> New York law; exclusive venue Erie County, NY.</li>
  </ul>

  <h3 style="color: #334155;">Data Processing Addendum (Summary)</h3>
  <ul style="line-height: 1.8;">
    <li><strong>Roles:</strong> Customer = Controller; Chain = Processor/Service Provider.</li>
    <li><strong>Instructions:</strong> Process Consumer Data only per Customer's documented instructions and the Agreement.</li>
    <li><strong>Sub-processors:</strong> Chain may use vetted sub-processors (hosting, messaging, analytics, payment); list available upon request.</li>
    <li><strong>Security:</strong> Appropriate technical/organizational measures (encryption in transit, access controls, logging, backups).</li>
    <li><strong>Breach Notice:</strong> Notify Customer without undue delay of a confirmed personal data breach.</li>
    <li><strong>Deletion/Return:</strong> On termination, delete or return Consumer Data after the export window, unless retention is required by law.</li>
  </ul>

  <h2 style="color: #1e40af; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-top: 30px;">Messaging Overage Terms</h2>
  
  <h3 style="color: #334155;">SMS Program Requirements</h3>
  <ul style="line-height: 1.8;">
    <li>Agency must collect, store, and produce proof of consent for each recipient upon request.</li>
    <li>Service is subject to Agency's messaging brand and campaign approval by the carrier ecosystem (e.g., A2P 10DLC).</li>
    <li>Agency is responsible for content compliance with FDCPA/Reg F, TCPA, and state laws.</li>
  </ul>

  <h3 style="color: #334155;">Overages</h3>
  <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b;">
    <p style="margin: 0 0 10px;"><strong>Email Overage:</strong> $2.50 per 1,000 emails beyond your plan's monthly allotment.</p>
    <p style="margin: 0 0 10px;"><strong>SMS Overage:</strong> $0.03 per SMS segment beyond your plan's monthly allotment.</p>
    <p style="margin: 0; font-size: 13px; color: #64748b;"><em>Note: SMS messages longer than 160 characters are split into multiple segments. Each segment counts toward your usage.</em></p>
  </div>

  <h3 style="color: #334155;">Billing</h3>
  <p>Monthly in advance for Service Fee; overages billed in arrears. Invoices due net 15 days. Late balances may accrue interest at 1.5%/mo and may trigger suspension.</p>

  <h3 style="color: #334155;">Compliance & Indemnity</h3>
  <p>Agency will comply with FDCPA/Reg F, TCPA, state telemarketing/messaging laws, carrier policies, and applicable email anti-spam laws. Agency will indemnify Chain for claims arising from Agency's messaging content or unlawful contact practices.</p>

  <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
    <p style="margin: 0; font-size: 13px;"><strong>Contact Information:</strong><br>
    Email: ${metadata.contactEmail || ''}<br>
    Phone: ${metadata.contactPhone || ''}</p>
  </div>

  <div style="text-align: center; margin-top: 30px; padding: 20px; background: #f8fafc; border-radius: 10px;">
    <p style="margin: 0 0 15px; color: #64748b;">By clicking "I Agree" below, you acknowledge that you have read and agree to the terms of this Agreement.</p>
  </div>
</div>`;
  }

  // Send agreement to tenant
  app.post('/api/admin/tenants/:tenantId/send-agreement', isPlatformAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const { templateSlug, title, description } = req.body;

      if (!templateSlug) {
        return res.status(400).json({ message: "Template slug is required" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Agency not found" });
      }

      if (!tenant.email) {
        return res.status(400).json({ message: "Agency has no email address configured" });
      }

      const template = await storage.getGlobalDocumentTemplateBySlug(templateSlug);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const baseUrl = ensureBaseUrl(process.env.REPLIT_DOMAINS);
      
      // Build complete agreement metadata from tenant and subscription data
      const agreementMetadata = await buildAgreementVariables(tenant, tenantId, storage, baseUrl);

      // Generate the full contract document content for the signing page
      const documentContent = generateContractDocument(agreementMetadata);

      // Create agreement with complete metadata and document content
      const agreement = await storage.createTenantAgreement({
        tenantId,
        globalDocumentId: template.id,
        agreementType: templateSlug,
        agreementMetadata,
        documentContent,
        title: title || template.title,
        description: description || template.description || '',
        status: 'pending',
      });

      // Add agreementLink to variables
      const agreementLink = `${baseUrl}/tenant-agreement/${agreement.id}`;
      const emailVariables = {
        ...agreementMetadata,
        agreementLink,
      };

      // Replace variables in template (email is simple with subscription details + link)
      let emailHtml = template.content;
      Object.keys(emailVariables).forEach((key: string) => {
        const value = (emailVariables as any)[key];
        const regex = new RegExp(`{{${key}}}`, 'g');
        emailHtml = emailHtml.replace(regex, String(value || ''));
      });

      await emailService.sendEmail({
        to: tenant.email,
        subject: title || template.title,
        html: emailHtml,
        tenantId: undefined,
      });

      res.json({ 
        ...agreement, 
        message: 'Agreement sent successfully',
        agreementLink 
      });
    } catch (error) {
      console.error("Error sending agreement:", error);
      res.status(500).json({ message: "Failed to send agreement" });
    }
  });

  // Get agreements for tenant (admin view)
  app.get('/api/admin/tenants/:tenantId/agreements', isPlatformAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const agreements = await storage.getTenantAgreementsByTenant(tenantId);
      res.json(agreements);
    } catch (error) {
      console.error("Error fetching tenant agreements:", error);
      res.status(500).json({ message: "Failed to fetch agreements" });
    }
  });

  // Get single agreement details for admin viewing (includes full document content)
  app.get('/api/admin/tenant-agreements/:agreementId', isPlatformAdmin, async (req: any, res) => {
    try {
      const { agreementId } = req.params;
      const agreement = await storage.getTenantAgreementById(agreementId);

      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found" });
      }

      const tenant = await storage.getTenant(agreement.tenantId);
      const template = await storage.getGlobalDocumentTemplateById(agreement.globalDocumentId);

      // Use stored documentContent if available, otherwise regenerate from agreementMetadata
      // NEVER fall back to template.content (that's the email template, not the full contract)
      let content = agreement.documentContent;
      if (!content && agreement.agreementMetadata) {
        // Regenerate the full contract from stored metadata
        content = generateContractDocument(agreement.agreementMetadata as Record<string, any>);
      }
      if (!content) {
        content = '<p>Contract content unavailable. Please contact support.</p>';
      }

      res.json({
        ...agreement,
        content,
        tenantName: tenant?.name || 'Unknown',
        templateName: template?.name || 'Unknown Template',
      });
    } catch (error) {
      console.error("Error fetching agreement details:", error);
      res.status(500).json({ message: "Failed to fetch agreement details" });
    }
  });

  // Test Postmark connection
  app.get('/api/admin/test-postmark', isPlatformAdmin, async (req: any, res) => {
    try {
      // Test by fetching servers list
      const result = await postmarkServerService.testConnection();
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Postmark connection successful',
          serverCount: result.serverCount,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Postmark connection failed',
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error testing Postmark connection:", error);
      res.status(500).json({
        success: false,
        message: "Failed to test Postmark connection",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Create new agency with Postmark server
  app.post('/api/admin/agencies', isPlatformAdmin, async (req: any, res) => {
    try {
      const { name, email } = req.body;
      
      if (!name || !email) {
        return res.status(400).json({ message: "Agency name and email are required" });
      }

      // Check if agency with this email already exists
      const existingTenant = await storage.getTenantByEmail(email);
      if (existingTenant) {
        return res.status(400).json({ 
          message: "An agency with this email already exists" 
        });
      }

      // Create Postmark server
      console.log(`Creating Postmark server for agency: ${name}`);
      const postmarkResult = await postmarkServerService.createServer({
        name: `${name} - Email Server`,
        color: 'Purple',
        trackOpens: true,
        trackLinks: 'HtmlAndText'
      });

      if (!postmarkResult.success || !postmarkResult.server) {
        console.error('Failed to create Postmark server:', postmarkResult.error);
        return res.status(500).json({ 
          message: `Failed to create email server: ${postmarkResult.error}` 
        });
      }

      const server = postmarkResult.server;
      console.log(`✅ Postmark server created - ID: ${server.ID}, Token: ${server.ApiTokens[0]?.substring(0, 10)}...`);

      // Create tenant with Postmark integration
      const tenant = await storage.createTenantWithPostmark({
        name,
        email,
        postmarkServerId: server.ID.toString(),
        postmarkServerToken: server.ApiTokens[0],
        postmarkServerName: server.Name,
      });

      console.log(`✅ Agency created: ${name} with Postmark server ${server.ID}`);

      // Auto-seed subscription plans (safe to call even if already exists)
      try {
        const { seedSubscriptionPlans } = await import('./seed-subscription-plans');
        await seedSubscriptionPlans();
        console.log('✅ Subscription plans auto-seeded for new agency');
      } catch (seedError) {
        console.error('Warning: Failed to auto-seed subscription plans:', seedError);
        // Don't fail agency creation if seeding fails
      }

      res.status(201).json({
        message: "Agency created successfully with dedicated email server",
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          email: tenant.email,
          postmarkServerId: tenant.postmarkServerId,
          postmarkServerName: tenant.postmarkServerName,
        },
        postmarkServer: {
          id: server.ID,
          name: server.Name,
          serverLink: server.ServerLink,
        }
      });

    } catch (error) {
      console.error("Error creating agency:", error);
      res.status(500).json({ message: "Failed to create agency" });
    }
  });

  // Delete agency (platform admin only)
  app.delete('/api/admin/agencies/:id', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Delete the tenant (cascade will handle related records)
      await db.delete(tenants).where(eq(tenants.id, id));
      
      res.json({ 
        success: true, 
        message: "Agency deleted successfully" 
      });
    } catch (error) {
      console.error("Error deleting agency:", error);
      res.status(500).json({ message: "Failed to delete agency" });
    }
  });

  // Get all consumers across all agencies (platform admin only)
  app.get('/api/admin/consumers', isPlatformAdmin, async (req: any, res) => {
    try {
      const { search, tenantId, limit = 100 } = req.query;
      
      const baseQuery = db
        .select({
          consumer: consumers,
          tenant: {
            id: tenants.id,
            name: tenants.name,
            slug: tenants.slug,
          }
        })
        .from(consumers)
        .leftJoin(tenants, eq(consumers.tenantId, tenants.id));
      
      // Filter by tenant if specified
      const results = tenantId
        ? await baseQuery.where(eq(consumers.tenantId, tenantId)).limit(parseInt(limit as string, 10))
        : await baseQuery.limit(parseInt(limit as string, 10));
      
      // Apply search filter in-memory if provided
      let filteredResults = results;
      if (search && typeof search === 'string') {
        const searchLower = search.toLowerCase();
        filteredResults = results.filter(r => 
          r.consumer.firstName?.toLowerCase().includes(searchLower) ||
          r.consumer.lastName?.toLowerCase().includes(searchLower) ||
          r.consumer.email?.toLowerCase().includes(searchLower) ||
          r.tenant?.name?.toLowerCase().includes(searchLower)
        );
      }
      
      res.json(filteredResults);
    } catch (error) {
      console.error("Error fetching all consumers:", error);
      res.status(500).json({ message: "Failed to fetch consumers" });
    }
  });

  // SMS Compliance - Get blocked numbers for a tenant (platform admin only)
  app.get('/api/admin/sms-compliance/blocked-numbers', isPlatformAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.query;
      if (!tenantId) {
        return res.status(400).json({ message: "tenantId is required" });
      }
      
      const blockedNumbers = await storage.getSmsBlockedNumbers(tenantId as string);
      res.json(blockedNumbers);
    } catch (error) {
      console.error("Error fetching blocked numbers:", error);
      res.status(500).json({ message: "Failed to fetch blocked numbers" });
    }
  });

  // SMS Compliance - Sync historical data for a tenant (platform admin only)
  app.post('/api/admin/sms-compliance/sync-historical', isPlatformAdmin, async (req: any, res) => {
    try {
      const { tenantId, daysBack } = req.body;
      if (!tenantId) {
        return res.status(400).json({ 
          success: false,
          message: "tenantId is required",
          errors: ["tenantId is required"],
          failedNumbers: 0,
          optOutNumbers: 0,
          consumersMarkedOptedOut: 0,
          totalMessagesScanned: 0,
        });
      }
      
      // Get tenant to verify it exists and has Twilio credentials
      const tenant = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      
      if (!tenant || tenant.length === 0) {
        return res.status(404).json({ 
          success: false,
          message: "Tenant not found",
          errors: ["Tenant not found"],
          failedNumbers: 0,
          optOutNumbers: 0,
          consumersMarkedOptedOut: 0,
          totalMessagesScanned: 0,
        });
      }
      
      if (!tenant[0].twilioAccountSid || !tenant[0].twilioAuthToken) {
        return res.status(400).json({ 
          success: false,
          message: "Tenant does not have Twilio credentials configured",
          errors: ["Tenant does not have Twilio credentials configured"],
          failedNumbers: 0,
          optOutNumbers: 0,
          consumersMarkedOptedOut: 0,
          totalMessagesScanned: 0,
        });
      }
      
      const result = await smsService.syncHistoricalBlockedNumbers(tenantId, daysBack || 90);
      res.json(result);
    } catch (error: any) {
      console.error("Error syncing historical SMS data:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to sync historical SMS data",
        errors: [error.message || "Failed to sync historical SMS data"],
        failedNumbers: 0,
        optOutNumbers: 0,
        consumersMarkedOptedOut: 0,
        totalMessagesScanned: 0,
      });
    }
  });

  // SMS Compliance - Unblock a phone number for a tenant (platform admin only)
  app.delete('/api/admin/sms-compliance/blocked-numbers/:phoneNumber', isPlatformAdmin, async (req: any, res) => {
    try {
      const { phoneNumber } = req.params;
      const { tenantId } = req.query;
      
      if (!tenantId) {
        return res.status(400).json({ message: "tenantId is required" });
      }
      
      await storage.removeSmsBlockedNumber(tenantId as string, decodeURIComponent(phoneNumber));
      res.json({ success: true });
    } catch (error) {
      console.error("Error unblocking phone number:", error);
      res.status(500).json({ message: "Failed to unblock phone number" });
    }
  });

  // SMS Billing - Backfill SMS usage from tracking records (platform admin only)
  app.post('/api/admin/sms-compliance/backfill-billing', isPlatformAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.body;
      if (!tenantId) {
        return res.status(400).json({ message: "tenantId is required" });
      }

      // Get tenant's subscription to determine billing period
      const subscription = await storage.getSubscriptionByTenant(tenantId);
      if (!subscription) {
        return res.status(400).json({ message: "Tenant has no subscription" });
      }

      // Use subscription billing period or default to last 30 days
      const periodEnd = subscription.currentPeriodEnd || new Date();
      const periodStart = subscription.currentPeriodStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      console.log(`📊 Backfilling SMS billing for tenant ${tenantId}`);
      console.log(`   Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

      const result = await storage.backfillSmsUsageFromTracking(tenantId, periodStart, periodEnd);

      console.log(`✅ Backfill complete: ${result.backfilledCount} messages, ${result.totalSegments} segments`);
      
      res.json({
        success: true,
        backfilledCount: result.backfilledCount,
        totalSegments: result.totalSegments,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
    } catch (error) {
      console.error("Error backfilling SMS billing:", error);
      res.status(500).json({ message: "Failed to backfill SMS billing" });
    }
  });

  // Delete consumer (platform admin only)
  app.delete('/api/admin/consumers/:id', isPlatformAdmin, async (req: any, res) => {
    try {
      const consumerId = req.params.id;
      
      // Get consumer to find tenant
      const consumer = await db
        .select()
        .from(consumers)
        .where(eq(consumers.id, consumerId))
        .limit(1);
      
      if (!consumer || consumer.length === 0) {
        return res.status(404).json({ message: "Consumer not found" });
      }
      
      const tenantId = consumer[0].tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "Consumer has no tenant" });
      }
      
      // Delete consumer and associated accounts
      const result = await deleteConsumers(db, tenantId, [consumerId]);
      res.json(result);
    } catch (error) {
      console.error("Error deleting consumer:", error);
      res.status(500).json({ message: "Failed to delete consumer" });
    }
  });

  // Update tenant service controls (platform admin only)
  app.put('/api/admin/tenants/:id/service-controls', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { 
        emailServiceEnabled,
        smsServiceEnabled,
        portalAccessEnabled,
        paymentProcessingEnabled 
      } = req.body;
      
      const updates: any = {};
      if (emailServiceEnabled !== undefined) updates.emailServiceEnabled = emailServiceEnabled;
      if (smsServiceEnabled !== undefined) updates.smsServiceEnabled = smsServiceEnabled;
      if (portalAccessEnabled !== undefined) updates.portalAccessEnabled = portalAccessEnabled;
      if (paymentProcessingEnabled !== undefined) updates.paymentProcessingEnabled = paymentProcessingEnabled;
      
      const updatedTenant = await db
        .update(tenants)
        .set(updates)
        .where(eq(tenants.id, id))
        .returning();
      
      if (!updatedTenant || updatedTenant.length === 0) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      res.json(updatedTenant[0]);
    } catch (error) {
      console.error("Error updating service controls:", error);
      res.status(500).json({ message: "Failed to update service controls" });
    }
  });

  // Update tenant contact information (platform admin only)
  app.put('/api/admin/tenants/:id/contact', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Validate input
      const contactSchema = z.object({
        email: z.string().email().optional(),
        phoneNumber: z.string().min(10).optional()
      });
      
      const validation = contactSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid contact information", 
          errors: validation.error.errors 
        });
      }
      
      const { email, phoneNumber } = validation.data;
      
      const updates: any = {};
      if (email !== undefined) updates.email = email;
      if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }
      
      const updatedTenant = await db
        .update(tenants)
        .set(updates)
        .where(eq(tenants.id, id))
        .returning();
      
      if (!updatedTenant || updatedTenant.length === 0) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      res.json(updatedTenant[0]);
    } catch (error) {
      console.error("Error updating contact info:", error);
      res.status(500).json({ message: "Failed to update contact information" });
    }
  });

  // Update tenant name and slug (platform admin only)
  app.put('/api/admin/tenants/:id/name', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Validate input
      const nameSchema = z.object({
        name: z.string().min(1, "Name is required").max(100, "Name too long"),
        slug: z.string().min(1, "Slug is required").max(50, "Slug too long")
          .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens")
      });
      
      const validation = nameSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid name data", 
          errors: validation.error.errors 
        });
      }
      
      const { name, slug } = validation.data;
      
      // Check if slug is already in use by another tenant
      const existingTenant = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);
      
      if (existingTenant.length > 0 && existingTenant[0].id !== id) {
        return res.status(400).json({ message: "This URL slug is already in use by another agency" });
      }
      
      const updatedTenant = await db
        .update(tenants)
        .set({ name, slug })
        .where(eq(tenants.id, id))
        .returning();
      
      if (!updatedTenant || updatedTenant.length === 0) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      res.json(updatedTenant[0]);
    } catch (error) {
      console.error("Error updating tenant name:", error);
      res.status(500).json({ message: "Failed to update tenant name" });
    }
  });

  // Reset tenant usage counters (platform admin only)
  app.put('/api/admin/tenants/:id/reset-usage', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Verify tenant exists
      const tenant = await storage.getTenant(id);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      // Get active subscription to determine billing period
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.tenantId, id),
          eq(subscriptions.status, 'active')
        ))
        .limit(1);

      let deletedEmailSms = 0;
      let deletedAiResponses = 0;

      // Check if subscription has valid billing period dates
      const hasValidBillingPeriod = subscription && subscription.currentPeriodStart && subscription.currentPeriodEnd;

      if (hasValidBillingPeriod) {
        // Delete usage for the current billing period only
        const periodStart = new Date(subscription.currentPeriodStart);
        const periodEnd = new Date(subscription.currentPeriodEnd);
        
        // Delete email/SMS usage events for the billing period
        const messagingResult = await db
          .delete(messagingUsageEvents)
          .where(and(
            eq(messagingUsageEvents.tenantId, id),
            gte(messagingUsageEvents.occurredAt, periodStart),
            lte(messagingUsageEvents.occurredAt, periodEnd)
          ))
          .returning();
        deletedEmailSms = messagingResult.length;

        // Delete AI auto-response usage for the billing period
        const aiResult = await db
          .delete(autoResponseUsage)
          .where(and(
            eq(autoResponseUsage.tenantId, id),
            gte(autoResponseUsage.createdAt, periodStart),
            lte(autoResponseUsage.createdAt, periodEnd)
          ))
          .returning();
        deletedAiResponses = aiResult.length;
      } else {
        // No subscription OR no valid billing period - delete ALL usage for this tenant
        const messagingResult = await db
          .delete(messagingUsageEvents)
          .where(eq(messagingUsageEvents.tenantId, id))
          .returning();
        deletedEmailSms = messagingResult.length;

        const aiResult = await db
          .delete(autoResponseUsage)
          .where(eq(autoResponseUsage.tenantId, id))
          .returning();
        deletedAiResponses = aiResult.length;
      }

      console.log(`Reset usage for tenant ${id}: ${deletedEmailSms} messaging events, ${deletedAiResponses} AI responses`);

      res.json({
        success: true,
        message: "Usage counters reset successfully",
        deleted: {
          messagingEvents: deletedEmailSms,
          aiResponses: deletedAiResponses
        }
      });
    } catch (error) {
      console.error("Error resetting usage:", error);
      res.status(500).json({ message: "Failed to reset usage counters" });
    }
  });

  // Update tenant payment method (platform admin only)
  // SECURITY: This endpoint only accepts Stripe tokens, never raw payment data
  app.put('/api/admin/tenants/:id/payment-method', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Validate that only Stripe tokens and metadata are accepted
      const paymentMethodSchema = z.object({
        paymentMethodType: z.enum(['card', 'bank_account']),
        stripeCustomerId: z.string().min(1, "Stripe customer ID required"),
        stripePaymentMethodId: z.string().min(1, "Stripe payment method ID required"),
        // Only last 4 digits for display - never full numbers
        cardLast4: z.string().length(4).optional(),
        cardBrand: z.string().optional(),
        bankAccountLast4: z.string().length(4).optional(),
        bankRoutingLast4: z.string().length(4).optional()
      });
      
      const validation = paymentMethodSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid payment method data. Must include Stripe customer and payment method IDs.", 
          errors: validation.error.errors 
        });
      }
      
      const { 
        paymentMethodType,
        stripeCustomerId,
        stripePaymentMethodId,
        cardLast4,
        cardBrand,
        bankAccountLast4,
        bankRoutingLast4
      } = validation.data;
      
      const updates: any = {
        paymentMethodType,
        stripeCustomerId,
        stripePaymentMethodId
      };
      
      if (cardLast4) updates.cardLast4 = cardLast4;
      if (cardBrand) updates.cardBrand = cardBrand;
      if (bankAccountLast4) updates.bankAccountLast4 = bankAccountLast4;
      if (bankRoutingLast4) updates.bankRoutingLast4 = bankRoutingLast4;
      
      const updatedTenant = await db
        .update(tenants)
        .set(updates)
        .where(eq(tenants.id, id))
        .returning();
      
      if (!updatedTenant || updatedTenant.length === 0) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      res.json(updatedTenant[0]);
    } catch (error) {
      console.error("Error updating payment method:", error);
      res.status(500).json({ message: "Failed to update payment method" });
    }
  });

  // Get tenant settings (platform admin only)
  app.get('/api/admin/tenants/:id/settings', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const settings = await storage.getTenantSettings(id);
      
      // Return empty settings if none exist yet (for new tenants)
      if (!settings) {
        return res.json({ enabledModules: [] });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error fetching tenant settings:", error);
      res.status(500).json({ message: "Failed to fetch tenant settings" });
    }
  });

  // Update tenant business configuration (platform admin only)
  app.put('/api/admin/tenants/:id/business-config', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Validate input with known module IDs only
      const businessConfigSchema = z.object({
        businessType: z.enum(['call_center', 'billing_service', 'subscription_provider', 'freelancer_consultant', 'property_management']),
        enabledModules: z.array(z.enum(['billing', 'subscriptions', 'work_orders', 'client_crm', 'messaging_center']))
      });
      
      const validation = businessConfigSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid business configuration", 
          errors: validation.error.errors 
        });
      }
      
      const { businessType, enabledModules } = validation.data;
      
      // Update tenant businessType
      const updatedTenant = await db
        .update(tenants)
        .set({ businessType })
        .where(eq(tenants.id, id))
        .returning();
      
      if (!updatedTenant || updatedTenant.length === 0) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      // Update or insert tenant settings with enabled modules
      const existingSettings = await storage.getTenantSettings(id);
      if (existingSettings) {
        await db
          .update(tenantSettings)
          .set({ enabledModules: enabledModules as any, updatedAt: new Date() })
          .where(eq(tenantSettings.tenantId, id));
      } else {
        await db
          .insert(tenantSettings)
          .values({
            tenantId: id,
            enabledModules: enabledModules as any,
          });
      }
      
      res.json({ 
        tenant: updatedTenant[0], 
        enabledModules 
      });
    } catch (error) {
      console.error("Error updating business configuration:", error);
      res.status(500).json({ message: "Failed to update business configuration" });
    }
  });

  // Toggle document signing addon (platform admin or tenant admin)
  app.post('/api/admin/tenants/:id/toggle-addon', isPlatformAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { addon, enabled } = req.body;
      
      if (!addon || typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "Addon name and enabled status are required" });
      }
      
      // Currently only document_signing is supported
      if (addon !== 'document_signing') {
        return res.status(400).json({ message: "Invalid addon. Only 'document_signing' is currently supported." });
      }
      
      const settings = await storage.getTenantSettings(id);
      const currentAddons = settings?.enabledAddons || [];
      
      let updatedAddons: string[];
      if (enabled) {
        // Add addon if not already present
        updatedAddons = currentAddons.includes(addon) ? currentAddons : [...currentAddons, addon];
      } else {
        // Remove addon
        updatedAddons = currentAddons.filter((a: string) => a !== addon);
      }
      
      // Update tenant settings
      if (settings) {
        await db
          .update(tenantSettings)
          .set({ enabledAddons: updatedAddons as any, updatedAt: new Date() })
          .where(eq(tenantSettings.tenantId, id));
      } else {
        await db
          .insert(tenantSettings)
          .values({
            tenantId: id,
            enabledAddons: updatedAddons as any,
          });
      }
      
      res.json({ 
        success: true,
        addon,
        enabled,
        message: `${addon} ${enabled ? 'enabled' : 'disabled'} successfully`
      });
    } catch (error) {
      console.error("Error toggling addon:", error);
      res.status(500).json({ message: "Failed to toggle addon" });
    }
  });

  // Refresh all account balances by recalculating from payment history
  // NOTE: This ONLY works for non-SMAX tenants. SMAX tenants have their balances
  // managed by SMAX sync and should NOT be processed here.
  app.post('/api/admin/refresh-balances', isPlatformAdmin, async (req: any, res) => {
    try {
      console.log('🔄 Starting balance refresh for all accounts...');
      console.log('Request body:', JSON.stringify(req.body));
      
      const { tenantId } = req.body;
      console.log('Tenant ID filter:', tenantId || 'ALL');
      
      // First, get all tenant settings to identify SMAX-enabled tenants
      const allTenantSettings = await db.select().from(tenantSettings);
      const smaxEnabledTenantIds = new Set(
        allTenantSettings
          .filter(ts => ts.smaxEnabled === true)
          .map(ts => ts.tenantId)
      );
      console.log(`🔍 Found ${smaxEnabledTenantIds.size} SMAX-enabled tenants (will be skipped)`);
      
      // Check if the specific tenant requested is SMAX-enabled
      if (tenantId && smaxEnabledTenantIds.has(tenantId)) {
        console.log(`⚠️ Tenant ${tenantId} has SMAX enabled - balances are managed by SMAX sync`);
        return res.json({
          success: true,
          message: "This tenant uses SMAX - balances are managed by SMAX sync. Access the accounts page to trigger a fresh sync from SMAX.",
          totalAccounts: 0,
          updatedCount: 0,
          errorCount: 0,
          skippedSmaxTenant: true,
          updates: [],
        });
      }
      
      // Get all accounts (optionally filtered by tenant)
      let allAccounts: any[];
      try {
        if (tenantId) {
          console.log('Fetching accounts for tenant:', tenantId);
          allAccounts = await db.select().from(accountsTable).where(eq(accountsTable.tenantId, tenantId));
        } else {
          console.log('Fetching all accounts from database...');
          allAccounts = await db.select().from(accountsTable);
        }
      } catch (fetchError: any) {
        console.error('❌ Error fetching accounts:', fetchError);
        return res.status(500).json({ message: "Failed to fetch accounts", error: fetchError.message });
      }
      
      console.log(`📊 Found ${allAccounts.length} accounts to process`);
      
      let updatedCount = 0;
      let errorCount = 0;
      let skippedSmaxCount = 0;
      const updates: any[] = [];
      
      for (const account of allAccounts) {
        try {
          // Skip accounts without tenantId - data integrity issue
          if (!account.tenantId) {
            console.log(`⏭️ Skipping account ${account.filenumber || account.id}: no tenantId`);
            continue;
          }
          
          // Skip accounts from SMAX-enabled tenants - their balances come from SMAX
          if (smaxEnabledTenantIds.has(account.tenantId)) {
            skippedSmaxCount++;
            continue;
          }
          
          // Get all completed payments for this account (with tenant scoping for security)
          const accountPayments = await db
            .select()
            .from(payments)
            .where(
              and(
                eq(payments.accountId, account.id),
                eq(payments.tenantId, account.tenantId),
                eq(payments.status, 'completed')
              )
            );
          
          // Sum up all completed payments
          const totalPaidCents = accountPayments.reduce((sum, p) => {
            const amount = p.amountCents || 0;
            return sum + (Number.isFinite(amount) ? amount : 0);
          }, 0);
          
          // Current balance IS the original balance (it never got reduced by payments)
          // So we just subtract all completed payments from the current balance
          const currentBalance = account.balanceCents || 0;
          const expectedBalance = Math.max(0, currentBalance - totalPaidCents);
          
          // Only update if there are payments to deduct
          if (totalPaidCents > 0) {
            await storage.updateAccount(account.id, {
              balanceCents: expectedBalance,
            });
            
            updates.push({
              accountId: account.id,
              filenumber: account.filenumber,
              previousBalance: currentBalance,
              newBalance: expectedBalance,
              totalPayments: totalPaidCents,
              paymentCount: accountPayments.length,
            });
            
            updatedCount++;
            console.log(`✅ Updated account ${account.filenumber || account.id}: ${currentBalance} -> ${expectedBalance} (${accountPayments.length} payments totaling ${totalPaidCents})`);
          }
        } catch (accountError) {
          console.error(`❌ Error processing account ${account.id}:`, accountError);
          errorCount++;
        }
      }
      
      console.log(`🔄 Balance refresh complete: ${updatedCount} updated, ${skippedSmaxCount} SMAX accounts skipped, ${errorCount} errors`);
      
      res.json({
        success: true,
        message: `Refreshed ${updatedCount} account balances (${skippedSmaxCount} SMAX accounts skipped)`,
        totalAccounts: allAccounts.length,
        updatedCount,
        skippedSmaxCount,
        errorCount,
        updates,
      });
    } catch (error) {
      console.error("Error refreshing balances:", error);
      res.status(500).json({ message: "Failed to refresh balances" });
    }
  });

  // Force SMAX sync for a specific tenant (platform admin only) - restores balances from SMAX
  app.post('/api/admin/force-smax-sync', isPlatformAdmin, async (req: any, res) => {
    try {
      const { tenantId } = req.body;
      
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant ID is required" });
      }
      
      console.log(`🔄 Force SMAX sync requested for tenant ${tenantId}`);
      
      // Check if SMAX is enabled for this tenant
      const settings = await storage.getTenantSettings(tenantId);
      if (!settings?.smaxEnabled) {
        return res.status(400).json({ 
          success: false,
          message: "SMAX is not enabled for this tenant" 
        });
      }
      
      // Get all accounts for this tenant
      const accounts = await storage.getAccountsByTenant(tenantId);
      console.log(`📊 Found ${accounts.length} accounts to sync from SMAX`);
      
      const syncResults = {
        total: accounts.length,
        synced: 0,
        failed: 0,
        skipped: 0,
        balancesRestored: 0,
        errors: [] as string[],
      };
      
      for (const account of accounts) {
        // SMAX uses filenumber - prefer filenumber, fall back to accountNumber for legacy data
        const smaxIdentifier = account.filenumber || account.accountNumber;
        if (!smaxIdentifier) {
          syncResults.skipped++;
          continue;
        }
        
        try {
          const smaxAccountData = await smaxService.getAccount(tenantId, smaxIdentifier);
          
          if (smaxAccountData) {
            const updateData: any = {};
            
            // Get balance from SMAX - find balance field case-insensitively
            let rawBalance: string | null = null;
            for (const [key, value] of Object.entries(smaxAccountData)) {
              const lowerKey = key.toLowerCase();
              if ((lowerKey === 'currentbalance' || lowerKey === 'balance' || 
                   lowerKey === 'balancedue' || lowerKey === 'totalbalance' ||
                   lowerKey === 'amountdue' || lowerKey === 'amountowed') && 
                  value !== null && value !== undefined) {
                rawBalance = String(value);
                console.log(`💰 Found SMAX balance field "${key}" = "${value}"`);
                break;
              }
            }
            
            if (rawBalance !== null) {
              const balanceFloat = parseFloat(rawBalance.replace(/[^0-9.-]/g, ''));
              if (Number.isFinite(balanceFloat)) {
                const newBalanceCents = rawBalance.includes('.')
                  ? Math.round(balanceFloat * 100)
                  : Math.round(balanceFloat);
                updateData.balanceCents = Math.max(0, newBalanceCents);
                syncResults.balancesRestored++;
                console.log(`💰 Balance restored for ${smaxIdentifier}: ${newBalanceCents} cents`);
              }
            }
            
            // Get status from SMAX
            if (smaxAccountData.statusname) {
              updateData.status = smaxAccountData.statusname;
            }
            
            if (Object.keys(updateData).length > 0) {
              await storage.updateAccount(account.id, updateData);
              syncResults.synced++;
            }
          } else {
            syncResults.skipped++;
          }
        } catch (err: any) {
          syncResults.failed++;
          syncResults.errors.push(`${smaxIdentifier}: ${err.message}`);
        }
      }
      
      console.log(`✅ SMAX sync complete: ${syncResults.synced} synced, ${syncResults.balancesRestored} balances restored`);
      
      res.json({
        success: true,
        message: `SMAX sync complete: ${syncResults.balancesRestored} balances restored`,
        ...syncResults,
      });
    } catch (error) {
      console.error("Error forcing SMAX sync:", error);
      res.status(500).json({ message: "Failed to sync from SMAX" });
    }
  });

  // Twilio webhook endpoint for SMS delivery tracking and usage
  app.post('/api/webhooks/twilio', async (req, res) => {
    try {
      const timestamp = new Date().toISOString();
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📱 TWILIO DELIVERY WEBHOOK RECEIVED - ${timestamp}`);
      console.log(`${'='.repeat(80)}`);
      console.log('Full webhook body:', JSON.stringify(req.body, null, 2));
      
      const messageSid = req.body.MessageSid || req.body.SmsSid;
      const status = (req.body.MessageStatus || req.body.SmsStatus || '').toLowerCase();
      
      console.log(`📊 Parsed values:`);
      console.log(`   MessageSid: ${messageSid}`);
      console.log(`   Status: ${status}`);

      if (!messageSid) {
        console.error('❌ Twilio webhook missing MessageSid');
        return res.status(400).json({ message: 'Missing MessageSid' });
      }

      const relevantStatuses = new Set(['sent', 'delivered', 'undelivered', 'failed']);
      if (!relevantStatuses.has(status)) {
        console.log(`⏭️  Twilio webhook status "${status}" ignored (not in: sent, delivered, undelivered, failed)`);
        return res.status(200).json({ message: 'Status ignored' });
      }

      const segmentsRaw = req.body.NumSegments || req.body.SmsSegments || '1';
      const segmentsParsed = Number.parseInt(Array.isArray(segmentsRaw) ? segmentsRaw[0] : segmentsRaw, 10);
      const quantity = Number.isFinite(segmentsParsed) && segmentsParsed > 0 ? segmentsParsed : 1;
      
      console.log(`📊 SMS Segments detected: ${quantity} (raw: ${segmentsRaw})`);

      let tenantId = (req.body.TenantId || req.body.tenantId) as string | undefined;
      const trackingInfo = await storage.findSmsTrackingByExternalId(messageSid);

      if (!tenantId) {
        tenantId = trackingInfo?.tenantId ?? undefined;
      }

      if (trackingInfo?.tracking) {
        console.log(`✅ Found tracking record: ID=${trackingInfo.tracking.id}`);
        const normalizedStatus = status === 'undelivered' ? 'failed' : status;
        const updates: Partial<SmsTracking> = {
          status: normalizedStatus as SmsTracking['status'],
          segments: quantity, // Store segment count from Twilio
        };

        if (status === 'delivered') {
          updates.deliveredAt = new Date();
          console.log(`📨 Marking as DELIVERED at ${updates.deliveredAt}`);
        }

        if (status === 'failed' || status === 'undelivered') {
          const errorCode = req.body.ErrorCode;
          const errorMessage = req.body.ErrorMessage || errorCode;
          if (errorMessage) {
            updates.errorMessage = errorMessage;
          }
          console.log(`❌ Marking as FAILED: ${errorMessage || 'No error message'}`);
          
          // Track undeliverable phone numbers for blocking future attempts
          const toPhone = req.body.To;
          if (toPhone && tenantId) {
            // Error codes that indicate permanent delivery failure
            // https://www.twilio.com/docs/api/errors#error-codes
            const permanentFailureCodes = [
              '21211', // Invalid 'To' Phone Number
              '21610', // Message cannot be sent to this phone number (opt-out)
              '21614', // 'To' number is not a valid mobile number
              '21408', // Permission to send to this phone number is denied
              '30003', // Unreachable destination handset (can be temporary, but often permanent)
              '30005', // Unknown destination handset (likely invalid)
              '30006', // Landline or unreachable carrier
              '30007', // Carrier violation
            ];
            
            const isPermanentFailure = permanentFailureCodes.includes(errorCode);
            if (isPermanentFailure) {
              try {
                // Normalize phone number before storing (storage.addSmsBlockedNumber also normalizes, but be explicit)
                const normalizedToPhone = toPhone.replace(/\D/g, '');
                await storage.addSmsBlockedNumber(
                  tenantId,
                  normalizedToPhone,
                  errorCode === '21610' ? 'opted_out' : 'undeliverable',
                  errorCode,
                  errorMessage
                );
                console.log(`🚫 Phone ${normalizedToPhone} added to blocked numbers (error: ${errorCode})`);
              } catch (blockError) {
                console.error('Failed to add blocked number:', blockError);
              }
            }
          }
        }

        console.log(`💾 Updating tracking record with ${quantity} segments:`, updates);
        await storage.updateSmsTracking(trackingInfo.tracking.id, updates);
        console.log(`✅ Tracking record updated successfully`);

        // Update campaign metrics when tracking status changes
        const campaignId = trackingInfo.tracking.campaignId;
        if (campaignId) {
          try {
            await updateSmsCampaignMetrics(campaignId, {
              tenantId,
              ensureStatus: true,
            });
          } catch (error) {
            console.error('Error updating SMS campaign metrics:', error);
          }
        }
      }

      if (!tenantId) {
        console.warn('⚠️  Twilio webhook missing tenant context', { messageSid, status });
        console.warn('   → Webhook body:', JSON.stringify(req.body, null, 2));
        console.warn('   → Tracking info:', trackingInfo ? 'Found but no tenantId' : 'Not found');
        return res.status(200).json({ message: 'No tenant resolved' });
      }

      console.log(`✅ Recording SMS usage: tenant=${tenantId}, segments=${quantity}, sid=${messageSid}`);
      
      const usageEvent = {
        tenantId,
        provider: 'twilio',
        messageType: 'sms',
        quantity,
        externalMessageId: messageSid,
        occurredAt: new Date(),
        metadata: req.body,
      };
      
      console.log(`📊 SMS Usage Event Details:`, JSON.stringify({
        tenantId,
        segments: quantity,
        messageSid,
        status,
        timestamp: new Date().toISOString()
      }, null, 2));
      
      await storage.recordMessagingUsageEvent(usageEvent as any);

      console.log(`✅ Twilio webhook processed successfully - ${quantity} SMS segments recorded to database for tenant ${tenantId}`);
      console.log(`${'='.repeat(80)}\n`);
      res.status(200).json({ message: 'Webhook processed' });
    } catch (error) {
      console.error('❌ Twilio webhook error:', error);
      console.log(`${'='.repeat(80)}\n`);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  });

  // Postmark webhook endpoints for email tracking
  app.post('/api/webhooks/postmark', async (req, res) => {
    try {
      console.log('Received Postmark webhook:', JSON.stringify(req.body, null, 2));
      
      const events = Array.isArray(req.body) ? req.body : [req.body];
      
      for (const event of events) {
        await processPostmarkWebhook(event);
      }
      
      res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (error) {
      console.error('Postmark webhook error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Webhook processing failed', error: errorMessage });
    }
  });

  // Process inbound email from consumer
  async function processInboundEmail(event: any) {
    console.log('📨 Processing inbound email from Postmark');
    
    const {
      From,
      FromFull,
      To,
      Subject,
      HtmlBody,
      TextBody,
      MessageID,
      Date: receivedDate,
      Headers,
    } = event;

    // Extract sender email and name
    const fromEmail = (From || '').toLowerCase().trim();
    const fromName = FromFull?.Name || fromEmail.split('@')[0];
    
    // Extract the To address to determine which tenant this belongs to
    const toEmail = (To || '').toLowerCase().trim();
    
    console.log('📧 Email details:', {
      from: fromEmail,
      to: toEmail,
      subject: Subject,
    });

    // Find the tenant by matching the To address with tenant slug or custom sender email
    const allTenants = await storage.getAllTenants();
    let matchedTenant = null;
    
    for (const tenant of allTenants) {
      const tenantEmail = `${tenant.slug}@chainsoftwaregroup.com`;
      if (toEmail.includes(tenantEmail) || (tenant.customSenderEmail && toEmail.includes(tenant.customSenderEmail))) {
        matchedTenant = tenant;
        break;
      }
    }

    if (!matchedTenant) {
      console.warn('⚠️ Could not match inbound email to any tenant:', toEmail);
      return;
    }

    console.log('✅ Matched tenant:', matchedTenant.name);

    // Try to find the consumer by email
    const consumer = await storage.getConsumerByEmailAndTenant(fromEmail, matchedTenant.slug);
    
    // Store the reply
    await storage.createEmailReply({
      tenantId: matchedTenant.id,
      consumerId: consumer?.id || null,
      fromEmail,
      toEmail,
      subject: Subject || '(No Subject)',
      textBody: TextBody || '',
      htmlBody: HtmlBody || '',
      messageId: MessageID,
      isRead: false,
    });

    console.log('✅ Email reply stored successfully');
    
    // Check if auto-response is enabled for this tenant
    const [autoResponseCfg] = await db
      .select()
      .from(autoResponseConfig)
      .where(eq(autoResponseConfig.tenantId, matchedTenant.id))
      .limit(1);
    
    if (autoResponseCfg?.enabled && autoResponseCfg?.enableEmailAutoResponse && autoResponseCfg?.openaiApiKey && !autoResponseCfg?.testMode) {
      console.log('🤖 Auto-response is enabled, generating AI response...');
      
      try {
        const { AutoResponseService } = await import('./autoResponseService');
        const service = new AutoResponseService(matchedTenant.id);
        
        // Generate auto-response
        const autoResponse = await service.generateResponse(
          'email',
          TextBody || HtmlBody || '',
          consumer?.id
        );
        
        if (autoResponse) {
          // Send auto-response via email
          await emailService.sendEmail({
            to: fromEmail,
            subject: `Re: ${Subject || '(No Subject)'}`,
            html: `<p>${autoResponse.replace(/\n/g, '<br>')}</p>`,
            tenantId: matchedTenant.id,
          });
          
          console.log('✅ Auto-response sent successfully');
        }
      } catch (error) {
        console.error('❌ Auto-response generation failed:', error);
        // Don't fail the webhook - just log the error
      }
    }
  }

  // Process individual Postmark webhook events
  async function processPostmarkWebhook(event: any) {
    const { RecordType, MessageID, Recipient, Tag, Metadata, From, To, Subject, TextBody, HtmlBody } = event;

    // Detect inbound email (consumer replies)
    const isInboundEmail = RecordType === 'Inbound' || (From && To && (TextBody || HtmlBody));
    
    if (isInboundEmail) {
      console.log('📨 Detected inbound email, routing to inbound handler...');
      return await processInboundEmail(event);
    }

    // Handle tracking events (delivery, bounce, open, etc.)
    const campaignId = Metadata?.campaignId;
    const tenantId = Metadata?.tenantId as string | undefined;
    
    console.log('📧 Postmark Event Details:');
    console.log('  - RecordType:', RecordType);
    console.log('  - MessageID:', MessageID);
    console.log('  - Tag:', Tag);
    console.log('  - Metadata received:', JSON.stringify(Metadata, null, 2));
    console.log('  - Extracted campaignId:', campaignId);
    console.log('  - Extracted tenantId:', tenantId);
    
    const trackingData = {
      messageId: MessageID,
      recipient: Recipient,
      campaignId,
      eventType: RecordType,
      timestamp: new Date(),
      metadata: Metadata,
    };

    // Store tracking event in database (using the correct method name)
    console.log('Email tracking event:', trackingData);

    const normalizedRecordType = (RecordType || '').toLowerCase();
    const isDeliverabilityEvent = ['delivery', 'bounce'].includes(normalizedRecordType);

    if (tenantId && isDeliverabilityEvent) {
      const occurredAtRaw = event.DeliveredAt || event.ReceivedAt || event.BouncedAt || event.SubmittedAt;
      const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();

      await storage.recordMessagingUsageEvent({
        tenantId,
        provider: 'postmark',
        messageType: 'email',
        quantity: 1,
        externalMessageId: MessageID,
        occurredAt,
        metadata: event,
      });
    }

    // Update email_logs table based on event type
    if (MessageID) {
      const updateData: any = {};
      
      switch (normalizedRecordType) {
        case 'delivery':
          updateData.status = 'delivered';
          updateData.deliveredAt = event.DeliveredAt ? new Date(event.DeliveredAt) : new Date();
          break;
        case 'bounce':
          updateData.status = 'bounced';
          updateData.bouncedAt = event.BouncedAt ? new Date(event.BouncedAt) : new Date();
          updateData.bounceReason = event.Description || event.Type || 'Unknown bounce reason';
          break;
        case 'spamcomplaint':
          updateData.status = 'complained';
          updateData.complainedAt = new Date();
          updateData.complaintReason = event.Description || 'Spam complaint received';
          break;
        case 'open':
          updateData.status = 'opened';
          updateData.openedAt = event.ReceivedAt ? new Date(event.ReceivedAt) : new Date();
          break;
      }

      // Update email_logs if we have update data
      if (Object.keys(updateData).length > 0) {
        try {
          await db
            .update(emailLogs)
            .set(updateData)
            .where(eq(emailLogs.messageId, MessageID));
        } catch (logUpdateError) {
          console.error('Error updating email log:', logUpdateError);
        }
      }
    }

    // Update campaign metrics
    if (campaignId) {
      await updateCampaignMetrics(campaignId, RecordType);
    }

    // Notify SMAX for email open events using InsertNoteline
    if (normalizedRecordType === 'open') {
      try {
        const { smaxService } = await import('./smaxService');
        
        // Ensure we have tenantId - fetch from email log if not in metadata
        let resolvedTenantId = tenantId;
        if (!resolvedTenantId && MessageID) {
          const [emailLog] = await db
            .select()
            .from(emailLogs)
            .where(eq(emailLogs.messageId, MessageID))
            .limit(1);
          
          if (emailLog?.tenantId) {
            resolvedTenantId = emailLog.tenantId;
            console.log(`📋 Retrieved tenantId ${resolvedTenantId} from email log for MessageID ${MessageID}`);
          }
        }
        
        if (!resolvedTenantId) {
          console.log('ℹ️ Skipping SMAX email tracking - no tenantId available');
          return;
        }
        
        let fileNumber = (Metadata?.filenumber || '').trim();

        // Detect legacy emails where filenumber was incorrectly set to accountNumber
        if (fileNumber && Metadata?.accountNumber && fileNumber === Metadata.accountNumber) {
          console.log(`⚠️ Legacy email detected: filenumber equals accountNumber (${fileNumber}), performing lookup for correct filenumber`);
          fileNumber = ''; // Clear so the lookup will run
        }

        // If no filenumber in metadata but we have accountNumber, look up the account to get filenumber
        if (!fileNumber && Metadata?.accountNumber) {
          const [account] = await db
            .select()
            .from(accountsTable)
            .where(
              and(
                eq(accountsTable.accountNumber, Metadata.accountNumber),
                eq(accountsTable.tenantId, resolvedTenantId)
              )
            )
            .limit(1);
          
          if (account?.filenumber) {
            fileNumber = account.filenumber.trim();
            console.log(`📋 Found filenumber ${fileNumber} via accountNumber lookup for ${Metadata.accountNumber}`);
          }
        }

        // If still no filenumber, try to get it from the consumer's accounts
        if (!fileNumber && Metadata?.consumerId) {
          const accounts = await storage.getAccountsByConsumer(Metadata.consumerId);
          const accountWithFileNumber = accounts.find(acc => acc.filenumber && acc.filenumber.trim());
          if (accountWithFileNumber?.filenumber) {
            fileNumber = accountWithFileNumber.filenumber.trim();
            console.log(`📋 Found filenumber ${fileNumber} via consumer lookup for consumer ${Metadata.consumerId}`);
          }
        }

        if (fileNumber) {
          console.log('📤 Sending SMAX note:', {
            filenumber: fileNumber,
            collectorname: 'System',
            logmessage: `Email opened by ${Recipient}`,
          });

          // Use InsertNoteline per SMAX API spec - email tracking should be logged as notes
          const smaxResult = await smaxService.insertNote(resolvedTenantId, {
            filenumber: fileNumber,
            collectorname: 'System',
            logmessage: `Email opened by ${Recipient}`,
          });
          
          if (smaxResult) {
            console.log('✅ SMAX note inserted:', smaxResult);
          } else {
            console.log('⚠️ SMAX note insertion returned no result');
          }
        } else {
          console.log('⚠️ Skipping SMAX email tracking - no filenumber found after all lookup attempts');
        }
      } catch (smaxError) {
        console.warn('⚠️ SMAX email tracking notification failed:', smaxError);
      }
    }
  }

  // Update campaign metrics based on event type
  async function updateCampaignMetrics(campaignId: string, eventType: string) {
    try {
      console.log(`🔄 Updating campaign ${campaignId} for event ${eventType}`);
      
      const normalizedEventType = (eventType || '').toLowerCase();
      
      // Map event types to the appropriate increment
      let incrementField: string | null = null;
      
      switch (normalizedEventType) {
        case 'delivery':
          incrementField = 'totalDelivered';
          break;
        case 'open':
          incrementField = 'totalOpened';
          break;
        case 'click':
          incrementField = 'totalClicked';
          break;
        case 'bounce':
        case 'spamcomplaint':
          incrementField = 'totalErrors';
          break;
      }
      
      if (incrementField) {
        // Use SQL to increment the counter atomically
        const result = await db
          .update(emailCampaigns)
          .set({
            [incrementField]: sql`${emailCampaigns[incrementField as keyof typeof emailCampaigns]} + 1`
          })
          .where(eq(emailCampaigns.id, campaignId))
          .returning();
        
        console.log(`✅ Campaign ${campaignId} updated: ${incrementField} incremented`);
        if (result.length > 0) {
          console.log(`   New ${incrementField}:`, result[0][incrementField as keyof typeof result[0]]);
        }
      } else {
        console.log(`⚠️ No metric update for event type: ${eventType}`);
      }
    } catch (error) {
      console.error('❌ Error updating campaign metrics:', error);
    }
  }

  // Update SMS campaign metrics by counting tracking records with efficient SQL aggregation
  async function getSmsCampaignMetrics(campaignId: string) {
    try {
      return await storage.getSmsCampaignMetrics(campaignId);
    } catch (error) {
      console.error('❌ Error getting SMS campaign metrics:', error);
      return {
        totalSent: 0,
        totalDelivered: 0,
        totalErrors: 0,
        totalOptOuts: 0,
      };
    }
  }

  async function updateSmsCampaignMetrics(
    campaignId: string,
    options: { tenantId?: string | null; ensureStatus?: boolean } = {}
  ) {
    try {
      console.log(`🔄 Updating SMS campaign ${campaignId} metrics from tracking records`);

      // Use SQL aggregation to efficiently count by status
      const metrics = await getSmsCampaignMetrics(campaignId);
      
      // Update the campaign with actual counts
      await storage.updateSmsCampaign(campaignId, {
        totalSent: metrics.totalSent,
        totalDelivered: metrics.totalDelivered,
        totalErrors: metrics.totalErrors,
        totalOptOuts: metrics.totalOptOuts,
      });
      
      console.log(`✅ SMS campaign ${campaignId} metrics updated:`, {
        totalSent: metrics.totalSent,
        totalDelivered: metrics.totalDelivered,
        totalErrors: metrics.totalErrors,
        totalOptOuts: metrics.totalOptOuts
      });

      if (options.ensureStatus) {
        const tenantId = options.tenantId ?? null;
        const campaign = tenantId
          ? await storage.getSmsCampaignById(campaignId, tenantId)
          : storage.getSmsCampaignByIdAdmin
            ? await storage.getSmsCampaignByIdAdmin(campaignId)
            : undefined;

        if (campaign) {
          const totalRecipients = campaign.totalRecipients || 0;
          const progressCount = metrics.totalSent + metrics.totalErrors;

          if (
            totalRecipients > 0 &&
            progressCount >= totalRecipients &&
            !['completed', 'failed'].includes((campaign.status || '').toLowerCase())
          ) {
            await storage.updateSmsCampaign(campaignId, {
              status: 'completed',
              completedAt: campaign.completedAt || new Date(),
              totalSent: metrics.totalSent,
              totalDelivered: metrics.totalDelivered,
              totalErrors: metrics.totalErrors,
              totalOptOuts: metrics.totalOptOuts,
            });

            console.log(
              `✅ Auto-completed SMS campaign ${campaignId} after webhook progress reached ${progressCount}/${totalRecipients}`
            );
          }
        }
      }
    } catch (error) {
      console.error('❌ Error updating SMS campaign metrics:', error);
    }
  }

  // Twilio inbound SMS webhook for handling replies from consumers
  app.post('/api/webhooks/twilio-inbound', async (req, res) => {
    try {
      console.log('📱 Received inbound SMS from Twilio');
      
      const {
        From,
        To,
        Body,
        MessageSid,
        NumMedia,
        MediaUrl0,
        MediaUrl1,
        MediaUrl2,
      } = req.body;

      const fromPhone = (From || '').trim();
      const toPhone = (To || '').trim();
      const messageBody = Body || '';
      
      console.log('💬 SMS details:', {
        from: fromPhone,
        to: toPhone,
        body: messageBody.substring(0, 50),
      });

      // Find the tenant by matching the To phone number
      const allTenants = await storage.getAllTenants();
      let matchedTenant = null;
      
      for (const tenant of allTenants) {
        if (tenant.twilioPhoneNumber && toPhone.includes(tenant.twilioPhoneNumber)) {
          matchedTenant = tenant;
          break;
        }
      }

      if (!matchedTenant) {
        console.warn('⚠️ Could not match inbound SMS to any tenant:', toPhone);
        return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      console.log('✅ Matched tenant:', matchedTenant.name);

      // Normalize phone number for consistent storage and lookup
      // Strip +, whitespace, non-digits, and optionally leading 1 for US numbers
      const normalizePhone = (phone: string): string => {
        const digits = phone.replace(/\D/g, '');
        // Remove leading 1 for US numbers (e.g., +15551234567 -> 5551234567)
        return digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
      };
      const normalizedFromPhone = normalizePhone(fromPhone);

      // Check for STOP/opt-out keywords (TCPA compliance)
      // Normalize: uppercase, strip all non-alpha characters, check for exact match
      const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
      const messageNormalized = messageBody.trim().toUpperCase().replace(/[^A-Z]/g, '');
      const isOptOut = optOutKeywords.includes(messageNormalized);
      
      if (isOptOut) {
        console.log('🛑 SMS OPT-OUT detected from:', fromPhone, '(normalized:', normalizedFromPhone, ')');
      }

      // Try to find the consumer by phone - use the new efficient lookup
      const matchedConsumers = await storage.getConsumersByPhoneNumber(normalizedFromPhone, matchedTenant.id);
      const consumer = matchedConsumers[0]; // Take first match for this tenant
      
      // If this is an opt-out, mark the consumer as opted out
      if (isOptOut && consumer) {
        try {
          await storage.markConsumerSmsOptedOut(consumer.id, true);
          console.log(`✅ Consumer ${consumer.id} marked as SMS opted out`);
        } catch (optOutError) {
          console.error('❌ Failed to mark consumer as opted out:', optOutError);
        }
      }
      
      // Also add to blocked numbers for this tenant (even if no consumer match)
      // This ensures even unrecognized numbers that reply STOP are blocked
      if (isOptOut) {
        try {
          await storage.addSmsBlockedNumber(
            matchedTenant.id, 
            normalizedFromPhone, // Use normalized phone number for consistent blocking
            'opted_out',
            'STOP',
            `Consumer replied: ${messageBody}`
          );
          console.log(`✅ Phone ${normalizedFromPhone} added to blocked numbers for tenant ${matchedTenant.name}`);
        } catch (blockError) {
          console.error('❌ Failed to add phone to blocked list:', blockError);
        }
      }

      // Collect media URLs if present
      const mediaUrls = [];
      const numMedia = parseInt(NumMedia || '0', 10);
      if (numMedia > 0) {
        if (MediaUrl0) mediaUrls.push(MediaUrl0);
        if (MediaUrl1) mediaUrls.push(MediaUrl1);
        if (MediaUrl2) mediaUrls.push(MediaUrl2);
      }
      
      // Store the SMS reply
      await storage.createSmsReply({
        tenantId: matchedTenant.id,
        consumerId: consumer?.id || null,
        fromPhone,
        toPhone,
        messageBody,
        messageSid: MessageSid,
        numMedia: numMedia,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : null,
        isRead: false,
      });

      console.log('✅ SMS reply stored successfully');

      // Send SMS reply to SMAX as a note
      try {
        // Get tenant settings to check if SMAX is enabled
        const settings = await storage.getSettings(matchedTenant.id);
        
        if (settings?.smaxEnabled) {
          let accountWithFilenumber = null;
          let senderName = fromPhone;
          
          if (consumer?.id) {
            // Consumer matched - get their accounts
            const accounts = await storage.getAccountsByConsumer(consumer.id);
            accountWithFilenumber = accounts.find(acc => acc.filenumber);
            senderName = `${consumer.firstName || ''} ${consumer.lastName || ''}`.trim() || fromPhone;
          } else {
            // No consumer match - try to find account by phone number
            console.log('⚠️ Consumer not matched, attempting to find account by phone number');
            const allAccounts = await storage.getAccountsByTenant(matchedTenant.id);
            accountWithFilenumber = allAccounts.find(acc => 
              acc.filenumber && acc.consumer?.phone && fromPhone.includes(acc.consumer.phone.replace(/\D/g, ''))
            );
            
            if (accountWithFilenumber?.consumer) {
              senderName = `${accountWithFilenumber.consumer.firstName || ''} ${accountWithFilenumber.consumer.lastName || ''}`.trim() || fromPhone;
            }
          }
          
          if (accountWithFilenumber?.filenumber) {
            const mediaNote = numMedia > 0 ? ` [${numMedia} media attachment(s)]` : '';
            
            await smaxService.insertNote(matchedTenant.id, {
              filenumber: accountWithFilenumber.filenumber,
              collectorname: 'System',
              logmessage: `SMS Reply from ${senderName}: ${messageBody}${mediaNote}`,
            });
            
            console.log(`📝 SMS reply logged to SMAX for filenumber: ${accountWithFilenumber.filenumber}`);
          } else {
            console.warn(`⚠️ No account with filenumber found for phone ${fromPhone} - skipping SMAX note`);
          }
        }
      } catch (smaxError) {
        console.error('❌ Failed to log SMS reply to SMAX:', smaxError);
        // Non-blocking - don't fail the webhook if SMAX sync fails
      }
      
      // Respond with TwiML (empty response means no auto-reply)
      res.set('Content-Type', 'text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (error) {
      console.error('❌ Inbound SMS webhook error:', error);
      res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  });

  // Postmark inbound email webhook for handling replies from consumers
  app.post('/api/webhooks/postmark-inbound', async (req, res) => {
    try {
      console.log('📨 Received inbound email from Postmark');
      
      const {
        From,
        FromFull,
        To,
        Subject,
        HtmlBody,
        TextBody,
        MessageID,
        Date: receivedDate,
        Headers,
      } = req.body;

      // Extract sender email and name
      const fromEmail = (From || '').toLowerCase().trim();
      const fromName = FromFull?.Name || fromEmail.split('@')[0];
      // Declare toEmail at top level so it's available for createEmailReply
      const toEmail = (To || '').toLowerCase().trim();
      
      console.log('📧 Email details:', {
        from: fromEmail,
        to: toEmail,
        subject: Subject,
      });

      // Find the original email by looking at In-Reply-To header to determine which tenant this belongs to
      let matchedTenant = null;
      let inReplyToMessageId = null;
      
      // Extract In-Reply-To header from Headers array
      if (Headers && Array.isArray(Headers)) {
        const inReplyToHeader = Headers.find(h => h.Name === 'In-Reply-To');
        if (inReplyToHeader) {
          // Normalize the MessageID: remove angle brackets and extract the GUID
          // Postmark sends: <guid@pm.mtasv.net> but we store just the GUID
          const rawValue = inReplyToHeader.Value || '';
          inReplyToMessageId = rawValue.replace(/[<>]/g, '').split('@')[0];
          console.log('📎 In-Reply-To (normalized):', inReplyToMessageId);
          
          // Look up the original email in emailLogs to find the tenant
          const [originalEmail] = await db
            .select({ tenantId: emailLogs.tenantId })
            .from(emailLogs)
            .where(eq(emailLogs.messageId, inReplyToMessageId))
            .limit(1);
          
          if (originalEmail) {
            const tenant = await storage.getTenant(originalEmail.tenantId);
            if (tenant) {
              matchedTenant = tenant;
              console.log('✅ Matched tenant via In-Reply-To:', matchedTenant.name);
            }
          }
        }
      }

      // Fallback: try to match by To address (for older emails or direct sends)
      if (!matchedTenant) {
        const allTenants = await storage.getAllTenants();
        
        for (const tenant of allTenants) {
          const tenantEmail = `${tenant.slug}@chainsoftwaregroup.com`;
          if (toEmail.includes(tenantEmail) || (tenant.customSenderEmail && toEmail.includes(tenant.customSenderEmail))) {
            matchedTenant = tenant;
            console.log('✅ Matched tenant via To address:', matchedTenant.name);
            break;
          }
        }
      }

      if (!matchedTenant) {
        console.warn('⚠️ Could not match inbound email to any tenant');
        return res.status(200).json({ message: 'Email received but no tenant matched' });
      }

      // Try to find the consumer by email
      const consumer = await storage.getConsumerByEmailAndTenant(fromEmail, matchedTenant.slug);
      
      // Store the reply with error logging
      try {
        console.log('📝 Storing email reply:', {
          tenantId: matchedTenant.id,
          consumerId: consumer?.id || null,
          fromEmail,
          toEmail,
          subject: Subject || '(No Subject)',
          messageId: MessageID,
        });
        
        await storage.createEmailReply({
          tenantId: matchedTenant.id,
          consumerId: consumer?.id || null,
          fromEmail,
          toEmail,
          subject: Subject || '(No Subject)',
          textBody: TextBody || '',
          htmlBody: HtmlBody || '',
          messageId: MessageID,
          isRead: false,
        });

        console.log('✅ Email reply stored successfully');
      } catch (storeError) {
        console.error('❌ Failed to store email reply:', storeError);
        throw storeError;
      }
      
      // Check if auto-response is enabled for this tenant
      const [autoResponseCfg] = await db
        .select()
        .from(autoResponseConfig)
        .where(eq(autoResponseConfig.tenantId, matchedTenant.id))
        .limit(1);
      
      if (autoResponseCfg?.enabled && autoResponseCfg?.enableEmailAutoResponse && autoResponseCfg?.openaiApiKey && !autoResponseCfg?.testMode) {
        console.log('🤖 Auto-response is enabled, generating AI response...');
        
        try {
          const { AutoResponseService } = await import('./autoResponseService');
          const service = new AutoResponseService(matchedTenant.id);
          
          // Generate auto-response
          const autoResponse = await service.generateResponse(
            'email',
            TextBody || HtmlBody || '',
            consumer?.id
          );
          
          if (autoResponse) {
            // Send auto-response via email
            await emailService.sendEmail({
              to: fromEmail,
              subject: `Re: ${Subject || '(No Subject)'}`,
              html: `<p>${autoResponse.replace(/\n/g, '<br>')}</p>`,
              tenantId: matchedTenant.id,
            });
            
            console.log('✅ Auto-response sent successfully');
          }
        } catch (error) {
          console.error('❌ Auto-response generation failed:', error);
          // Don't fail the webhook - just log the error
        }
      }
      
      res.status(200).json({ message: 'Reply stored successfully' });
    } catch (error) {
      console.error('❌ Inbound email webhook error:', error);
      res.status(500).json({ message: 'Failed to process inbound email' });
    }
  });

  // Document signing routes
  // Create signature request (admin)
  app.post('/api/signature-requests', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Check if document signing addon is enabled
      const enabledAddons = await storage.getEnabledAddons(tenantId);
      if (!enabledAddons.includes('document_signing')) {
        return res.status(403).json({ message: "Document signing feature is not enabled for your organization" });
      }

      const { consumerId, accountId, documentId, title, description, expiresAt } = req.body;

      if (!consumerId || !documentId || !title) {
        return res.status(400).json({ message: "Consumer ID, document ID, and title are required" });
      }

      // Verify consumer belongs to this tenant
      const consumer = await storage.getConsumer(consumerId);
      if (!consumer || consumer.tenantId !== tenantId) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      // Verify document belongs to this tenant
      const documents = await storage.getDocumentsByTenant(tenantId);
      const document = documents.find(d => d.id === documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Verify account belongs to this tenant (if provided)
      if (accountId) {
        const account = await storage.getAccount(accountId);
        if (!account || account.tenantId !== tenantId) {
          return res.status(404).json({ message: "Account not found" });
        }
      }

      const signatureRequest = await storage.createSignatureRequest({
        tenantId,
        consumerId,
        accountId: accountId || null,
        documentId,
        title,
        description: description || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        consentText: `By signing this document, I agree that this electronic signature is the legal equivalent of my manual signature. I consent to be legally bound by this document's terms and conditions.`,
      });

      // Send email notification to consumer
      try {
        const tenant = await storage.getTenant(tenantId);
        if (tenant && consumer.email) {
          const tenantSettings = await storage.getTenantSettings(tenantId);
          const consumerPortalSettings = tenantSettings?.consumerPortalSettings;
          
          const consumerLoginUrl = resolveConsumerPortalUrl({
            tenantSlug: tenant.slug,
            consumerPortalSettings,
            baseUrl: ensureBaseUrl(req),
          });
          
          await emailService.sendEmail({
            to: consumer.email,
            from: tenantSettings?.contactEmail || `noreply@${tenant.slug}.replit.app`,
            subject: `Action Required: Sign ${title}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1e40af;">Signature Requested</h2>
                <p>Hello ${consumer.firstName || consumer.email},</p>
                <p>You have a new document that requires your electronic signature:</p>
                <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #92400e;">${title}</h3>
                  ${description ? `<p style="color: #78350f; margin-bottom: 0;">${description}</p>` : ''}
                </div>
                <p>To review and sign this document:</p>
                <ol style="line-height: 1.8;">
                  <li>Click the button below to log in to your portal</li>
                  <li>Navigate to the "Documents" section</li>
                  <li>Click "Sign Now" on the pending document</li>
                </ol>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${consumerLoginUrl}" style="background-color: #f59e0b; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                    Access Your Portal
                  </a>
                </div>
                ${expiresAt ? `<p style="color: #dc2626; font-weight: bold;">⚠️ This signature request expires on ${new Date(expiresAt).toLocaleDateString()}</p>` : ''}
                <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                  If you have any questions, please contact us.
                </p>
              </div>
            `,
            text: `
              Signature Requested
              
              Hello ${consumer.firstName || consumer.email},
              
              You have a new document that requires your electronic signature:
              
              ${title}
              ${description ? description : ''}
              
              To review and sign this document:
              1. Visit: ${consumerLoginUrl}
              2. Log in to your portal
              3. Navigate to the "Documents" section
              4. Click "Sign Now" on the pending document
              
              ${expiresAt ? `⚠️ This signature request expires on ${new Date(expiresAt).toLocaleDateString()}` : ''}
              
              If you have any questions, please contact us.
            `,
          });
          console.log(`📧 Signature request notification sent to ${consumer.email}`);
        }
      } catch (emailError) {
        console.error("Error sending signature request notification:", emailError);
        // Don't fail the request if email fails - signature request was created successfully
      }

      res.json(signatureRequest);
    } catch (error) {
      console.error("Error creating signature request:", error);
      res.status(500).json({ message: "Failed to create signature request" });
    }
  });

  // Get signature requests for tenant (admin)
  app.get('/api/signature-requests', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Check if document signing addon is enabled
      const enabledAddons = await storage.getEnabledAddons(tenantId);
      if (!enabledAddons.includes('document_signing')) {
        return res.status(403).json({ message: "Document signing feature is not enabled for your organization" });
      }

      const requests = await storage.getSignatureRequestsByTenant(tenantId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching signature requests:", error);
      res.status(500).json({ message: "Failed to fetch signature requests" });
    }
  });

  // Get signature request by ID (consumer or admin)
  app.get('/api/signature-requests/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const request = await storage.getSignatureRequestById(id);

      if (!request) {
        return res.status(404).json({ message: "Signature request not found" });
      }

      // Mark as viewed
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
      const userAgent = req.headers['user-agent'];
      await storage.markSignatureRequestViewed(id, ipAddress, userAgent);

      res.json(request);
    } catch (error) {
      console.error("Error fetching signature request:", error);
      res.status(500).json({ message: "Failed to fetch signature request" });
    }
  });

  // Capture signature (consumer) - requires authentication
  app.post('/api/signature-requests/:id/sign', authenticateConsumer, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Validate request body with Zod
      const signatureRequestSchema = z.object({
        signatureData: z.string().min(100, "Signature data must be at least 100 characters"),
        initialsData: z.string().min(100, "Initials data must be at least 100 characters"),
        legalConsent: z.literal(true, { errorMap: () => ({ message: "Legal consent must be explicitly true" }) }),
      });

      const validationResult = signatureRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        return res.status(400).json({ message: firstError.message });
      }

      const { signatureData, initialsData, legalConsent } = validationResult.data;

      const request = await storage.getSignatureRequestById(id);
      if (!request) {
        return res.status(404).json({ message: "Signature request not found" });
      }

      // Verify the authenticated consumer matches the signature request recipient
      const consumerEmail = req.consumer?.email;
      const consumer = await storage.getConsumer(request.consumerId);
      if (!consumer || consumer.email !== consumerEmail) {
        return res.status(403).json({ message: "You are not authorized to sign this document" });
      }

      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      // Check if request has expired
      if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
        // Log audit trail for failed signature attempt due to expiration
        await storage.createSignatureAuditEntry({
          signatureRequestId: id,
          eventType: 'signature_attempt_rejected',
          eventData: { reason: 'expired', expiresAt: request.expiresAt },
          ipAddress,
          userAgent,
        });
        return res.status(400).json({ message: "This signature request has expired" });
      }

      const result = await storage.captureSignature({
        signatureRequestId: id,
        signatureData,
        initialsData,
        ipAddress,
        userAgent,
        legalConsent,
        consentText: request.consentText || 'I agree to sign this document electronically.',
      });

      // After successful signature, create a document record so it appears in consumer's Documents section
      try {
        const template = await storage.getDocumentTemplateById(request.documentId, request.tenantId);
        await storage.createDocument({
          tenantId: request.tenantId,
          title: `Signed: ${request.title || template?.name || 'Document'}`,
          description: `Electronically signed on ${new Date().toLocaleDateString()}`,
          fileName: `signed-${request.title || 'document'}.pdf`,
          fileUrl: `/api/signed-documents/${result.signedDocument.id}`, // Link to the signed document
          fileSize: 0, // Can be updated later if needed
          mimeType: 'application/pdf',
          isPublic: false,
          accountId: request.accountId,
        });
      } catch (docError) {
        console.error("Error creating document record after signature:", docError);
        // Don't fail the signature if document creation fails - signature is more important
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error capturing signature:", error);
      res.status(500).json({ message: error.message || "Failed to capture signature" });
    }
  });

  // Decline signature (consumer)
  app.post('/api/signature-requests/:id/decline', async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ message: "Decline reason is required" });
      }

      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
      const userAgent = req.headers['user-agent'];

      const result = await storage.declineSignature(id, reason, ipAddress, userAgent);
      res.json(result);
    } catch (error) {
      console.error("Error declining signature:", error);
      res.status(500).json({ message: "Failed to decline signature" });
    }
  });

  // Get signed documents for tenant (admin)
  app.get('/api/signed-documents', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Check if document signing addon is enabled
      const enabledAddons = await storage.getEnabledAddons(tenantId);
      if (!enabledAddons.includes('document_signing')) {
        return res.status(403).json({ message: "Document signing feature is not enabled for your organization" });
      }

      const documents = await storage.getSignedDocumentsByTenant(tenantId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching signed documents:", error);
      res.status(500).json({ message: "Failed to fetch signed documents" });
    }
  });

  // Get individual signed document with signatures embedded (HTML response)
  app.get('/api/signed-documents/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      
      // Get the signed document
      const signedDoc = await storage.getSignedDocumentById(id);
      if (!signedDoc) {
        return res.status(404).json({ message: "Signed document not found" });
      }

      // Verify document belongs to this tenant
      if (signedDoc.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get the original signature request to access the document template
      const signatureRequest = await storage.getSignatureRequestById(signedDoc.signatureRequestId);
      if (!signatureRequest || !signatureRequest.document) {
        return res.status(404).json({ message: "Original document not found" });
      }

      // Verify signature request also belongs to this tenant (double-check for security)
      if (signatureRequest.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get the document HTML content
      let htmlContent = '';
      const fileUrl = signatureRequest.document.fileUrl;
      
      // Decode the data URL to get HTML content
      const urlEncodedMatch = fileUrl.match(/^data:text\/html;charset=utf-8,(.+)$/);
      const base64Match = fileUrl.match(/^data:text\/html;base64,(.+)$/);
      
      if (urlEncodedMatch) {
        htmlContent = decodeURIComponent(urlEncodedMatch[1]);
      } else if (base64Match) {
        htmlContent = Buffer.from(base64Match[1], 'base64').toString('utf-8');
      } else {
        return res.status(500).json({ message: "Invalid document format" });
      }

      // Replace signature placeholders with actual signature images
      let modifiedHtml = htmlContent;

      if (signedDoc.signatureData) {
        const signatureHtml = `<span style="display: inline-block; border-bottom: 1px solid #000; padding: 2px 5px;"><img src="${signedDoc.signatureData}" alt="Signature" style="max-width: 150px; max-height: 40px; height: auto; display: inline-block; vertical-align: middle;" /></span>`;
        
        // Replace all signature placeholders
        modifiedHtml = modifiedHtml.replace(/______________/g, signatureHtml);
        modifiedHtml = modifiedHtml.replace(/\{\{signature\}\}/gi, signatureHtml);
        modifiedHtml = modifiedHtml.replace(/\{\{SIGNATURE_LINE\}\}/gi, signatureHtml);
      }

      if (signedDoc.initialsData) {
        const initialsHtml = `<span style="display: inline-block; border-bottom: 1px solid #000; padding: 2px 5px;"><img src="${signedDoc.initialsData}" alt="Initials" style="max-width: 50px; max-height: 30px; height: auto; display: inline-block; vertical-align: middle;" /></span>`;
        
        // Replace all initials placeholders
        modifiedHtml = modifiedHtml.replace(/____(?!_)/g, initialsHtml);
        modifiedHtml = modifiedHtml.replace(/\{\{initials\}\}/gi, initialsHtml);
        modifiedHtml = modifiedHtml.replace(/\{\{INITIAL\}\}/gi, initialsHtml);
        modifiedHtml = modifiedHtml.replace(/\{\{INITIALS\}\}/gi, initialsHtml);
      }

      // Return the HTML directly
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(modifiedHtml);
    } catch (error) {
      console.error("Error fetching signed document:", error);
      res.status(500).json({ message: "Failed to fetch signed document" });
    }
  });

  // Get signature audit trail (admin)
  app.get('/api/signature-requests/:id/audit', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Check if document signing addon is enabled
      const enabledAddons = await storage.getEnabledAddons(tenantId);
      if (!enabledAddons.includes('document_signing')) {
        return res.status(403).json({ message: "Document signing feature is not enabled for your organization" });
      }

      const { id } = req.params;

      
      // Verify request belongs to this tenant
      const request = await storage.getSignatureRequestById(id);
      if (!request || request.tenantId !== tenantId) {
        return res.status(404).json({ message: "Signature request not found" });
      }

      const auditTrail = await storage.getSignatureAuditTrail(id);
      res.json(auditTrail);
    } catch (error) {
      console.error("Error fetching audit trail:", error);
      res.status(500).json({ message: "Failed to fetch audit trail" });
    }
  });

  // Mobile app version check endpoint
  app.get('/api/app-version', (req, res) => {
    // This would typically check a database or config file
    // For now, return a static version
    res.json({
      version: '1.0.0',
      minVersion: '1.0.0',
      forceUpdate: false,
      updateUrl: 'https://apps.apple.com/app/chain', // Update with real URLs
      androidUpdateUrl: 'https://play.google.com/store/apps/details?id=com.chaincomms.platform',
      releaseNotes: 'Bug fixes and performance improvements'
    });
  });

  // Dynamic content endpoint for mobile app
  app.get('/api/dynamic-content', async (req: any, res) => {
    try {
      const { type } = req.query;
      
      // Based on content type, return different dynamic data
      switch (type) {
        case 'templates':
          // Return template configurations that can be updated without app release
          res.json({
            emailTemplates: {
              welcome: {
                subject: 'Welcome to {{agencyName}}',
                body: 'Dynamic welcome message content...'
              },
              reminder: {
                subject: 'Payment Reminder',
                body: 'Dynamic reminder content...'
              }
            },
            smsTemplates: {
              reminder: 'Your payment of {{amount}} is due on {{date}}',
              confirmation: 'Payment received. Thank you!'
            }
          });
          break;
          
        case 'branding':
          // Return branding elements that can change
          res.json({
            primaryColor: '#2563eb',
            secondaryColor: '#10b981',
            features: {
              showPaymentPlans: true,
              showDocuments: true,
              allowCallbacks: true
            }
          });
          break;
          
        case 'settings':
          // Return app settings that can be toggled remotely
          res.json({
            maintenance: false,
            maintenanceMessage: null,
            features: {
              emailCampaigns: true,
              smsCampaigns: true,
              automations: true,
              consumerPortal: true
            },
            limits: {
              maxFileUploadSize: 10485760, // 10MB
              maxAccountsPerImport: 1000
            }
          });
          break;
          
        default:
          res.status(400).json({ message: 'Invalid content type' });
      }
    } catch (error) {
      console.error('Error fetching dynamic content:', error);
      res.status(500).json({ message: 'Failed to fetch dynamic content' });
    }
  });

  // PUBLIC Tenant agreement routes (no authentication required)
  
  // Get tenant agreement details (public link access)
  app.get('/api/tenant-agreement/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const agreement = await storage.getTenantAgreementById(id);

      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found" });
      }

      const template = await storage.getGlobalDocumentTemplateById(agreement.globalDocumentId);
      const tenant = await storage.getTenant(agreement.tenantId);

      if (!template || !tenant) {
        return res.status(404).json({ message: "Agreement data incomplete" });
      }

      // Generate agreementLink for the View & Agree button
      const baseUrl = ensureBaseUrl(process.env.REPLIT_DOMAINS);
      const agreementLink = `${baseUrl}/tenant-agreement/${agreement.id}`;

      // Merge metadata with agreementLink for template rendering
      const metadata = typeof agreement.agreementMetadata === 'object' && agreement.agreementMetadata !== null
        ? { ...agreement.agreementMetadata as Record<string, any>, agreementLink }
        : { agreementLink };

      // Use stored documentContent if available, otherwise regenerate from agreementMetadata
      // NEVER fall back to template.content (that's the email template, not the full contract)
      let content = agreement.documentContent;
      if (!content && agreement.agreementMetadata) {
        // Regenerate the full contract from stored metadata
        content = generateContractDocument(agreement.agreementMetadata as Record<string, any>);
      }
      if (!content) {
        // Last resort fallback - should not happen for properly created agreements
        content = '<p>Contract content unavailable. Please contact support.</p>';
      }

      res.json({
        id: agreement.id,
        title: agreement.title,
        description: agreement.description,
        status: agreement.status,
        agreementType: agreement.agreementType,
        metadata,
        content,
        interactiveFields: template.interactiveFields || null,
        tenantName: tenant.name,
        createdAt: agreement.createdAt,
        viewedAt: agreement.viewedAt,
        agreedAt: agreement.agreedAt,
        declinedAt: agreement.declinedAt,
        declineReason: agreement.declineReason,
      });
    } catch (error) {
      console.error("Error fetching tenant agreement:", error);
      res.status(500).json({ message: "Failed to fetch agreement" });
    }
  });

  // Mark agreement as viewed
  app.post('/api/tenant-agreement/:id/mark-viewed', async (req, res) => {
    try {
      const { id } = req.params;
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
      const userAgent = req.headers['user-agent'] || '';

      const agreement = await storage.getTenantAgreementById(id);
      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found" });
      }

      if (agreement.viewedAt) {
        return res.json(agreement);
      }

      const updated = await storage.updateTenantAgreement(id, {
        status: 'viewed',
        viewedAt: new Date(),
        ipAddress,
        userAgent,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error marking agreement as viewed:", error);
      res.status(500).json({ message: "Failed to mark as viewed" });
    }
  });

  // Agree to tenant agreement
  app.post('/api/tenant-agreement/:id/agree', async (req, res) => {
    try {
      const { id } = req.params;
      const { interactiveFieldValues } = req.body;
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
      const userAgent = req.headers['user-agent'] || '';

      const agreement = await storage.getTenantAgreementById(id);
      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found" });
      }

      if (agreement.status === 'agreed') {
        return res.status(400).json({ message: "Agreement already accepted" });
      }

      if (agreement.status === 'declined') {
        return res.status(400).json({ message: "Cannot accept a declined agreement" });
      }

      // Fetch template to validate interactive fields
      const template = await storage.getGlobalDocumentTemplateById(agreement.globalDocumentId);
      if (!template) {
        return res.status(404).json({ message: "Agreement template not found" });
      }

      // Validate and sanitize interactive field values if template has interactive fields
      let updatedMetadata = agreement.agreementMetadata as Record<string, any> || {};
      
      if (template.interactiveFields && Array.isArray(template.interactiveFields) && template.interactiveFields.length > 0) {
        const fields = template.interactiveFields as Array<{ name: string; type: string; required?: boolean; min?: number; options?: string[]; placeholder?: string; label?: string }>;
        
        // Enforce interactive fields requirement - cannot accept agreement without providing values
        if (!interactiveFieldValues || typeof interactiveFieldValues !== 'object' || Object.keys(interactiveFieldValues).length === 0) {
          return res.status(400).json({ message: "Interactive field values are required for this agreement" });
        }

        // Build validated payload - only allow declared fields
        const validatedValues: Record<string, any> = {};
        const declaredFieldNames = new Set(fields.map(f => f.name));

        // Reject unexpected keys
        for (const key of Object.keys(interactiveFieldValues)) {
          if (!declaredFieldNames.has(key)) {
            return res.status(400).json({ message: `Unexpected field "${key}" provided` });
          }
        }

        // Validate and sanitize each declared field
        for (const field of fields) {
          const rawValue = interactiveFieldValues[field.name];
          
          // Check required fields
          if (field.required && (rawValue === undefined || rawValue === null || rawValue === '')) {
            return res.status(400).json({ message: `Field "${field.name}" is required` });
          }

          // Skip validation for empty optional fields
          if (rawValue === undefined || rawValue === null || rawValue === '') {
            continue;
          }
          
          // Type-specific validation and coercion
          if (field.type === 'number') {
            const numValue = Number(rawValue);
            if (isNaN(numValue)) {
              return res.status(400).json({ message: `Field "${field.name}" must be a number` });
            }
            if (field.min !== undefined && numValue < field.min) {
              return res.status(400).json({ message: `Field "${field.name}" must be at least ${field.min}` });
            }
            validatedValues[field.name] = numValue;
          } else if (field.type === 'select') {
            const strValue = String(rawValue).trim();
            if (field.options && !field.options.includes(strValue)) {
              return res.status(400).json({ message: `Field "${field.name}" must be one of: ${field.options.join(', ')}` });
            }
            // Sanitize by ensuring exact match from allowed options
            validatedValues[field.name] = strValue;
          } else {
            // For text and other types, sanitize by converting to string and trimming
            const sanitized = String(rawValue).trim();
            validatedValues[field.name] = sanitized;
          }
        }

        // Store validated values under dedicated key for auditing
        updatedMetadata = {
          ...updatedMetadata,
          ...validatedValues,
          _interactiveFieldValues: validatedValues, // Keep a copy of validated fields
        };
      }

      const updated = await storage.updateTenantAgreement(id, {
        status: 'agreed',
        agreedAt: new Date(),
        ipAddress,
        userAgent,
        agreementMetadata: updatedMetadata,
      });

      const tenant = await storage.getTenant(agreement.tenantId);

      // HTML escape function to prevent XSS in email
      const escapeHtml = (unsafe: any): string => {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };

      const metadata = updatedMetadata;
      const metadataEntries = Object.entries(metadata)
        .filter(([key]) => !key.startsWith('_')) // Skip internal keys like _interactiveFieldValues
        .map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(value)}`)
        .join('\n');

      await emailService.sendEmail({
        to: process.env.ADMIN_EMAIL || 'admin@chainplatform.com',
        subject: `Agreement Accepted: ${escapeHtml(agreement.title)}`,
        html: `
          <h2>Tenant Agreement Accepted</h2>
          <p><strong>Tenant:</strong> ${escapeHtml(tenant?.name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(tenant?.email)}</p>
          <p><strong>Agreement Type:</strong> ${escapeHtml(agreement.agreementType)}</p>
          <p><strong>Title:</strong> ${escapeHtml(agreement.title)}</p>
          <p><strong>Agreed At:</strong> ${escapeHtml(updated.agreedAt?.toLocaleString())}</p>
          <p><strong>IP Address:</strong> ${escapeHtml(ipAddress)}</p>
          <p><strong>User Agent:</strong> ${escapeHtml(userAgent)}</p>
          
          <h3>Agreement Details:</h3>
          <pre>${metadataEntries}</pre>
        `,
        tenantId: undefined,
      });

      res.json({ ...updated, message: 'Agreement accepted successfully' });
    } catch (error) {
      console.error("Error agreeing to agreement:", error);
      res.status(500).json({ message: "Failed to accept agreement" });
    }
  });

  // Decline tenant agreement
  app.post('/api/tenant-agreement/:id/decline', async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
      const userAgent = req.headers['user-agent'] || '';

      if (!reason) {
        return res.status(400).json({ message: "Decline reason is required" });
      }

      const agreement = await storage.getTenantAgreementById(id);
      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found" });
      }

      if (agreement.status === 'agreed') {
        return res.status(400).json({ message: "Cannot decline an accepted agreement" });
      }

      const updated = await storage.updateTenantAgreement(id, {
        status: 'declined',
        declinedAt: new Date(),
        declineReason: reason,
        ipAddress,
        userAgent,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error declining agreement:", error);
      res.status(500).json({ message: "Failed to decline agreement" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
