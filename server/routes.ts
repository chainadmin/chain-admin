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
  agencyCredentials,
  users,
  subscriptionPlans,
  subscriptions,
  emailLogs,
  emailCampaigns,
  type Account,
  type Consumer,
  type Tenant,
  type InsertArrangementOption,
  type SmsTracking,
} from "@shared/schema";
import { db } from "./db";
import { and, eq, sql } from "drizzle-orm";
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

const csvUploadSchema = z.object({
  consumers: z.array(z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    additionalData: z.record(z.any()).optional(),
  })),
  accounts: z.array(z.object({
    accountNumber: z.string(),
    creditor: z.string(),
    balanceCents: z.number(),
    dueDate: z.string().optional(),
    consumerEmail: z.string().email(),
    additionalData: z.record(z.any()).optional(),
  })),
});

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

  const appDownloadUrl = sanitizedBaseUrl ? `${baseProtocol}${sanitizedBaseUrl}/download` : '';
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

  // Calculate balance percentages for settlement offers
  const balance50 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents * 0.5)) : '';
  const balance60 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents * 0.6)) : '';
  const balance70 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents * 0.7)) : '';
  const balance80 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents * 0.8)) : '';
  const balance90 = (balanceCents !== null && balanceCents !== undefined) ? formatCurrency(Math.round(balanceCents * 0.9)) : '';
  const balance100 = formattedBalance; // Same as full balance

  const replacements: Record<string, string> = {
    firstName,
    lastName,
    fullName,
    consumerName: fullName,
    email: consumerEmail,
    phone: consumerPhone,
    consumerId: consumer?.id || '',
    accountId: account?.id || '',
    accountNumber: account?.accountNumber || '',
    fileNumber,
    filenumber: fileNumber,
    creditor: account?.creditor || '',
    balance: formattedBalance,
    balence: formattedBalance,
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
    consumerFullAddress: fullAddress,
    consumerPortalLink: consumerPortalUrl,
    appDownloadLink: appDownloadUrl,
    agencyName: tenant?.name || '',
    agencyEmail: (tenant as any)?.contactEmail || tenant?.email || '',
    agencyPhone: (tenant as any)?.contactPhone || tenant?.phoneNumber || tenant?.twilioPhoneNumber || '',
    unsubscribeLink: unsubscribeUrl,
    unsubscribeUrl,
    unsubscribeButton: unsubscribeButtonHtml,
    'todays date': todaysDate,
    // Balance percentage variables for settlement offers
    'balance50%': balance50,
    'balance60%': balance60,
    'balance70%': balance70,
    'balance80%': balance80,
    'balance90%': balance90,
    'balance100%': balance100,
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

  async function resolveEmailCampaignAudience(
    tenantId: string,
    targetGroup: string,
    folderSelection?: string | string[] | null,
  ) {
    const consumersList = await storage.getConsumersByTenant(tenantId);
    const accountsData = await storage.getAccountsByTenant(tenantId);

    const folderIds = Array.isArray(folderSelection)
      ? folderSelection.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : typeof folderSelection === 'string' && folderSelection.trim().length > 0
        ? [folderSelection]
        : [];

    console.log(
      `🎯 Resolving campaign audience - targetGroup: "${targetGroup}", folders: ${folderIds.length > 0 ? folderIds.join(', ') : 'none'}`,
    );
    console.log(`📊 Total consumers in tenant: ${consumersList.length}, Total accounts: ${accountsData.length}`);

    let targetedConsumers = consumersList;

    if (targetGroup === 'folder' && folderIds.length > 0) {
      const folderSet = new Set(folderIds);

      console.log(`🔍 Filtering for folders: ${folderIds.join(', ')}`);
      const accountsInFolder = accountsData.filter(acc => {
        const accountFolderMatch = acc.folderId && folderSet.has(acc.folderId);
        const consumerFolderMatch = acc.consumer?.folderId && folderSet.has(acc.consumer.folderId);
        return accountFolderMatch || consumerFolderMatch;
      });
      console.log(`📁 Found ${accountsInFolder.length} accounts matching selected folders`);

      if (accountsInFolder.length === 0) {
        const totalAccountsWithFolder = accountsData.filter(acc => acc.folderId).length;
        const uniqueFolderCount = new Set(accountsData.map(a => a.folderId).filter(Boolean)).size;
        console.warn(`⚠️ WARNING: No accounts found with this folder ID`);
        console.log(`   Total accounts with folders: ${totalAccountsWithFolder}, Unique folders: ${uniqueFolderCount}`);
        console.log(`   Sample folder IDs from accounts:`, Array.from(new Set(accountsData.slice(0, 5).map(a => a.folderId).filter(Boolean))));
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
        accountsData
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

    return { targetedConsumers, accountsData };
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
      const accountsList = await storage.getAccountsByConsumer(consumer.id);

      // Get tenant info for display
      const tenant = tenantId
        ? await storage.getTenant(tenantId)
        : tenantSlug
          ? await storage.getTenantBySlug(tenantSlug)
          : undefined;

      // Get tenant settings
      const tenantSettings = tenant?.id ? await storage.getTenantSettings(tenant.id) : undefined;

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

      // Database-level search for consumers (LIMIT 5 for performance)
      const matchingConsumers = await db
        .select({
          id: consumers.id,
          firstName: consumers.firstName,
          lastName: consumers.lastName,
          email: consumers.email,
        })
        .from(consumers)
        .where(
          and(
            eq(consumers.tenantId, tenantId),
            sql`(
              LOWER(${consumers.firstName}) LIKE LOWER(${searchPattern}) OR
              LOWER(${consumers.lastName}) LIKE LOWER(${searchPattern}) OR
              LOWER(${consumers.email}) LIKE LOWER(${searchPattern})
            )`
          )
        )
        .limit(5);

      // Database-level search for accounts with consumer names (LIMIT 5 for performance)
      const matchingAccountsRaw = await db
        .select({
          id: accountsTable.id,
          accountNumber: accountsTable.accountNumber,
          creditor: accountsTable.creditor,
          balanceCents: accountsTable.balanceCents,
          firstName: consumers.firstName,
          lastName: consumers.lastName,
        })
        .from(accountsTable)
        .leftJoin(consumers, eq(accountsTable.consumerId, consumers.id))
        .where(
          and(
            eq(accountsTable.tenantId, tenantId),
            sql`(
              LOWER(${accountsTable.accountNumber}) LIKE LOWER(${searchPattern}) OR
              LOWER(${accountsTable.creditor}) LIKE LOWER(${searchPattern}) OR
              LOWER(${consumers.firstName}) LIKE LOWER(${searchPattern}) OR
              LOWER(${consumers.lastName}) LIKE LOWER(${searchPattern})
            )`
          )
        )
        .limit(5);

      const matchingAccounts = matchingAccountsRaw.map(row => ({
        id: row.id,
        accountNumber: row.accountNumber,
        creditor: row.creditor,
        balanceCents: row.balanceCents,
        firstName: row.firstName || '',
        lastName: row.lastName || '',
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

      const { consumers: consumersData, accounts: accountsData, folderId } = req.body;
      
      // Validate input data
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
      
      // Validate consumer data has required fields
      for (let i = 0; i < consumersData.length; i++) {
        const consumer = consumersData[i];
        if (!consumer.email || !consumer.email.trim()) {
          return res.status(400).json({ 
            message: `Row ${i + 2}: Consumer email is required` 
          });
        }
        if (!consumer.firstName || !consumer.firstName.trim()) {
          return res.status(400).json({ 
            message: `Row ${i + 2}: Consumer first name is required for ${consumer.email}` 
          });
        }
        if (!consumer.lastName || !consumer.lastName.trim()) {
          return res.status(400).json({ 
            message: `Row ${i + 2}: Consumer last name is required for ${consumer.email}` 
          });
        }
      }
      
      // Validate account data has required fields
      for (let i = 0; i < accountsData.length; i++) {
        const account = accountsData[i];
        if (!account.filenumber || !account.filenumber.trim()) {
          return res.status(400).json({ 
            message: `Row ${i + 2}: Filenumber is required (needed for SMAX integration)` 
          });
        }
        if (!account.creditor || !account.creditor.trim()) {
          return res.status(400).json({ 
            message: `Row ${i + 2}: Creditor is required` 
          });
        }
        if (account.balanceCents === undefined || account.balanceCents === null || isNaN(account.balanceCents)) {
          return res.status(400).json({ 
            message: `Row ${i + 2}: Valid balance is required for ${account.creditor}` 
          });
        }
      }
      
      // Get default folder if no folder is specified
      let targetFolderId = folderId;
      if (!targetFolderId) {
        await storage.ensureDefaultFolders(tenantId);
        const defaultFolder = await storage.getDefaultFolder(tenantId);
        targetFolderId = defaultFolder?.id;
      }
      
      // Find or create consumers
      const createdConsumers = new Map();
      for (const consumerData of consumersData) {
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
          });
          if (consumer.email) {
            createdConsumers.set(consumer.email.toLowerCase(), consumer);
          }
        } catch (consumerError: any) {
          console.error(`Error creating consumer ${consumerData.email}:`, consumerError);
          return res.status(500).json({ 
            message: `Failed to create consumer ${consumerData.email}: ${consumerError.message}` 
          });
        }
      }

      // Create or update accounts (with deduplication)
      const createdAccounts = [];
      for (let index = 0; index < accountsData.length; index++) {
        const accountData = accountsData[index];
        
        if (!accountData.consumerEmail) {
          throw new Error(`Row ${index + 2}: Missing consumer email for account`);
        }
        
        const consumerEmailLower = accountData.consumerEmail.toLowerCase();
        const consumer = createdConsumers.get(consumerEmailLower);
        if (!consumer) {
          throw new Error(`Row ${index + 2}: Consumer not found for email: ${accountData.consumerEmail}`);
        }

        const accountToCreate = {
          tenantId: tenantId,
          consumerId: consumer.id,
          folderId: targetFolderId,
          accountNumber: accountData.accountNumber || null,
          filenumber: accountData.filenumber,
          creditor: accountData.creditor,
          balanceCents: accountData.balanceCents,
          dueDate: accountData.dueDate || null,
          status: 'active',
          additionalData: accountData.additionalData || {},
        };
        
        console.log(`[CSV Import] Row ${index + 2}: Creating/updating account with filenumber: ${accountData.filenumber}, additionalData keys: ${Object.keys(accountData.additionalData || {}).join(', ')}`);
        
        // Use findOrCreateAccount to prevent duplicates
        const account = await storage.findOrCreateAccount(accountToCreate);
        
        console.log(`[CSV Import] Row ${index + 2}: Account saved with ID ${account.id}, filenumber in DB: ${account.filenumber}, additionalData keys: ${Object.keys(account.additionalData || {}).join(', ')}`);
        
        createdAccounts.push(account);
      }
      
      res.json({
        message: "Import successful",
        consumersCreated: createdConsumers.size,
        accountsCreated: createdAccounts.length,
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

      // Create account
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

  // Test email route
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
          consumerId: originalEmail.consumerId,
        },
        tenantId: tenantId,
      });

      res.json({ 
        message: 'Response sent successfully',
        result 
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

    const folderIds = Array.isArray(folderSelection)
      ? folderSelection.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : typeof folderSelection === 'string' && folderSelection.trim().length > 0
        ? [folderSelection]
        : [];

    console.log(
      `📱 Resolving SMS audience - targetGroup: "${targetGroup}", folders: ${folderIds.length > 0 ? folderIds.join(', ') : 'none'}`,
    );
    console.log(`📊 Total consumers in tenant: ${consumersList.length}, Total accounts: ${accountsData.length}`);

    let targetedConsumers = consumersList;

    if (targetGroup === 'folder' && folderIds.length > 0) {
      const folderSet = new Set(folderIds);

      console.log(`🔍 Filtering for folders: ${folderIds.join(', ')}`);
      const accountsInFolder = accountsData.filter(acc => {
        const accountFolderMatch = acc.folderId && folderSet.has(acc.folderId);
        const consumerFolderMatch = acc.consumer?.folderId && folderSet.has(acc.consumer.folderId);
        return accountFolderMatch || consumerFolderMatch;
      });
      console.log(`📁 Found ${accountsInFolder.length} accounts matching selected folders`);

      if (accountsInFolder.length === 0) {
        const totalAccountsWithFolder = accountsData.filter(acc => acc.folderId).length;
        const uniqueFolderCount = new Set(accountsData.map(a => a.folderId).filter(Boolean)).size;
        console.warn(`⚠️ WARNING: No accounts found with this folder ID`);
        console.log(`   Total accounts with folders: ${totalAccountsWithFolder}, Unique folders: ${uniqueFolderCount}`);
        console.log(`   Sample folder IDs from accounts:`, Array.from(new Set(accountsData.slice(0, 5).map(a => a.folderId).filter(Boolean))));
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
        accountsData
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

    return { targetedConsumers, accountsData };
  }

  // SMS campaign routes
  app.get('/api/sms-campaigns', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const campaigns = await storage.getSmsCampaignsByTenant(tenantId);
      console.log(`📋 Retrieved ${campaigns.length} SMS campaigns for tenant ${tenantId}`);
      campaigns.forEach((c, index) => {
        console.log(`   Campaign ${index + 1}: "${c.name}"`);
        console.log(`      Status: "${c.status}" (type: ${typeof c.status})`);
        console.log(`      Target: "${c.targetGroup}"`);
        console.log(`      Folders: ${JSON.stringify(c.folderIds)} (isArray: ${Array.isArray(c.folderIds)})`);
        console.log(`      Template: "${c.templateName}"`);
        console.log(`      Recipients: ${c.totalRecipients}`);
      });
      
      // Log the EXACT JSON being sent to frontend
      console.log('\n🔍 EXACT JSON RESPONSE BEING SENT TO FRONTEND:');
      console.log(JSON.stringify(campaigns, null, 2));
      
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
      });

      const { templateId, name, targetGroup, folderIds } = insertSmsCampaignSchema.parse(req.body);

      console.log(`📱 Creating SMS campaign - name: "${name}", targetGroup: "${targetGroup}", folderIds:`, folderIds);
      console.log(`📱 Request body received:`, JSON.stringify(req.body, null, 2));

      // Use the shared audience resolution function
      const { targetedConsumers } = await resolveSmsCampaignAudience(tenantId, targetGroup, folderIds);

      // Count consumers with phone numbers for accurate recipient count
      const consumersWithPhone = targetedConsumers.filter(consumer => consumer.phone);
      
      const campaignData = {
        tenantId,
        templateId,
        name,
        targetGroup,
        folderIds: folderIds || [],
        totalRecipients: consumersWithPhone.length,
        status: 'pending_approval',
      };
      
      console.log(`📱 Creating campaign with data:`, campaignData);
      const campaign = await storage.createSmsCampaign(campaignData);

      console.log(`📱 SMS campaign "${campaign.name}" created successfully`);
      console.log(`   Status: "${campaign.status}"`);
      console.log(`   Target Group: "${campaign.targetGroup}"`);
      console.log(`   Folder IDs: ${JSON.stringify(campaign.folderIds)}`);
      console.log(`   Total Recipients: ${consumersWithPhone.length}`);
      console.log(`   Campaign ID: ${campaign.id}`);

      res.json({
        ...campaign,
        totalRecipients: consumersWithPhone.length,
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

      // Extract all phone numbers for each consumer
      const extractPhoneNumbers = (consumer: any): string[] => {
        const phones: string[] = [];
        
        // Add primary phone number
        if (consumer.phone) {
          phones.push(consumer.phone);
        }
        
        // If sendToAllNumbers is enabled, look for additional phone numbers in additionalData
        if (campaign.sendToAllNumbers && consumer.additionalData) {
          const additionalData = consumer.additionalData as Record<string, any>;
          
          // Common phone field names to check
          const phoneFieldNames = [
            'phone2', 'phone_2', 'phone3', 'phone_3',
            'mobile', 'cell', 'cellphone', 'cell_phone',
            'alternate_phone', 'alt_phone', 'alternate', 
            'home_phone', 'work_phone', 'business_phone',
            'secondary_phone', 'other_phone'
          ];
          
          // Extract phone numbers from additional data
          for (const fieldName of phoneFieldNames) {
            const value = additionalData[fieldName];
            if (value && typeof value === 'string' && value.trim()) {
              phones.push(value.trim());
            }
          }
        }
        
        // Return unique phone numbers only
        return Array.from(new Set(phones));
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
            const smsResults = await smsService.sendBulkSmsCampaign(processedMessages, tenantId, campaign.id);
            
            // Update campaign metrics from tracking records (more accurate than send results)
            await updateSmsCampaignMetrics(campaign.id);

            // Mark campaign as completed
            await storage.updateSmsCampaign(campaign.id, {
              status: 'completed',
              totalRecipients: processedMessages.length,
              completedAt: new Date(),
            });

            console.log(
              `✅ SMS campaign "${campaign.name}" completed: ${smsResults.totalSent} sent, ${smsResults.totalFailed} failed`
            );
          } catch (error) {
            console.error(`Error in background SMS campaign send for ${campaign.id}:`, error);
            // Mark campaign as failed
            try {
              await storage.updateSmsCampaign(campaign.id, {
                status: 'failed',
                completedAt: new Date(),
              });
            } catch (updateError) {
              console.error('Error updating campaign status after failure:', updateError);
            }
          } finally {
            // Release the processing lock
            campaignProcessingLocks.delete(id);
          }
        })();
      } else {
        // No messages to send, release lock immediately
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

      const normalizedStatus = (campaign.status || '').toLowerCase();
      if (!['pending', 'pending_approval'].includes(normalizedStatus)) {
        return res.status(400).json({ message: "Only pending campaigns can be deleted" });
      }

      await storage.deleteSmsCampaign(id, tenantId);

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
        isActive: true,
      };
      
      console.log('✓ Creating automation with data:', automationData);
      const newAutomation = await storage.createAutomation(automationData);
      
      console.log('✅ Automation created:', {
        id: newAutomation.id,
        name: newAutomation.name,
        scheduledDate: scheduledDateTime.toISOString(),
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
      });

      const validatedData = updateAutomationSchema.parse(req.body);
      
      const updateData: any = {
        ...validatedData,
        updatedAt: new Date(),
      };
      
      // Convert scheduledDate string to Date if provided
      if (updateData.scheduledDate) {
        updateData.scheduledDate = new Date(updateData.scheduledDate);
      }
      
      const updatedAutomation = await storage.updateAutomation(req.params.id, updateData);
      
      res.json(updatedAutomation);
    } catch (error) {
      console.error("Error updating automation:", error);
      res.status(500).json({ message: "Failed to update automation" });
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
        triggerEvent: z.enum(['account_created', 'payment_received', 'payment_overdue', 'payment_failed', 'manual']).optional(),
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
        triggerEvent: z.enum(['account_created', 'payment_received', 'payment_overdue', 'payment_failed', 'manual']).optional(),
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

      // TODO: Add notification system to alert platform owners about new trial registration
      console.log(`New trial agency registered: ${data.businessName} (${data.email})`);

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

    const minBalance = parseCurrencyInput(body.minBalance);
    const maxBalance = parseCurrencyInput(body.maxBalance);

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

    const candidate = {
      tenantId,
      name,
      description,
      minBalance,
      maxBalance,
      planType,
      monthlyPaymentMin: planType === "range" ? monthlyPaymentMin : null,
      monthlyPaymentMax: planType === "range" ? monthlyPaymentMax : null,
      fixedMonthlyPayment: planType === "fixed_monthly" ? fixedMonthlyPayment : null,
      payInFullAmount: planType === "pay_in_full" ? payInFullAmount : null,
      payoffText: planType === "pay_in_full" || planType === "settlement" ? payoffText : null,
      payoffPercentageBasisPoints: planType === "pay_in_full" || planType === "settlement" ? payoffPercentage : null,
      payoffDueDate: planType === "pay_in_full" || planType === "settlement" ? payoffDueDate : null,
      customTermsText: planType === "custom_terms" ? customTermsText : null,
      maxTermMonths:
        planType === "pay_in_full" || planType === "settlement" || planType === "custom_terms"
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
        // Redact sensitive SMAX credentials in response
        smaxApiKey: settings?.smaxApiKey ? '••••••••' : '',
        smaxPin: settings?.smaxPin ? '••••••••' : '',
      };

      const maskedSettings = { ...combinedSettings } as typeof combinedSettings;

      if (settings?.merchantApiKey) {
        maskedSettings.merchantApiKey = `****${settings.merchantApiKey.slice(-4)}`;
      }

      if (settings?.merchantApiPin) {
        maskedSettings.merchantApiPin = '****';
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
        // USAePay merchant configuration
        merchantProvider: z.string().nullable().optional(),
        merchantAccountId: z.string().nullable().optional(),
        merchantApiKey: z.string().nullable().optional(),
        merchantApiPin: z.string().nullable().optional(),
        merchantName: z.string().nullable().optional(),
        merchantType: z.string().nullable().optional(),
        useSandbox: z.boolean().optional(),
        enableOnlinePayments: z.boolean().optional(),
      });

      const validatedData = settingsSchema.parse(req.body);

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
        ...otherSettings
      } = validatedData;

      // Preserve SMAX credentials if they're submitted as masked values
      const currentSettings = await storage.getTenantSettings(tenantId);
      const finalSmaxApiKey = (smaxApiKey && smaxApiKey !== '••••••••') ? smaxApiKey?.trim() : currentSettings?.smaxApiKey;
      const finalSmaxPin = (smaxPin && smaxPin !== '••••••••') ? smaxPin?.trim() : currentSettings?.smaxPin;

      let finalMerchantApiKey = merchantApiKey?.trim();
      if (typeof merchantApiKey === 'string' && merchantApiKey.startsWith('****') && currentSettings?.merchantApiKey) {
        finalMerchantApiKey = currentSettings.merchantApiKey;
      }

      let finalMerchantApiPin = merchantApiPin?.trim();
      if (typeof merchantApiPin === 'string' && merchantApiPin === '****' && currentSettings?.merchantApiPin) {
        finalMerchantApiPin = currentSettings.merchantApiPin;
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

      // Update tenant settings table with other settings
      const tenantSettingsPayload: any = {
        ...otherSettings,
        smaxApiKey: finalSmaxApiKey,
        smaxPin: finalSmaxPin,
        tenantId: tenantId,
      };

      if (merchantApiKey !== undefined) {
        tenantSettingsPayload.merchantApiKey = finalMerchantApiKey || null;
      }

      if (merchantApiPin !== undefined) {
        tenantSettingsPayload.merchantApiPin = finalMerchantApiPin || null;
      }

      const updatedSettings = await storage.upsertTenantSettings(tenantSettingsPayload as any);

      const maskedUpdatedSettings = { ...updatedSettings } as typeof updatedSettings;

      if (updatedSettings.merchantApiKey) {
        maskedUpdatedSettings.merchantApiKey = `****${updatedSettings.merchantApiKey.slice(-4)}`;
      }

      if (updatedSettings.merchantApiPin) {
        maskedUpdatedSettings.merchantApiPin = '****';
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
        // Skip accounts without account numbers
        if (!account.accountNumber) {
          syncResults.skipped++;
          continue;
        }

        try {
          // Pull account data from SMAX
          const smaxAccountData = await smaxService.getAccount(tenantId, account.accountNumber);
          
          if (smaxAccountData && smaxAccountData.balance !== undefined) {
            // Convert SMAX balance to cents (assuming SMAX returns dollars)
            const newBalanceCents = Math.round(parseFloat(smaxAccountData.balance) * 100);
            
            // Update account balance in Chain
            await storage.updateAccount(account.id, {
              balanceCents: newBalanceCents,
            });
            
            syncResults.synced++;
            console.log(`✅ Synced account ${account.accountNumber}: Balance updated to $${smaxAccountData.balance}`);
          } else {
            syncResults.failed++;
            syncResults.errors.push(`Account ${account.accountNumber}: No balance data from SMAX`);
          }

          // Pull and import payments from SMAX
          const smaxPayments = await smaxService.getPayments(tenantId, account.accountNumber);
          
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
                console.error(`Failed to import payment for account ${account.accountNumber}:`, paymentError);
              }
            }
          }
        } catch (error: any) {
          syncResults.failed++;
          syncResults.errors.push(`Account ${account.accountNumber}: ${error.message}`);
          console.error(`❌ Failed to sync account ${account.accountNumber}:`, error);
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
      
      // Always return settings with defaults even if no record exists
      res.json({
        minimumMonthlyPayment: settings?.minimumMonthlyPayment || 5000, // Default $50
        showPaymentPlans: settings?.showPaymentPlans ?? true,
        showDocuments: settings?.showDocuments ?? true,
        allowSettlementRequests: settings?.allowSettlementRequests ?? true,
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
      const visibleDocuments = documents.filter(doc => {
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

      res.json(visibleDocuments);
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
      
      // Filter options based on balance range
      const applicableOptions = options.filter(option => 
        balanceCents >= option.minBalance && balanceCents <= option.maxBalance
      );
      
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
      
      // Return both Chain template options AND existing SMAX arrangements
      res.json({
        templateOptions: applicableOptions,
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
        simplifiedFlow // New simplified arrangement flow data
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

      if (!accountId || !cardNumber || !expiryMonth || !expiryYear || !cvv || !cardName) {
        return res.status(400).json({ message: "Missing required payment information" });
      }

      // Fetch and validate the account belongs to this consumer
      const account = await storage.getAccount(accountId);
      if (!account || account.consumerId !== consumerId || account.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied to this account" });
      }
      
      // Check if account is inactive
      if (account.status === 'inactive') {
        console.log('❌ Payment blocked: Account is inactive');
        return res.status(403).json({ 
          success: false,
          message: "This account is inactive and cannot accept payments. Please contact us for assistance." 
        });
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
        accountBalance: amountCents
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
        } else if (arrangement.planType === 'pay_in_full') {
          // Pay in full: can be percentage discount or fixed amount
          if (arrangement.payoffPercentageBasisPoints) {
            amountCents = Math.round(amountCents * arrangement.payoffPercentageBasisPoints / 10000);
            console.log('✅ Pay in full (percentage) calculated:', { amountCents });
          } else if (arrangement.payInFullAmount) {
            amountCents = arrangement.payInFullAmount;
            console.log('✅ Pay in full (fixed) set:', { amountCents });
          }
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

      // Get tenant settings to check if online payments are enabled
      const settings = await storage.getTenantSettings(tenantId);
      if (!settings?.enableOnlinePayments) {
        return res.status(403).json({ 
          success: false,
          message: "Online payments are currently disabled. Please contact your agency to make a payment." 
        });
      }

      // Get USAePay credentials from tenant settings and trim whitespace
      const merchantApiKey = settings.merchantApiKey?.trim();
      const merchantApiPin = settings.merchantApiPin?.trim();
      const useSandbox = settings.useSandbox;

      if (!merchantApiKey || !merchantApiPin) {
        console.error("USAePay credentials not configured for tenant:", tenantId);
        return res.status(500).json({ message: "Payment processing is not configured. Please contact your agency." });
      }

      // Log credential info for debugging (without exposing full values)
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
            cvc: cvv  // CVV can be included for additional verification
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

        // Extract card brand if not already set
        if (!cardBrand && usaepayResult.cardtype) {
          cardBrand = usaepayResult.cardtype;
        }

        // Create payment record
        // NOTE: processedAt is ALWAYS the actual processing time (now), never the user-supplied paymentDate
        // The paymentDate is used ONLY for SMAX sync to attribute the payment to a specific date
        payment = await storage.createPayment({
          tenantId: tenantId,
          consumerId: consumerId,
          accountId: accountId || null,
          amountCents,
          paymentMethod: 'credit_card',
          status: success ? 'completed' : 'failed',
          transactionId: transactionId,
          processorResponse: JSON.stringify(usaepayResult),
          processedAt: success ? new Date() : null, // Actual processing timestamp
          notes: arrangement
            ? `${arrangement.name} - ${cardName} ending in ${cardLast4}`
            : `Online payment - ${cardName} ending in ${cardLast4}`,
        });
        
        console.log('💾 Payment record created:', {
          paymentId: payment.id,
          amountCents: payment.amountCents,
          status: payment.status,
          transactionId: payment.transactionId
        });

        // Trigger payment event for sequence enrollment
        if (success) {
          await eventService.emitSystemEvent('payment_received', {
            tenantId,
            consumerId,
            accountId: accountId || undefined,
            metadata: { paymentId: payment.id, amountCents, transactionId }
          });
        } else {
          await eventService.emitSystemEvent('payment_failed', {
            tenantId,
            consumerId,
            accountId: accountId || undefined,
            metadata: { paymentId: payment.id, amountCents, error: usaepayResult.error || usaepayResult.errorcode }
          });
        }
        
        // Send payment to SMAX if account has a filenumber
        if (success && account.filenumber) {
          const consumer = await storage.getConsumer(consumerId);
          console.log('📤 Sending payment to SMAX...');
          
          // Use the consumer-supplied paymentDate for SMAX attribution if provided
          // This allows consumers to retry failed SMAX payments and have them show on the correct date
          const smaxPaymentData = smaxService.createSmaxPaymentData({
            filenumber: account.filenumber,
            paymentamount: amountCents / 100,
            paymentdate: normalizedPaymentDate 
              ? normalizedPaymentDate.toISOString().split('T')[0] 
              : new Date().toISOString().split('T')[0],
            payorname: consumer ? `${consumer.firstName} ${consumer.lastName}` : 'Consumer',
            paymentmethod: 'CREDIT CARD',
            cardtype: cardBrand || 'Unknown',
            cardLast4: cardLast4,
            transactionid: transactionId || undefined
          });
          
          const smaxSuccess = await smaxService.insertPayment(tenantId, smaxPaymentData);
          if (smaxSuccess) {
            console.log('✅ Payment synced to SMAX successfully');
          } else {
            console.log('⚠️ Failed to sync payment to SMAX (non-blocking)');
          }
        } else if (!account.filenumber) {
          console.log('ℹ️ No filenumber available - skipping SMAX payment sync');
        }
      } else {
        success = true;
        console.log('⏭️ Skipping immediate charge - will create payment schedule instead');
      }

      // Send notification to admins about successful payment
      if (paymentProcessed && success) {
        const consumer = await storage.getConsumer(consumerId);
        if (consumer) {
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
          }).catch(err => console.error('Failed to send payment notification:', err));

          // Also send notification to company contact email
          await emailService.sendPaymentNotification({
            tenantId,
            consumerName: `${consumer.firstName} ${consumer.lastName}`,
            accountNumber: account.accountNumber || 'N/A',
            amountCents,
            paymentMethod: 'Credit Card',
            transactionId: transactionId || undefined,
            paymentType: 'one_time',
          }).catch(err => console.error('Failed to send payment notification to contact email:', err));
        }
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
        hasSavedPaymentMethod: !!savedPaymentMethod,
        arrangementType: arrangement?.planType,
        condition1: success || shouldSkipImmediateCharge,
        condition2: setupRecurring || shouldSkipImmediateCharge,
        allConditionsMet: (success || shouldSkipImmediateCharge) && (setupRecurring || shouldSkipImmediateCharge) && arrangement && savedPaymentMethod
      });
      
      if ((success || shouldSkipImmediateCharge) && (setupRecurring || shouldSkipImmediateCharge) && arrangement && savedPaymentMethod) {
        console.log('⚡ Entered schedule creation block');
        
        // Use firstPaymentDate if provided, otherwise use today
        const paymentStartDate = normalizedFirstPaymentDate ? new Date(normalizedFirstPaymentDate) : new Date();
        console.log('📆 Payment start date:', paymentStartDate.toISOString());
        
        const nextMonth = new Date(paymentStartDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        // Determine number of payments based on arrangement
        let remainingPayments = null;
        let endDate = null;
        
        console.log('🔢 Calculating payments for arrangement type:', arrangement.planType);

        if (arrangement.planType === 'settlement' || arrangement.planType === 'pay_in_full') {
          // Settlement/pay-in-full is one-time
          // If it's a future payment (shouldSkipImmediateCharge), we need a schedule to track it
          // If it's immediate (not shouldSkipImmediateCharge), we already charged it, no schedule needed
          if (!shouldSkipImmediateCharge) {
            // Already charged immediately, don't create schedule
          } else {
            // Future one-time payment, create schedule with 1 payment
            remainingPayments = 1;
            endDate = new Date(paymentStartDate);
          }
        } else if (arrangement.planType === 'fixed_monthly' && arrangement.maxTermMonths) {
          console.log('💵 Fixed monthly arrangement detected, maxTermMonths:', arrangement.maxTermMonths);
          const maxPayments = Number(arrangement.maxTermMonths);
          remainingPayments = shouldSkipImmediateCharge ? maxPayments : maxPayments - 1; // Minus the one we just made
          endDate = new Date(paymentStartDate);
          endDate.setMonth(endDate.getMonth() + Number(arrangement.maxTermMonths));
          console.log('✓ Calculated:', { remainingPayments, endDate: endDate.toISOString() });
        } else if (arrangement.planType === 'range') {
          // Range plans continue until balance is paid (no fixed end date or payment count)
          // This allows payments to continue automatically until the full balance is collected
          remainingPayments = null; // null = unlimited/continue until balance paid
          endDate = null; // No fixed end date
          console.log('💳 Creating range payment plan - will continue until balance is paid');
        }

        // Create schedule for:
        // 1. Recurring arrangements (fixed_monthly, range) 
        // 2. One-time future payments (settlement/pay_in_full with future date)
        // Skip for: one_time_payment type, or settlement/pay_in_full that already charged
        const shouldCreateSchedule = arrangementId && (
          (arrangement.planType !== 'one_time_payment' && shouldSkipImmediateCharge) || // Future one-time payments
          (arrangement.planType === 'fixed_monthly' || arrangement.planType === 'range') // Recurring payments
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
          // For one-time or settlement payments, set to current after successful payment
          if (success) {
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
          let newBalance = (account.balanceCents || 0) - amountCents;

          // For settlement, pay off the full balance
          if (arrangement && arrangement.planType === 'settlement') {
            newBalance = 0;
          }
          
          await storage.updateAccount(accountId, {
            balanceCents: Math.max(0, newBalance)
          });
        }
      }

      // Notify SMAX if enabled
      if (paymentProcessed && success) {
        try {
          const { smaxService } = await import('./smaxService');
          if (accountId) {
            const account = await storage.getAccount(accountId);
            const consumer = await storage.getConsumer(consumerId);
            if (account && consumer) {
              // Only send to SMAX if filenumber exists
              if (account.filenumber) {
                const paymentData = smaxService.createSmaxPaymentData({
                  filenumber: account.filenumber,
                  paymentamount: amountCents / 100,
                  paymentdate: new Date().toISOString().split('T')[0],
                  payorname: `${consumer.firstName} ${consumer.lastName}`,
                  paymentmethod: 'CREDIT CARD',
                  cardtype: cardBrand || 'Unknown',
                  cardLast4: cardLast4,
                  transactionid: transactionId || undefined,
                });
                
                console.log('💳 Sending payment to SMAX:', {
                  filenumber: account.filenumber,
                  amount: amountCents / 100,
                  cardLast4: cardLast4
                });
                
                const smaxResult = await smaxService.insertPayment(tenantId, paymentData);
                
                if (smaxResult) {
                  console.log('✅ Payment successfully sent to SMAX');
                } else {
                  console.error('❌ Failed to send payment to SMAX');
                }
              } else {
                console.warn(`⚠️ No filenumber for account ${account.accountNumber || account.id} - skipping SMAX payment sync`);
              }
            }
          }
        } catch (smaxError) {
          console.error('SMAX notification failed:', smaxError);
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
                // Check if account is inactive before processing payment
                const scheduleAccount = await storage.getAccount(schedule.accountId);
                if (scheduleAccount && scheduleAccount.status === 'inactive') {
                  console.log(`⏭️ Skipping scheduled payment for inactive account: ${schedule.accountId}`);
                  failedPayments.push({
                    scheduleId: schedule.id,
                    accountId: schedule.accountId,
                    reason: 'Account is inactive'
                  });
                  continue;
                }

                // Get tenant settings (used for both SMAX preflight check and USAePay credentials)
                const settings = await storage.getTenantSettings(tenant.id);

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

                // Verify USAePay is configured
                if (!settings?.merchantApiKey || !settings?.merchantApiPin) {
                  console.error(`USAePay not configured for tenant ${tenant.id}`);
                  continue;
                }

                const usaepayBaseUrl = settings.useSandbox 
                  ? "https://sandbox.usaepay.com/api/v2"
                  : "https://secure.usaepay.com/api/v2";

                // Generate proper USAePay API v2 authentication header with hash
                const authHeader = generateUSAePayAuthHeader(settings.merchantApiKey, settings.merchantApiPin);

                // Process payment using saved token (USAePay v2 format)
                const paymentPayload = {
                  amount: (schedule.amountCents / 100).toFixed(2),
                  invoice: schedule.accountId,
                  description: `Scheduled ${schedule.arrangementType} payment`,
                  source: {
                    key: paymentMethod.paymentToken
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

                const paymentResult = await paymentResponse.json();
                const success = paymentResult.result === 'Approved' || paymentResult.status === 'Approved';

                // Create payment record
                await storage.createPayment({
                  tenantId: tenant.id,
                  consumerId: consumer.id,
                  accountId: schedule.accountId,
                  amountCents: schedule.amountCents,
                  paymentMethod: 'credit_card',
                  status: success ? 'completed' : 'failed',
                  transactionId: paymentResult.refnum || paymentResult.key || `tx_${Date.now()}`,
                  processorResponse: JSON.stringify(paymentResult),
                  processedAt: success ? new Date() : null,
                  notes: `Scheduled payment - ${paymentMethod.cardholderName} ending in ${paymentMethod.cardLast4}`,
                });

                if (success) {
                  // Update account balance
                  const account = await storage.getAccount(schedule.accountId);
                  if (account) {
                    const newBalance = (account.balanceCents || 0) - schedule.amountCents;
                    await storage.updateAccount(schedule.accountId, {
                      balanceCents: Math.max(0, newBalance)
                    });

                    // Create approval request for SMAX update
                    // Note: The payment already exists in SMAX as PENDING (from when arrangement was created)
                    // We need admin approval before updating it to COMPLETED
                    if (account.filenumber) {
                      try {
                        // Prepare SMAX payment data for approval
                        const smaxPaymentData = {
                          paymentdate: today,
                          paymentamount: (schedule.amountCents / 100).toString(),
                          payorname: `${consumer.firstName} ${consumer.lastName}`.trim() || 'Consumer',
                          paymentmethod: 'CREDIT CARD',
                          cardtype: paymentMethod.cardBrand || 'Unknown',
                          paymentstatus: 'COMPLETED',
                          transactionid: paymentResult.refnum || paymentResult.key || `tx_${Date.now()}`,
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
                          amountCents: schedule.amountCents,
                          transactionId: paymentResult.refnum || paymentResult.key || `tx_${Date.now()}`,
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
                          paymentamount: schedule.amountCents / 100,
                          paymentdate: today,
                          payorname: `${consumer.firstName} ${consumer.lastName}`.trim() || 'Consumer',
                          paymentmethod: 'CREDIT CARD',
                          cardtype: paymentMethod.cardBrand || 'Unknown',
                          cardLast4: paymentMethod.cardLast4,
                          transactionid: paymentResult.refnum || paymentResult.key || `tx_${Date.now()}`,
                        });
                        await smaxService.insertPayment(tenant.id, smaxPaymentData);
                        console.log(`✅ SMAX payment inserted (fallback) for filenumber: ${account.filenumber}`);
                      }

                      // Insert payment attempt to SMAX
                      try {
                        await smaxService.insertAttempt(tenant.id, {
                          filenumber: account.filenumber,
                          attempttype: 'Payment',
                          attemptdate: today,
                          notes: `Scheduled payment of $${(schedule.amountCents / 100).toFixed(2)} processed successfully`,
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
                      amountCents: schedule.amountCents,
                      paymentMethod: `Card ending in ${paymentMethod.cardLast4}`,
                      transactionId: paymentResult.refnum || paymentResult.key || undefined,
                      paymentType: 'scheduled',
                    }).catch(err => console.error('Failed to send scheduled payment notification:', err));
                  } catch (notificationError) {
                    console.error('Error sending scheduled payment notification:', notificationError);
                  }

                  processedPayments.push({ scheduleId: schedule.id, consumerId: consumer.id });
                } else {
                  // Payment failed - update failed attempts
                  const failedAttempts = (schedule.failedAttempts || 0) + 1;
                  const scheduleStatus = failedAttempts >= 3 ? 'failed' : 'active';

                  await storage.updatePaymentSchedule(schedule.id, tenant.id, {
                    failedAttempts,
                    status: scheduleStatus,
                  });

                  // Update consumer status to payment_failed
                  await storage.updateConsumer(consumer.id, { paymentStatus: 'payment_failed' });

                  failedPayments.push({ 
                    scheduleId: schedule.id, 
                    consumerId: consumer.id, 
                    error: paymentResult.error || 'Payment declined'
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

      res.json({
        success: true,
        processed: processedPayments.length,
        failed: failedPayments.length,
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
                  
                  // Send email
                  const { emailService } = await import('./emailService');
                  await emailService.sendEmail({
                    to: consumer.email || '',
                    subject,
                    html,
                    tenantId: automation.tenantId,
                    tag: 'automation',
                    metadata: {
                      automationId: automation.id,
                      automationName: automation.name,
                      consumerId: consumer.id,
                    },
                  });
                  
                  sentCount++;
                  console.log(`✉️ Sent email to ${consumer.email}`);
                  
                } else if (automation.type === 'sms') {
                  // Get SMS template
                  const templates = await storage.getSmsTemplatesByTenant(automation.tenantId);
                  const template = templates.find(t => t.id === templateId);
                  if (!template) {
                    console.error(`SMS template ${templateId} not found`);
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
                  const message = replaceTemplateVariables(
                    template.message || '',
                    consumer,
                    consumerAccount,
                    tenantWithSettings
                  );
                  
                  // Send SMS
                  const { smsService } = await import('./smsService');
                  const phone = consumer.phoneNumber || (consumer.additionalData as any)?.phone;
                  
                  if (!phone) {
                    console.error(`No phone number for consumer ${consumer.id}`);
                    failedCount++;
                    continue;
                  }
                  
                  await smsService.sendSms(
                    phone,
                    message,
                    automation.tenantId
                  );
                  
                  sentCount++;
                  console.log(`📱 Sent SMS to ${phone}`);
                }
              } catch (sendError) {
                console.error(`Error sending to consumer ${consumer.id}:`, sendError);
                failedCount++;
              }
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
          
          await smaxService.insertPaymentArrangement(tenantId, {
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

          console.log('✅ Arrangement synced to SMAX successfully');
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

  // Real-time payment processing endpoint
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
      
      // Check if consumer has any active accounts before processing payment
      const consumerAccounts = await storage.getAccountsByConsumer(consumer.id);
      if (consumerAccounts && consumerAccounts.length > 0) {
        const allInactive = consumerAccounts.every(acc => acc.status === 'inactive');
        if (allInactive) {
          console.log('❌ Payment blocked: All consumer accounts are inactive');
          return res.status(403).json({ 
            success: false,
            message: "All accounts for this consumer are inactive and cannot accept payments." 
          });
        }
      }

      // TODO: Integrate with USAePay or other payment processor
      // For now, simulate payment processing
      const processorResponse = {
        success: true,
        transactionId: `tx_${Date.now()}`,
        message: "Payment processed successfully",
        // In real implementation, this would be the actual processor response
        processorData: {
          processor: "USAePay", // or whatever processor is configured
          authCode: `AUTH${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          last4: cardNumber.slice(-4),
        }
      };

      // Create payment record
      const payment = await storage.createPayment({
        tenantId: tenantId,
        consumerId: consumer.id,
        amountCents,
        paymentMethod: 'credit_card',
        status: processorResponse.success ? 'completed' : 'failed',
        transactionId: processorResponse.transactionId,
        processorResponse: JSON.stringify(processorResponse),
        processedAt: new Date(),
        notes: `Online payment - ${cardName} ending in ${cardNumber.slice(-4)}`,
      });

      // Notify SMAX if enabled
      try {
        const { smaxService } = await import('./smaxService');
        const accounts = await storage.getAccountsByConsumer(consumer.id);
        if (accounts && accounts.length > 0) {
          const account = accounts[0];
          // Only send to SMAX if filenumber exists
          if (account.filenumber) {
            const paymentData = smaxService.createSmaxPaymentData({
              filenumber: account.filenumber,
              paymentamount: amountCents / 100,
              paymentdate: new Date().toISOString().split('T')[0],
              payorname: `${consumer.firstName} ${consumer.lastName}`,
              paymentmethod: 'CREDIT CARD',
              cardLast4: cardNumber.slice(-4),
              transactionid: processorResponse.transactionId,
            });
            await smaxService.insertPayment(tenantId, paymentData);
            console.log(`✅ Consumer payment sent to SMAX for filenumber: ${account.filenumber}`);
          } else {
            console.warn(`⚠️ No filenumber for account ${account.accountNumber || account.id} - skipping SMAX sync`);
          }
        }
      } catch (smaxError) {
        console.error('SMAX notification failed:', smaxError);
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
      console.error("Error processing payment:", error);
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
        const totalBill = Number((currentPlan.price + usageCharges).toFixed(2));
        
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
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
        if (decoded.isAdmin && decoded.type === 'global_admin') {
          req.user = { isGlobalAdmin: true };
          return next();
        }
      } catch (error) {
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
          
          return {
            ...tenant,
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
        })
        .from(subscriptions)
        .innerJoin(tenants, eq(subscriptions.tenantId, tenants.id))
        .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(eq(subscriptions.status, 'pending_approval'))
        .orderBy(subscriptions.requestedAt);

      const formattedRequests = pendingSubscriptions.map(({ subscription, tenant, plan }) => ({
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

      // Update tenant to remove trial status and mark as paid
      await db
        .update(tenants)
        .set({ 
          isTrialAccount: false,
          isPaidAccount: true 
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

  // Get all subscription plans for admin
  app.get('/api/admin/subscription-plans', isPlatformAdmin, async (_req: any, res) => {
    try {
      const plans = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true))
        .orderBy(subscriptionPlans.displayOrder);

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

      // Update tenant to remove trial status and mark as paid
      await db
        .update(tenants)
        .set({ 
          isTrialAccount: false,
          isPaidAccount: true 
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
          const errorMessage = req.body.ErrorMessage || req.body.ErrorCode;
          if (errorMessage) {
            updates.errorMessage = errorMessage;
          }
          console.log(`❌ Marking as FAILED: ${errorMessage || 'No error message'}`);
        }

        console.log(`💾 Updating tracking record with ${quantity} segments:`, updates);
        await storage.updateSmsTracking(trackingInfo.tracking.id, updates);
        console.log(`✅ Tracking record updated successfully`);

        // Update campaign metrics when tracking status changes
        const campaignId = trackingInfo.tracking.campaignId;
        if (campaignId) {
          try {
            await updateSmsCampaignMetrics(campaignId);
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

  // Process individual Postmark webhook events
  async function processPostmarkWebhook(event: any) {
    const { RecordType, MessageID, Recipient, Tag, Metadata } = event;

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

  async function updateSmsCampaignMetrics(campaignId: string) {
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

      // Try to find the consumer by phone
      const consumers = await storage.getConsumersByTenant(matchedTenant.id);
      const consumer = consumers.find(c => c.phone && fromPhone.includes(c.phone.replace(/\D/g, '')));
      
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
        return res.status(200).json({ message: 'Email received but no tenant matched' });
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
      res.status(200).json({ message: 'Reply stored successfully' });
    } catch (error) {
      console.error('❌ Inbound email webhook error:', error);
      res.status(500).json({ message: 'Failed to process inbound email' });
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

  const httpServer = createServer(app);
  return httpServer;
}
