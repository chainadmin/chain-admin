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
  consumers,
  agencyCredentials,
  users,
  subscriptionPlans,
  subscriptions,
  emailLogs,
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
import { uploadLogo } from "./r2Storage";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { subdomainMiddleware } from "./middleware/subdomain";
import {
  messagingPlanList,
  messagingPlans,
  EMAIL_OVERAGE_RATE_PER_THOUSAND,
  SMS_OVERAGE_RATE_PER_SEGMENT,
  type MessagingPlanId,
} from "@shared/billing-plans";
import { listConsumers, updateConsumer, deleteConsumers, ConsumerNotFoundError } from "@shared/server/consumers";

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
  baseUrl: string = process.env.REPLIT_DOMAINS || 'localhost:5000'
): string {
  if (!template) return template;

  const sanitizedBaseUrl = (baseUrl || 'localhost:5000').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const consumerEmail = consumer?.email || '';
  const consumerSlug = tenant?.slug;

  let consumerPortalUrl = '';
  if (sanitizedBaseUrl && consumerSlug) {
    const emailPath = consumerEmail ? `/${encodeURIComponent(consumerEmail)}` : '';
    consumerPortalUrl = `https://${sanitizedBaseUrl}/consumer/${consumerSlug}${emailPath}`;
  }

  const appDownloadUrl = sanitizedBaseUrl ? `https://${sanitizedBaseUrl}/download` : '';

  const firstName = consumer?.firstName || '';
  const lastName = consumer?.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const consumerPhone = consumer?.phone || '';

  const balanceCents = account?.balanceCents;
  const formattedBalance = formatCurrency(balanceCents);
  const formattedDueDate = account?.dueDate ? new Date(account.dueDate).toLocaleDateString() : '';
  const dueDateIso = account?.dueDate ? new Date(account.dueDate).toISOString().split('T')[0] : '';

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
    creditor: account?.creditor || '',
    balance: formattedBalance,
    balence: formattedBalance,
    balanceCents: balanceCents !== undefined && balanceCents !== null ? String(balanceCents) : '',
    dueDate: formattedDueDate,
    dueDateIso,
    consumerPortalLink: consumerPortalUrl,
    appDownloadLink: appDownloadUrl,
    agencyName: tenant?.name || '',
    agencyEmail: (tenant as any)?.contactEmail || tenant?.email || '',
    agencyPhone: (tenant as any)?.contactPhone || tenant?.phoneNumber || tenant?.twilioPhoneNumber || '',
  };

  let processedTemplate = template;

  Object.entries(replacements).forEach(([key, value]) => {
    processedTemplate = applyTemplateReplacement(processedTemplate, key, value || '');
  });

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
  // CORS middleware - Allow Vercel frontend to connect
  app.use((req, res, next) => {
    const allowedOrigins = [
      'https://chainsoftwaregroup.com',
      'https://www.chainsoftwaregroup.com',
      'http://localhost:5173',
      'http://localhost:5000',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:3000'
    ];
    
    const origin = req.headers.origin as string;
    
    // Check if origin is allowed
    const isAllowed = !origin || 
        allowedOrigins.includes(origin) || 
        origin.includes('vercel.app') || 
        origin.includes('vercel.sh') ||
        origin.includes('replit.dev') ||
        origin.includes('replit.app') ||
        origin.includes('repl.co') ||
        // Allow all subdomains of chainsoftwaregroup.com (for agency subdomains)
        origin.endsWith('.chainsoftwaregroup.com');
    
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
          slug: tenant?.slug
        },
        tenantSettings: tenantSettings
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
          const consumer = await storage.findOrCreateConsumer({
            ...consumerData,
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

      // Create accounts
      const accountsToCreate = accountsData.map((accountData: any, index: number) => {
        if (!accountData.consumerEmail) {
          throw new Error(`Row ${index + 2}: Missing consumer email for account`);
        }
        
        const consumerEmailLower = accountData.consumerEmail.toLowerCase();
        const consumer = createdConsumers.get(consumerEmailLower);
        if (!consumer) {
          throw new Error(`Row ${index + 2}: Consumer not found for email: ${accountData.consumerEmail}`);
        }

        return {
          tenantId: tenantId,
          consumerId: consumer.id,
          folderId: targetFolderId,
          accountNumber: accountData.accountNumber || null,
          creditor: accountData.creditor,
          balanceCents: accountData.balanceCents,
          dueDate: accountData.dueDate || null,
          status: 'active',
          additionalData: accountData.additionalData || {},
        };
      });

      const createdAccounts = await storage.bulkCreateAccounts(accountsToCreate);
      
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

      if (!firstName || !lastName || !email || !creditor || balanceCents === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
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
        creditor,
        balanceCents,
        status: 'active',
        additionalData: {},
        dueDate: dueDate || null,
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

      const { name, subject, html } = req.body;
      
      if (!name || !subject || !html) {
        return res.status(400).json({ message: "Name, subject, and HTML content are required" });
      }

      const template = await storage.createEmailTemplate({
        tenantId: tenantId,
        name,
        subject,
        html,
        status: 'draft',
      });
      
      res.json(template);
    } catch (error) {
      console.error("Error creating email template:", error);
      res.status(500).json({ message: "Failed to create email template" });
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

      const { name, templateId, targetGroup } = req.body;
      
      if (!name || !templateId || !targetGroup) {
        return res.status(400).json({ message: "Name, template ID, and target group are required" });
      }

      // Get target consumers count
      const consumers = await storage.getConsumersByTenant(tenantId);
      let targetedConsumers = consumers;
      
      if (targetGroup === "with-balance") {
        const accounts = await storage.getAccountsByTenant(tenantId);
        const consumerIds = accounts.filter(acc => (acc.balanceCents || 0) > 0).map(acc => acc.consumerId);
        targetedConsumers = consumers.filter(c => consumerIds.includes(c.id));
      } else if (targetGroup === "decline") {
        // For decline status, we'll filter consumers based on a decline status field
        // This could be stored in consumer additionalData or a separate status field
        targetedConsumers = consumers.filter(c => 
          (c.additionalData && (c.additionalData as any).status === 'decline') ||
          (c.additionalData && (c.additionalData as any).folder === 'decline')
        );
      } else if (targetGroup === "recent-upload") {
        // For most recent upload, we'll need to track upload batches
        // For now, we'll use consumers created in the last 24 hours as a proxy
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        targetedConsumers = consumers.filter(c => 
          c.createdAt && new Date(c.createdAt) > yesterday
        );
      }

      const campaign = await storage.createEmailCampaign({
        tenantId: tenantId,
        name,
        templateId,
        targetGroup,
        totalRecipients: targetedConsumers.length,
        status: 'sending',
      });

      // Get email template for variable replacement
      const templates = await storage.getEmailTemplatesByTenant(tenantId);
      const template = templates.find(t => t.id === templateId);
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }

      // Get tenant details for URL generation
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      // Get tenant settings for contact info (email/phone)
      const tenantSettings = await storage.getTenantSettings(tenantId);
      const tenantWithSettings = { 
        ...tenant, 
        contactEmail: tenantSettings?.contactEmail,
        contactPhone: tenantSettings?.contactPhone
      };

      // Process variables for each consumer and prepare email content
      const accountsData = await storage.getAccountsByTenant(tenantId);
      
      // Prepare emails with variable replacement (filter out consumers without emails)
      const processedEmails = targetedConsumers
        .filter(consumer => consumer.email) // Only include consumers with valid emails
        .map(consumer => {
        // Find the primary account for this consumer (could be multiple accounts)
        const consumerAccount = accountsData.find(acc => acc.consumerId === consumer.id);
        
        // Replace variables in both subject and HTML content
        const processedSubject = replaceTemplateVariables(template.subject || '', consumer, consumerAccount, tenantWithSettings);
        const processedHtml = replaceTemplateVariables(template.html || '', consumer, consumerAccount, tenantWithSettings);
        
        // Create branded sender email: "Agency Name <slug@chainsoftwaregroup.com>"
        const fromEmail = `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>`;
        
        return {
          to: consumer.email!,
          from: fromEmail,
          subject: processedSubject,
          html: processedHtml,
          tag: `campaign-${campaign.id}`,
          metadata: {
            campaignId: campaign.id,
            tenantId: tenantId || '',
            consumerId: consumer.id,
            templateId: templateId,
            accountNumber: consumerAccount?.accountNumber || '',
            filenumber: consumerAccount?.accountNumber || '',
          }
        };
      });

      // Send emails via Postmark
      console.log(`📧 Sending ${processedEmails.length} emails via Postmark...`);
      const emailResults = await emailService.sendBulkEmails(processedEmails);
      
      // Update campaign status
      await storage.updateEmailCampaign(campaign.id, {
        status: 'completed',
        totalSent: emailResults.successful,
        totalErrors: emailResults.failed,
        totalRecipients: processedEmails.length,
        completedAt: new Date(),
      });

      console.log(`✅ Email campaign completed: ${emailResults.successful} sent, ${emailResults.failed} failed`);
      
      res.json({
        ...campaign,
        emailResults: {
          successful: emailResults.successful,
          failed: emailResults.failed,
          totalProcessed: processedEmails.length
        }
      });
    } catch (error) {
      console.error("Error creating email campaign:", error);
      res.status(500).json({ message: "Failed to create email campaign" });
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

      if ((campaign.status || '').toLowerCase() !== 'pending') {
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

  // SMS campaign routes
  app.get('/api/sms-campaigns', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const campaigns = await storage.getSmsCampaignsByTenant(tenantId);
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
        targetGroup: z.enum(["all", "with-balance", "decline", "recent-upload"]),
      });

      const { templateId, name, targetGroup } = insertSmsCampaignSchema.parse(req.body);

      const consumers = await storage.getConsumersByTenant(tenantId);
      const accountsData = await storage.getAccountsByTenant(tenantId);

      let targetedConsumers = consumers;

      if (targetGroup === "with-balance") {
        const consumerIds = accountsData
          .filter(acc => (acc.balanceCents || 0) > 0)
          .map(acc => acc.consumerId);
        targetedConsumers = consumers.filter(c => consumerIds.includes(c.id));
      } else if (targetGroup === "decline") {
        targetedConsumers = consumers.filter(c =>
          (c.additionalData && (c.additionalData as any).status === 'decline') ||
          (c.additionalData && (c.additionalData as any).folder === 'decline')
        );
      } else if (targetGroup === "recent-upload") {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        targetedConsumers = consumers.filter(c =>
          c.createdAt && new Date(c.createdAt) > yesterday
        );
      }

      const campaign = await storage.createSmsCampaign({
        tenantId,
        templateId,
        name,
        targetGroup,
        totalRecipients: targetedConsumers.length,
        status: 'sending',
      });

      const templates = await storage.getSmsTemplatesByTenant(tenantId);
      const template = templates.find(t => t.id === templateId);
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
        contactPhone: tenantSettings?.contactPhone
      };

      const processedMessages = targetedConsumers
        .filter(consumer => consumer.phone)
        .map(consumer => {
          const consumerAccount = accountsData.find(acc => acc.consumerId === consumer.id);
          const processedMessage = replaceTemplateVariables(template.message || '', consumer, consumerAccount, tenantWithSettings);
          return {
            to: consumer.phone!,
            message: processedMessage,
            consumerId: consumer.id,
          };
        });

      console.log(`📱 Sending ${processedMessages.length} SMS messages via Twilio...`);
      const smsResults = await smsService.sendBulkSms(processedMessages, tenantId, campaign.id);

      const updatedCampaign = await storage.updateSmsCampaign(campaign.id, {
        status: smsResults.totalQueued > 0 ? 'sending' : 'completed',
        totalSent: smsResults.totalSent,
        totalErrors: smsResults.totalFailed,
        totalRecipients: processedMessages.length,
        completedAt: smsResults.totalQueued > 0 ? null : new Date(),
      });

      console.log(
        `✅ SMS campaign processed: ${smsResults.totalSent} sent immediately, ${smsResults.totalQueued} queued, ${smsResults.totalFailed} failed`
      );

      res.json({
        ...updatedCampaign,
        smsResults: {
          sent: smsResults.totalSent,
          queued: smsResults.totalQueued,
          failed: smsResults.totalFailed,
          totalProcessed: processedMessages.length,
        }
      });
    } catch (error) {
      console.error("Error creating SMS campaign:", error);
      res.status(500).json({ message: "Failed to create SMS campaign" });
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

      if ((campaign.status || '').toLowerCase() !== 'pending') {
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

      const insertAutomationSchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(['email', 'sms']),
        templateId: z.string().uuid().optional(), // For single template (one-time)
        templateIds: z.array(z.string().uuid()).optional(), // For multiple templates (recurring)
        templateSchedule: z.array(z.object({
          templateId: z.string().uuid(),
          dayOffset: z.number().min(0)
        })).optional(), // For sequence-based scheduling
        triggerType: z.enum(['schedule', 'event', 'manual']),
        scheduleType: z.enum(['once', 'daily', 'weekly', 'monthly', 'sequence']).optional(),
        scheduledDate: z.string().optional(),
        scheduleTime: z.string().optional(),
        scheduleWeekdays: z.array(z.string()).optional(),
        scheduleDayOfMonth: z.string().optional(),
        eventType: z.enum(['account_created', 'payment_overdue', 'custom']).optional(),
        eventDelay: z.string().optional(),
        targetType: z.enum(['all', 'folder', 'custom']),
        targetFolderIds: z.array(z.string().uuid()).optional(),
        targetCustomerIds: z.array(z.string().uuid()).optional(),
      }).refine(data => {
        // Either templateId, templateIds, or templateSchedule must be provided
        return data.templateId || 
               (data.templateIds && data.templateIds.length > 0) ||
               (data.templateSchedule && data.templateSchedule.length > 0);
      }, {
        message: "Either templateId, templateIds, or templateSchedule must be provided"
      }).refine(data => {
        // If scheduleType is 'sequence', templateSchedule must be provided
        if (data.scheduleType === 'sequence') {
          return data.templateSchedule && data.templateSchedule.length > 0;
        }
        return true;
      }, {
        message: "Template sequence is required when scheduleType is 'sequence'"
      });

      const validatedData = insertAutomationSchema.parse(req.body);
      
      // Calculate next execution if it's a scheduled automation
      let nextExecution = null;
      if (validatedData.triggerType === 'schedule' && validatedData.scheduledDate) {
        nextExecution = new Date(validatedData.scheduledDate);
      }

      const automationData: any = {
        ...validatedData,
        tenantId: tenantId,
      };
      
      // Convert scheduledDate string to Date if provided
      if (automationData.scheduledDate) {
        automationData.scheduledDate = new Date(automationData.scheduledDate);
      }
      
      const newAutomation = await storage.createAutomation(automationData);
      
      res.status(201).json(newAutomation);
    } catch (error) {
      console.error("Error creating automation:", error);
      res.status(500).json({ message: "Failed to create automation" });
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
        scheduleType: z.enum(['once', 'daily', 'weekly', 'monthly']).optional(),
        scheduledDate: z.string().optional(),
        scheduleTime: z.string().optional(),
        scheduleWeekdays: z.array(z.string()).optional(),
        scheduleDayOfMonth: z.string().optional(),
        targetType: z.enum(['all', 'folder', 'custom']).optional(),
        targetFolderIds: z.array(z.string().uuid()).optional(),
        targetCustomerIds: z.array(z.string().uuid()).optional(),
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
        logoUrl: customBranding?.logoUrl || (tenant.brand as any)?.logoUrl || null,
        primaryColor: customBranding?.primaryColor || '#3B82F6',
        secondaryColor: customBranding?.secondaryColor || '#1E40AF',
        contactEmail: settings?.contactEmail || null,
        contactPhone: settings?.contactPhone || null,
        hasPrivacyPolicy: !!settings?.privacyPolicy,
        hasTermsOfService: !!settings?.termsOfService,
        privacyPolicy: settings?.privacyPolicy || null,
        termsOfService: settings?.termsOfService || null,
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
        tenantId // Always include tenantId since it's now required
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
      // Extend validation to include username and password
      const registrationWithCredentialsSchema = agencyTrialRegistrationSchema.extend({
        username: z.string().min(3).max(50),
        password: z.string().min(8).max(100),
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

  // Mobile authentication endpoints
  // Step 1: Verify email + DOB and return matching agencies
  app.post('/api/mobile/auth/verify', async (req, res) => {
    try {
      const { email, dateOfBirth } = req.body;

      if (!email || !dateOfBirth) {
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
      
      res.json(combinedSettings);
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
        customBranding: z.any().optional(),
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
        merchantApiKey: z.string().nullable().optional(),
        merchantApiPin: z.string().nullable().optional(),
        merchantName: z.string().nullable().optional(),
        merchantType: z.string().nullable().optional(),
        useSandbox: z.boolean().optional(),
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
        ...otherSettings 
      } = validatedData;

      // Preserve SMAX credentials if they're submitted as masked values
      const currentSettings = await storage.getTenantSettings(tenantId);
      const finalSmaxApiKey = (smaxApiKey && smaxApiKey !== '••••••••') ? smaxApiKey : currentSettings?.smaxApiKey;
      const finalSmaxPin = (smaxPin && smaxPin !== '••••••••') ? smaxPin : currentSettings?.smaxPin;

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
      const settings = await storage.upsertTenantSettings({
        ...otherSettings,
        smaxApiKey: finalSmaxApiKey,
        smaxPin: finalSmaxPin,
        tenantId: tenantId,
      });
      
      res.json(settings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
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
      const result = await smaxService.testConnection(tenantId);
      
      res.json(result);
    } catch (error: any) {
      console.error("Error testing SMAX connection:", error);
      res.status(500).json({ 
        success: false,
        error: error.message || "Failed to test SMAX connection" 
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
      
      res.json(applicableOptions);
    } catch (error) {
      console.error("Error fetching arrangement options:", error);
      res.status(500).json({ message: "Failed to fetch arrangement options" });
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

      // Create Basic Auth header
      const authString = Buffer.from(`${merchantApiKey}:${merchantApiPin}`).toString('base64');

      // Test connection by making a simple API call (get merchant info)
      const testResponse = await fetch(`${baseUrl}/merchant`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📡 USAePay Response:', {
        status: testResponse.status,
        statusText: testResponse.statusText,
        ok: testResponse.ok
      });

      if (testResponse.ok) {
        const merchantData = await testResponse.json();
        console.log('✅ USAePay connection successful:', merchantData);
        return res.json({ 
          success: true, 
          message: `Successfully connected to ${useSandbox ? 'Sandbox' : 'Production'} USAePay`,
          merchantName: merchantData.name || merchantName || "Unknown",
          mode: useSandbox ? 'sandbox' : 'production'
        });
      } else {
        const errorData = await testResponse.text();
        console.error('❌ USAePay connection failed:', errorData);
        return res.json({ 
          success: false, 
          message: `Connection failed: ${testResponse.statusText}. Please verify your credentials.`,
          error: errorData
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

  // Consumer payment processing endpoint
  app.post('/api/consumer/payments/process', authenticateConsumer, async (req: any, res) => {
    try {
      const { id: consumerId, tenantId } = req.consumer || {};

      if (!consumerId || !tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

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
        firstPaymentDate
      } = req.body;

      if (!accountId || !cardNumber || !expiryMonth || !expiryYear || !cvv || !cardName) {
        return res.status(400).json({ message: "Missing required payment information" });
      }

      // Fetch and validate the account belongs to this consumer
      const account = await storage.getAccount(accountId);
      if (!account || account.consumerId !== consumerId || account.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied to this account" });
      }

      // Get arrangement if specified
      let arrangement = null;
      let amountCents = account.balanceCents || 0;
      
      if (arrangementId) {
        const arrangements = await storage.getArrangementOptionsByTenant(tenantId);
        arrangement = arrangements.find(arr => arr.id === arrangementId);
        
        if (!arrangement) {
          return res.status(400).json({ message: "Invalid arrangement selected" });
        }

        // Calculate payment amount based on arrangement type
        if (arrangement.planType === 'settlement' && arrangement.payoffPercentageBasisPoints) {
          // Settlement: percentage of balance
          amountCents = Math.round(amountCents * arrangement.payoffPercentageBasisPoints / 10000);
        } else if (arrangement.planType === 'fixed_monthly' && arrangement.fixedMonthlyPayment) {
          // Fixed monthly payment
          amountCents = arrangement.fixedMonthlyPayment;
        } else if (arrangement.planType === 'range' && arrangement.monthlyPaymentMin) {
          // Range: use minimum payment for recurring
          amountCents = arrangement.monthlyPaymentMin;
        } else if (arrangement.planType === 'pay_in_full') {
          // Pay in full: can be percentage discount or fixed amount
          if (arrangement.payoffPercentageBasisPoints) {
            amountCents = Math.round(amountCents * arrangement.payoffPercentageBasisPoints / 10000);
          } else if (arrangement.payInFullAmount) {
            amountCents = arrangement.payInFullAmount;
          }
        }
      }
      
      if (amountCents <= 0) {
        return res.status(400).json({ message: "Invalid payment amount" });
      }

      // Get tenant settings to check if online payments are enabled
      const settings = await storage.getTenantSettings(tenantId);
      if (!settings?.enableOnlinePayments) {
        return res.status(403).json({ message: "Online payments are not enabled for this agency" });
      }

      // Get USAePay credentials from tenant settings
      const { merchantApiKey, merchantApiPin, useSandbox } = settings;

      if (!merchantApiKey || !merchantApiPin) {
        console.error("USAePay credentials not configured for tenant:", tenantId);
        return res.status(500).json({ message: "Payment processing is not configured. Please contact your agency." });
      }

      // Determine API endpoint based on sandbox mode
      const usaepayBaseUrl = useSandbox 
        ? "https://sandbox.usaepay.com/api/v2"
        : "https://secure.usaepay.com/api/v2";

      const authHeader = `Basic ${Buffer.from(`${merchantApiKey}:${merchantApiPin}`).toString('base64')}`;
      
      // Step 1: Tokenize the card if we need to save it
      let paymentToken = null;
      let cardLast4 = cardNumber.slice(-4);
      let cardBrand = null;

      if (saveCard || setupRecurring) {
        const tokenPayload = {
          creditcard: {
            number: cardNumber.replace(/\s/g, ''),
            expiration: `${expiryMonth}${expiryYear.slice(-2)}`,
            cardholder: cardName,
            avs_zip: zipCode || ""
          }
        };

        const tokenResponse = await fetch(`${usaepayBaseUrl}/paymentmethods`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
          },
          body: JSON.stringify(tokenPayload)
        });

        if (tokenResponse.ok) {
          const tokenResult = await tokenResponse.json();
          paymentToken = tokenResult.key || tokenResult.token;
          cardBrand = tokenResult.cardtype || tokenResult.card_type;
        }
      }

      // Step 2: Process payment (use token if available, otherwise use card directly)
      let usaepayPayload: any = {
        command: "sale",
        amount: (amountCents / 100).toFixed(2),
        invoice: accountId || `consumer_${consumerId}`,
        description: arrangement 
          ? `${arrangement.name} - Payment for account`
          : `Payment for account`
      };

      if (paymentToken) {
        // Use saved token for payment
        usaepayPayload.paymentkey = paymentToken;
        usaepayPayload.cvv = cvv; // CVV still required for token payments
      } else {
        // Use card directly
        usaepayPayload.creditcard = {
          number: cardNumber.replace(/\s/g, ''),
          expiration: `${expiryMonth}${expiryYear.slice(-2)}`,
          cvv: cvv,
          cardholder: cardName,
          avs_street: "",
          avs_zip: zipCode || ""
        };
      }

      const usaepayResponse = await fetch(`${usaepayBaseUrl}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(usaepayPayload)
      });

      const usaepayResult = await usaepayResponse.json();

      const success = usaepayResult.result === 'Approved' || usaepayResult.status === 'Approved';
      const transactionId = usaepayResult.refnum || usaepayResult.key || `tx_${Date.now()}`;
      
      // Extract card brand if not already set
      if (!cardBrand && usaepayResult.cardtype) {
        cardBrand = usaepayResult.cardtype;
      }

      // Create payment record
      const payment = await storage.createPayment({
        tenantId: tenantId,
        consumerId: consumerId,
        accountId: accountId || null,
        amountCents,
        paymentMethod: 'credit_card',
        status: success ? 'completed' : 'failed',
        transactionId: transactionId,
        processorResponse: JSON.stringify(usaepayResult),
        processedAt: success ? new Date() : null,
        notes: arrangement 
          ? `${arrangement.name} - ${cardName} ending in ${cardLast4}`
          : `Online payment - ${cardName} ending in ${cardLast4}`,
      });

      // Step 3: Save payment method if requested and payment successful
      let savedPaymentMethod = null;
      if (success && paymentToken && (saveCard || setupRecurring)) {
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

      // Step 4: Create payment schedule if requested
      if (success && setupRecurring && arrangement && savedPaymentMethod) {
        // Use firstPaymentDate if provided, otherwise use today
        const paymentStartDate = firstPaymentDate ? new Date(firstPaymentDate) : new Date();
        const nextMonth = new Date(paymentStartDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        
        // Determine number of payments based on arrangement
        let remainingPayments = null;
        let endDate = null;
        
        if (arrangement.planType === 'settlement') {
          // Settlement is one-time, no recurring
          // Skip creating schedule
        } else if (arrangement.planType === 'fixed_monthly' && arrangement.maxTermMonths) {
          remainingPayments = Number(arrangement.maxTermMonths) - 1; // Minus the one we just made
          endDate = new Date(paymentStartDate);
          endDate.setMonth(endDate.getMonth() + Number(arrangement.maxTermMonths));
        }
        
        // Only create schedule for non-settlement arrangements
        if (arrangement.planType !== 'settlement' && arrangementId) {
          await storage.createPaymentSchedule({
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
          });
        }
      }

      // Step 5: Update account balance
      if (accountId && success) {
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
      if (success) {
        try {
          const { smaxService } = await import('./smaxService');
          if (accountId) {
            const account = await storage.getAccount(accountId);
            if (account) {
              await smaxService.insertPayment(tenantId, {
                filenumber: account.accountNumber || account.id,
                paymentamount: amountCents / 100,
                paymentdate: new Date().toISOString().split('T')[0],
                paymentmethod: 'credit_card',
                transactionid: transactionId,
                status: 'completed',
                notes: `Online consumer payment - ${cardName} ending in ${cardNumber.slice(-4)}`,
              });
            }
          }
        } catch (smaxError) {
          console.error('SMAX notification failed:', smaxError);
        }
      }

      if (!success) {
        return res.status(400).json({
          success: false,
          message: usaepayResult.error || usaepayResult.result_code || "Payment declined. Please check your card details and try again."
        });
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

  // Process scheduled payments (called by cron/scheduler)
  app.post('/api/payments/process-scheduled', async (req: any, res) => {
    try {
      const { apiKey } = req.body;
      
      // Simple API key check (you should use a proper auth mechanism)
      if (apiKey !== process.env.CRON_API_KEY) {
        return res.status(401).json({ message: "Unauthorized" });
      }

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
            // Check if payment is due today and schedule is active
            if (schedule.status === 'active' && schedule.nextPaymentDate === today) {
              try {
                // Get payment method
                const paymentMethods = await storage.getPaymentMethodsByConsumer(consumer.id, tenant.id);
                const paymentMethod = paymentMethods.find(pm => pm.id === schedule.paymentMethodId);
                
                if (!paymentMethod) {
                  console.error(`Payment method not found for schedule ${schedule.id}`);
                  continue;
                }

                // Get tenant settings for USAePay credentials
                const settings = await storage.getTenantSettings(tenant.id);
                if (!settings?.merchantApiKey || !settings?.merchantApiPin) {
                  console.error(`USAePay not configured for tenant ${tenant.id}`);
                  continue;
                }

                const usaepayBaseUrl = settings.useSandbox 
                  ? "https://sandbox.usaepay.com/api/v2"
                  : "https://secure.usaepay.com/api/v2";

                const authHeader = `Basic ${Buffer.from(`${settings.merchantApiKey}:${settings.merchantApiPin}`).toString('base64')}`;

                // Process payment using saved token
                const paymentPayload = {
                  command: "sale",
                  amount: (schedule.amountCents / 100).toFixed(2),
                  paymentkey: paymentMethod.paymentToken,
                  invoice: schedule.accountId,
                  description: `Scheduled ${schedule.arrangementType} payment`
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

                  processedPayments.push({ scheduleId: schedule.id, consumerId: consumer.id });
                } else {
                  // Payment failed - update failed attempts
                  const failedAttempts = (schedule.failedAttempts || 0) + 1;
                  const scheduleStatus = failedAttempts >= 3 ? 'failed' : 'active';

                  await storage.updatePaymentSchedule(schedule.id, tenant.id, {
                    failedAttempts,
                    status: scheduleStatus,
                  });

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
      if (!tenantId) { 
        return res.status(403).json({ message: "No tenant access" });
      }

      const payments = await storage.getPaymentsByTenant(tenantId);
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
          await smaxService.insertPayment(tenantId, {
            filenumber: account.accountNumber || account.id,
            paymentamount: amountCents / 100,
            paymentdate: new Date().toISOString().split('T')[0],
            paymentmethod: 'credit_card',
            transactionid: processorResponse.transactionId,
            status: processorResponse.success ? 'completed' : 'failed',
            notes: `Online payment - ${cardName} ending in ${cardNumber.slice(-4)}`,
          });
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
        let accountNumber = null;
        if (accountId) {
          const account = await storage.getAccount(accountId);
          accountNumber = account?.accountNumber || accountId;
        } else {
          const accounts = await storage.getAccountsByConsumer(consumer.id);
          if (accounts && accounts.length > 0) {
            accountNumber = accounts[0].accountNumber || accounts[0].id;
          }
        }
        
        if (accountNumber) {
          await smaxService.insertPayment(tenantId, {
            filenumber: accountNumber,
            paymentamount: amountCents / 100,
            paymentdate: new Date().toISOString().split('T')[0],
            paymentmethod: paymentMethod || 'manual',
            transactionid: transactionId || `manual_${Date.now()}`,
            status: 'completed',
            notes: notes || 'Manual payment entry',
          });
        }
      } catch (smaxError) {
        console.error('SMAX notification failed:', smaxError);
      }

      res.json(payment);
    } catch (error) {
      console.error("Error recording manual payment:", error);
      res.status(500).json({ message: "Failed to record payment" });
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

  app.get('/api/billing/plans', authenticateUser, async (_req: any, res) => {
    try {
      const plans = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true))
        .orderBy(subscriptionPlans.displayOrder);

      const formattedPlans = plans.map(plan => ({
        id: plan.slug,
        name: plan.name,
        price: plan.monthlyPriceCents / 100,
        setupFee: (plan.setupFeeCents ?? 10000) / 100,
        includedEmails: plan.includedEmails,
        includedSmsSegments: plan.includedSms,
        emailOverageRatePer1000: (plan.emailOverageRatePer1000 ?? 250) / 100,
        smsOverageRatePerSegment: (plan.smsOverageRatePerSegment ?? 3) / 100,
      }));

      res.json({
        plans: formattedPlans,
        emailOverageRatePerThousand: 2.50,
        smsOverageRatePerSegment: 0.03,
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

  // Twilio webhook endpoint for SMS delivery tracking and usage
  app.post('/api/webhooks/twilio', async (req, res) => {
    try {
      const messageSid = req.body.MessageSid || req.body.SmsSid;
      const status = (req.body.MessageStatus || req.body.SmsStatus || '').toLowerCase();

      if (!messageSid) {
        return res.status(400).json({ message: 'Missing MessageSid' });
      }

      const relevantStatuses = new Set(['sent', 'delivered', 'undelivered', 'failed']);
      if (!relevantStatuses.has(status)) {
        return res.status(200).json({ message: 'Status ignored' });
      }

      const segmentsRaw = req.body.NumSegments || req.body.SmsSegments || '1';
      const segmentsParsed = Number.parseInt(Array.isArray(segmentsRaw) ? segmentsRaw[0] : segmentsRaw, 10);
      const quantity = Number.isFinite(segmentsParsed) && segmentsParsed > 0 ? segmentsParsed : 1;

      let tenantId = (req.body.TenantId || req.body.tenantId) as string | undefined;
      const trackingInfo = await storage.findSmsTrackingByExternalId(messageSid);

      if (!tenantId) {
        tenantId = trackingInfo?.tenantId ?? undefined;
      }

      if (trackingInfo?.tracking) {
        const normalizedStatus = status === 'undelivered' ? 'failed' : status;
        const updates: Partial<SmsTracking> = {
          status: normalizedStatus as SmsTracking['status'],
        };

        if (status === 'delivered') {
          updates.deliveredAt = new Date();
        }

        if (status === 'failed' || status === 'undelivered') {
          const errorMessage = req.body.ErrorMessage || req.body.ErrorCode;
          if (errorMessage) {
            updates.errorMessage = errorMessage;
          }
        }

        await storage.updateSmsTracking(trackingInfo.tracking.id, updates);
      }

      if (!tenantId) {
        console.warn('Twilio webhook missing tenant context', { messageSid, status });
        return res.status(200).json({ message: 'No tenant resolved' });
      }

      await storage.recordMessagingUsageEvent({
        tenantId,
        provider: 'twilio',
        messageType: 'sms',
        quantity,
        externalMessageId: messageSid,
        occurredAt: new Date(),
        metadata: req.body,
      });

      res.status(200).json({ message: 'Webhook processed' });
    } catch (error) {
      console.error('Twilio webhook error:', error);
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

    // Only process events that have our tracking metadata
    if (!Metadata?.campaignId && !Tag) return;

    const campaignId = Metadata?.campaignId;
    const tenantId = Metadata?.tenantId as string | undefined;
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

    // Notify SMAX for email open events
    if (tenantId && normalizedRecordType === 'open') {
      try {
        const { smaxService } = await import('./smaxService');
        const accountNumber = Metadata?.accountNumber || Metadata?.filenumber;
        
        if (accountNumber) {
          await smaxService.insertAttempt(tenantId, {
            filenumber: accountNumber,
            attempttype: 'email_open',
            attemptdate: new Date().toISOString().split('T')[0],
            notes: `Email opened by ${Recipient}`,
            result: 'opened',
          });
        }
      } catch (smaxError) {
        console.error('SMAX email open notification failed:', smaxError);
      }
    }
  }

  // Update campaign metrics based on event type
  async function updateCampaignMetrics(campaignId: string, eventType: string) {
    try {
      console.log(`Updating campaign ${campaignId} for event ${eventType}`);
      // For now, just log the metrics update - we'll implement proper updates later
      // This avoids crashes while maintaining the webhook functionality
    } catch (error) {
      console.error('Error updating campaign metrics:', error);
    }
  }

  // Mobile app version check endpoint
  app.get('/api/app-version', (req, res) => {
    // This would typically check a database or config file
    // For now, return a static version
    res.json({
      version: '1.0.0',
      minVersion: '1.0.0',
      forceUpdate: false,
      updateUrl: 'https://apps.apple.com/app/chain', // Update with real URLs
      androidUpdateUrl: 'https://play.google.com/store/apps/details?id=com.chaincomms.chain',
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
