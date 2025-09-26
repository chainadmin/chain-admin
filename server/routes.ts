import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { storage, type IStorage } from "./storage";
import { authenticateUser, authenticateConsumer, getCurrentUser } from "./authMiddleware";
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
import { uploadLogo } from "./supabaseStorage";
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

// Multer configuration for image uploads - using memory storage for Supabase
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
    agencyEmail: tenant?.email || '',
    agencyPhone: tenant?.phoneNumber || tenant?.twilioPhoneNumber || '',
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

  // Body parser middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Subdomain detection middleware
  app.use(subdomainMiddleware);

  // Explicit SPA fallback for the platform admin entry point to avoid 404s
  app.get(["/admin", "/admin/*", "/Admin", "/Admin/*"], (req, res, next) => {
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

  // Note: Logos are now served from Supabase Storage, not local uploads

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
  app.get('/api/consumer/accounts/:email', authenticateConsumer, async (req: any, res) => {
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
          phone: consumer.phone
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

      const consumers = await storage.getConsumersByTenant(tenantId);
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

  app.delete('/api/consumers/:id', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = await getTenantId(req, storage);

      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      const consumer = await storage.getConsumer(id);

      if (!consumer || consumer.tenantId !== tenantId) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      await storage.deleteConsumer(id, tenantId);

      res.status(204).send();
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

  // Consumer portal routes - now with authentication
  app.get('/api/consumer/accounts/:email', authenticateConsumer, async (req: any, res) => {
    try {
      const { email } = req.params;
      const normalizedEmail = (email || '').trim().toLowerCase();
      const normalizedConsumerEmail = (req.consumer.email || '').trim().toLowerCase();

      // Verify the email in the URL matches the authenticated consumer's email
      if (!normalizedEmail || normalizedEmail !== normalizedConsumerEmail) {
        return res.status(403).json({ message: "Access denied to this account" });
      }
      
      // Get tenant from the authenticated consumer's tenantId
      const tenant = await storage.getTenant(req.consumer.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      // Get the consumer data
      const consumers = await storage.getConsumersByTenant(tenant.id);
      const consumer = consumers.find(c => c.id === req.consumer.id);
      
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      const accounts = await storage.getAccountsByConsumer(consumer.id);
      const tenantSettings = await storage.getTenantSettings(tenant.id);
      res.json({ consumer, accounts, tenant, tenantSettings });
    } catch (error) {
      console.error("Error fetching consumer accounts:", error);
      res.status(500).json({ message: "Failed to fetch consumer accounts" });
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
        const consumer = await storage.findOrCreateConsumer({
          ...consumerData,
          tenantId: tenantId,
          folderId: targetFolderId,
        });
        createdConsumers.set(consumer.email, consumer);
      }

      // Create accounts
      const accountsToCreate = accountsData.map((accountData: any) => {
        const consumer = createdConsumers.get(accountData.consumerEmail);
        if (!consumer) {
          throw new Error(`Consumer not found for email: ${accountData.consumerEmail}`);
        }

        return {
          tenantId: tenantId,
          consumerId: consumer.id,
          folderId: targetFolderId,
          accountNumber: accountData.accountNumber,
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
    } catch (error) {
      console.error("Error importing CSV:", error);
      res.status(500).json({ message: "Failed to import CSV data" });
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

  app.post('/api/email-campaigns', authenticateUser, async (req: any, res) => {
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

      // Process variables for each consumer and prepare email content
      const accountsData = await storage.getAccountsByTenant(tenantId);
      
      // Prepare emails with variable replacement (filter out consumers without emails)
      const processedEmails = targetedConsumers
        .filter(consumer => consumer.email) // Only include consumers with valid emails
        .map(consumer => {
        // Find the primary account for this consumer (could be multiple accounts)
        const consumerAccount = accountsData.find(acc => acc.consumerId === consumer.id);
        
        // Replace variables in both subject and HTML content
        const processedSubject = replaceTemplateVariables(template.subject || '', consumer, consumerAccount, tenant);
        const processedHtml = replaceTemplateVariables(template.html || '', consumer, consumerAccount, tenant);
        
        return {
          to: consumer.email!,
          from: tenant.email || 'noreply@chainplatform.com', // Use tenant email or default
          subject: processedSubject,
          html: processedHtml,
          tag: `campaign-${campaign.id}`,
          metadata: {
            campaignId: campaign.id,
            tenantId: tenantId || '',
            consumerId: consumer.id,
            templateId: templateId,
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
      const fromEmail = 'support@chainsoftwaregroup.com'; // Use our configured Postmark sender

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
        }
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

  app.post('/api/sms-campaigns', authenticateUser, async (req: any, res) => {
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

      const processedMessages = targetedConsumers
        .filter(consumer => consumer.phone)
        .map(consumer => {
          const consumerAccount = accountsData.find(acc => acc.consumerId === consumer.id);
          const processedMessage = replaceTemplateVariables(template.message || '', consumer, consumerAccount, tenant);
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

      const trimmedEmail = String(email).trim();

      let consumersFound = await storage.getConsumersByEmail(trimmedEmail);

      if (consumersFound.length === 0) {
        return res.status(404).json({
          message: "No account found with this email. Please contact your agency for account details.",
        });
      }

      const unlinkedConsumers = consumersFound.filter(c => !c.tenantId);

      if (unlinkedConsumers.length > 0) {
        const matchingAccounts = await storage.findAccountsByConsumerEmail(trimmedEmail);
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
            `Auto-linked consumer(s) with email ${trimmedEmail} to tenant ${resolvedTenantId} based on matching accounts`
          );
          consumersFound = await storage.getConsumersByEmail(trimmedEmail);
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
            email: trimmedEmail,
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

  // Consumer notifications route
  app.get('/api/consumer-notifications/:email/:tenantSlug', async (req, res) => {
    try {
      const { email, tenantSlug } = req.params;
      
      const consumer = await storage.getConsumerByEmailAndTenant(email, tenantSlug);
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      const notifications = await storage.getNotificationsByConsumer(consumer.id);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching consumer notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // Mark notification as read
  app.patch('/api/consumer-notifications/:id/read', async (req, res) => {
    try {
      const { id } = req.params;
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
      payoffText: planType === "pay_in_full" ? payoffText : null,
      payoffPercentageBasisPoints: planType === "pay_in_full" ? payoffPercentage : null,
      payoffDueDate: planType === "pay_in_full" ? payoffDueDate : null,
      customTermsText: planType === "custom_terms" ? customTermsText : null,
      maxTermMonths:
        planType === "pay_in_full" || planType === "custom_terms"
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
      
      // Combine settings with Twilio settings from tenant
      const combinedSettings = {
        ...(settings || {}),
        twilioAccountSid: tenant?.twilioAccountSid || '',
        twilioAuthToken: tenant?.twilioAuthToken || '',
        twilioPhoneNumber: tenant?.twilioPhoneNumber || '',
        twilioBusinessName: tenant?.twilioBusinessName || '',
        twilioCampaignId: tenant?.twilioCampaignId || '',
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
        privacyPolicy: z.string().optional(),
        termsOfService: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        showPaymentPlans: z.boolean().optional(),
        showDocuments: z.boolean().optional(),
        allowSettlementRequests: z.boolean().optional(),
        customBranding: z.any().optional(),
        consumerPortalSettings: z.any().optional(),
        smsThrottleLimit: z.number().min(1).max(1000).optional(),
        // Twilio configuration per tenant
        twilioAccountSid: z.string().optional(),
        twilioAuthToken: z.string().optional(),
        twilioPhoneNumber: z.string().optional(),
        twilioBusinessName: z.string().optional(),
        twilioCampaignId: z.string().optional(),
      });

      const validatedData = settingsSchema.parse(req.body);

      // Separate Twilio settings from other settings
      const { 
        twilioAccountSid, 
        twilioAuthToken, 
        twilioPhoneNumber, 
        twilioBusinessName, 
        twilioCampaignId,
        ...otherSettings 
      } = validatedData;

      // Update tenant table with Twilio settings if any provided
      if (twilioAccountSid !== undefined || 
          twilioAuthToken !== undefined || 
          twilioPhoneNumber !== undefined || 
          twilioBusinessName !== undefined || 
          twilioCampaignId !== undefined) {
        await storage.updateTenantTwilioSettings(tenantId, {
          twilioAccountSid: twilioAccountSid || null,
          twilioAuthToken: twilioAuthToken || null,
          twilioPhoneNumber: twilioPhoneNumber || null,
          twilioBusinessName: twilioBusinessName || null,
          twilioCampaignId: twilioCampaignId || null,
        });
      }

      // Update tenant settings table with other settings
      const settings = await storage.upsertTenantSettings({
        ...otherSettings,
        tenantId: tenantId,
      });
      
      res.json(settings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Logo upload route
  app.post('/api/upload/logo', authenticateUser, upload.single('logo'), async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Upload to Supabase Storage
      const logoResult = await uploadLogo(req.file, tenantId);
      
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
  app.get('/api/consumer/documents/:email', async (req, res) => {
    try {
      const { email } = req.params;
      const { tenantSlug } = req.query;
      
      if (!tenantSlug) {
        return res.status(400).json({ message: "Tenant slug required" });
      }

      const tenant = await storage.getTenantBySlug(tenantSlug as string);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const settings = await storage.getTenantSettings(tenant.id);
      if (!settings?.showDocuments) {
        return res.json([]);
      }

      const consumer = await storage.getConsumerByEmailAndTenant(email, tenantSlug as string);

      if (!consumer) {
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

  app.get('/api/consumer/arrangements/:email', async (req, res) => {
    try {
      const { email } = req.params;
      const { tenantSlug, balance } = req.query;
      
      if (!tenantSlug) {
        return res.status(400).json({ message: "Tenant slug required" });
      }

      const tenant = await storage.getTenantBySlug(tenantSlug as string);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
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
  app.post('/api/payments/process', authenticateUser, async (req: any, res) => {
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

      const planId = subscription.plan as MessagingPlanId;
      const plan = messagingPlans[planId];

      res.json({
        ...subscription,
        planId: plan?.id ?? subscription.plan,
        planName: plan?.name ?? subscription.plan,
        planPrice: plan?.price ?? subscription.monthlyBaseCents / 100,
        includedEmails: plan?.includedEmails ?? 0,
        includedSmsSegments: plan?.includedSmsSegments ?? 0,
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  app.get('/api/billing/plans', authenticateUser, async (_req: any, res) => {
    res.json({
      plans: messagingPlanList,
      emailOverageRatePerThousand: EMAIL_OVERAGE_RATE_PER_THOUSAND,
      smsOverageRatePerSegment: SMS_OVERAGE_RATE_PER_SEGMENT,
    });
  });

  app.post('/api/billing/select-plan', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const bodySchema = z.object({
        planId: z.string(),
        billingEmail: z.string().email().optional(),
      });

      const parseResult = bodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "Invalid plan selection",
          errors: parseResult.error.flatten(),
        });
      }

      const { planId, billingEmail } = parseResult.data;
      const plan = messagingPlans[planId as MessagingPlanId];

      if (!plan) {
        return res.status(400).json({ message: "Unknown plan selection" });
      }

      const now = new Date();
      const periodStart = now;
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const existingSubscription = await storage.getSubscriptionByTenant(tenantId);
      const subscriptionPayload = {
        plan: plan.id,
        monthlyBaseCents: plan.price * 100,
        pricePerConsumerCents: 0,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        status: 'active' as const,
        billingEmail: billingEmail ?? existingSubscription?.billingEmail ?? null,
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
        planId: plan.id,
        planName: plan.name,
        planPrice: plan.price,
        includedEmails: plan.includedEmails,
        includedSmsSegments: plan.includedSmsSegments,
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
  const isPlatformAdmin = async (req: any, res: any, next: any) => {
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
  app.put('/api/admin/tenants/:id/sms-config', authenticateUser, isPlatformAdmin, async (req: any, res) => {
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
  app.get('/api/admin/tenants', authenticateUser, isPlatformAdmin, async (req: any, res) => {
    try {
      const tenants = await storage.getAllTenants();
      
      // Get additional stats for each tenant
      const tenantsWithStats = await Promise.all(
        tenants.map(async (tenant) => {
          const consumerCount = await storage.getConsumerCountByTenant(tenant.id);
          const accountCount = await storage.getAccountCountByTenant(tenant.id);
          const totalBalance = await storage.getTotalBalanceByTenant(tenant.id);
          
          return {
            ...tenant,
            stats: {
              consumerCount,
              accountCount,
              totalBalanceCents: totalBalance,
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
  app.get('/api/admin/stats', authenticateUser, isPlatformAdmin, async (req: any, res) => {
    try {
      const stats = await storage.getPlatformStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching platform stats:", error);
      res.status(500).json({ message: "Failed to fetch platform stats" });
    }
  });

  // Update tenant status (activate/suspend)
  app.put('/api/admin/tenants/:id/status', authenticateUser, isPlatformAdmin, async (req: any, res) => {
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
  app.put('/api/admin/tenants/:id/upgrade', authenticateUser, isPlatformAdmin, async (req: any, res) => {
    try {
      const updatedTenant = await storage.upgradeTenantToPaid(req.params.id);
      res.json(updatedTenant);
    } catch (error) {
      console.error("Error upgrading tenant:", error);
      res.status(500).json({ message: "Failed to upgrade tenant" });
    }
  });

  // Create new agency with Postmark server
  app.post('/api/admin/agencies', authenticateUser, isPlatformAdmin, async (req: any, res) => {
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

    // Update campaign metrics
    if (campaignId) {
      await updateCampaignMetrics(campaignId, RecordType);
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
