import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertConsumerSchema, insertAccountSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";
import express from "express";

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

// Multer configuration for image uploads
const storage_multer = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = nanoid();
    const fileExtension = path.extname(file.originalname);
    cb(null, `logo-${uniqueSuffix}${fileExtension}`);
  }
});

const upload = multer({ 
  storage: storage_multer,
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Serve static files from uploads directory
  app.use('/uploads', express.static('public/uploads'));

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const platformUser = await storage.getPlatformUserWithTenant(userId);
      
      res.json({
        ...user,
        platformUser,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Tenant routes
  app.get('/api/tenants/:id', isAuthenticated, async (req: any, res) => {
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

  // Consumer routes
  app.get('/api/consumers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const consumers = await storage.getConsumersByTenant(platformUser.tenantId);
      res.json(consumers);
    } catch (error) {
      console.error("Error fetching consumers:", error);
      res.status(500).json({ message: "Failed to fetch consumers" });
    }
  });

  // Account routes
  app.get('/api/accounts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const accounts = await storage.getAccountsByTenant(platformUser.tenantId);
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

  // Consumer portal routes
  app.get('/api/consumer/accounts/:email', async (req, res) => {
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

      const consumers = await storage.getConsumersByTenant(tenant.id);
      const consumer = consumers.find(c => c.email === email);
      
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      const accounts = await storage.getAccountsByConsumer(consumer.id);
      const tenantSettings = await storage.getTenantSettings(tenant.id);
      res.json({ consumer, accounts, tenantSettings });
    } catch (error) {
      console.error("Error fetching consumer accounts:", error);
      res.status(500).json({ message: "Failed to fetch consumer accounts" });
    }
  });

  // Stats routes
  app.get('/api/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const stats = await storage.getTenantStats(platformUser.tenantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // CSV Import route
  app.post('/api/import/csv', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { consumers: consumersData, accounts: accountsData } = csvUploadSchema.parse(req.body);
      
      // Create consumers first
      const createdConsumers = new Map();
      for (const consumerData of consumersData) {
        const consumer = await storage.createConsumer({
          ...consumerData,
          tenantId: platformUser.tenantId,
        });
        createdConsumers.set(consumer.email, consumer);
      }

      // Create accounts
      const accountsToCreate = accountsData.map(accountData => {
        const consumer = createdConsumers.get(accountData.consumerEmail);
        if (!consumer) {
          throw new Error(`Consumer not found for email: ${accountData.consumerEmail}`);
        }

        return {
          tenantId: platformUser.tenantId!,
          consumerId: consumer.id,
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

  // Email template routes
  app.get('/api/email-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const templates = await storage.getEmailTemplatesByTenant(platformUser.tenantId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching email templates:", error);
      res.status(500).json({ message: "Failed to fetch email templates" });
    }
  });

  app.post('/api/email-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { name, subject, html } = req.body;
      
      if (!name || !subject || !html) {
        return res.status(400).json({ message: "Name, subject, and HTML content are required" });
      }

      const template = await storage.createEmailTemplate({
        tenantId: platformUser.tenantId,
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

  app.delete('/api/email-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { id } = req.params;
      await storage.deleteEmailTemplate(id, platformUser.tenantId);
      
      res.json({ message: "Email template deleted successfully" });
    } catch (error) {
      console.error("Error deleting email template:", error);
      res.status(500).json({ message: "Failed to delete email template" });
    }
  });

  // Email campaign routes
  app.get('/api/email-campaigns', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const campaigns = await storage.getEmailCampaignsByTenant(platformUser.tenantId);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching email campaigns:", error);
      res.status(500).json({ message: "Failed to fetch email campaigns" });
    }
  });

  app.post('/api/email-campaigns', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { name, templateId, targetGroup } = req.body;
      
      if (!name || !templateId || !targetGroup) {
        return res.status(400).json({ message: "Name, template ID, and target group are required" });
      }

      // Get target consumers count
      const consumers = await storage.getConsumersByTenant(platformUser.tenantId);
      let targetedConsumers = consumers;
      
      if (targetGroup === "with-balance") {
        const accounts = await storage.getAccountsByTenant(platformUser.tenantId);
        const consumerIds = accounts.filter(acc => (acc.balance || 0) > 0).map(acc => acc.consumerId);
        targetedConsumers = consumers.filter(c => consumerIds.includes(c.id));
      } else if (targetGroup === "overdue") {
        const accounts = await storage.getAccountsByTenant(platformUser.tenantId);
        const now = new Date();
        const consumerIds = accounts.filter(acc => 
          (acc.balance || 0) > 0 && 
          acc.dueDate && 
          new Date(acc.dueDate) < now
        ).map(acc => acc.consumerId);
        targetedConsumers = consumers.filter(c => consumerIds.includes(c.id));
      }

      const campaign = await storage.createEmailCampaign({
        tenantId: platformUser.tenantId,
        name,
        templateId,
        targetGroup,
        totalRecipients: targetedConsumers.length,
        status: 'sending',
      });

      // TODO: Here you would integrate with your email service provider
      // For now, simulate sending process with mock data
      setTimeout(async () => {
        await storage.updateEmailCampaign(campaign.id, {
          status: 'completed',
          totalSent: targetedConsumers.length,
          totalDelivered: Math.floor(targetedConsumers.length * 0.95), // 95% delivery rate
          totalOpened: Math.floor(targetedConsumers.length * 0.25), // 25% open rate
          totalClicked: Math.floor(targetedConsumers.length * 0.05), // 5% click rate
          totalErrors: Math.floor(targetedConsumers.length * 0.05), // 5% error rate
          totalOptOuts: Math.floor(targetedConsumers.length * 0.01), // 1% opt-out rate
          completedAt: new Date(),
        });
      }, 2000);
      
      res.json(campaign);
    } catch (error) {
      console.error("Error creating email campaign:", error);
      res.status(500).json({ message: "Failed to create email campaign" });
    }
  });

  // Email metrics route
  app.get('/api/email-metrics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const metrics = await storage.getEmailMetricsByTenant(platformUser.tenantId);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching email metrics:", error);
      res.status(500).json({ message: "Failed to fetch email metrics" });
    }
  });

  // Consumer registration route (public)
  app.post('/api/consumer-registration', async (req, res) => {
    try {
      const { 
        tenantSlug, 
        firstName, 
        lastName, 
        email, 
        phone, 
        dateOfBirth, 
        ssnLast4, 
        address, 
        city, 
        state, 
        zipCode 
      } = req.body;

      if (!tenantSlug || !firstName || !lastName || !email || !ssnLast4) {
        return res.status(400).json({ message: "Required fields missing" });
      }

      // Get tenant
      const tenant = await storage.getTenantBySlug(tenantSlug);
      if (!tenant) {
        return res.status(404).json({ message: "Agency not found" });
      }

      // Check if consumer already exists
      const existingConsumer = await storage.getConsumerByEmailAndTenant(email, tenantSlug);
      if (existingConsumer) {
        return res.status(409).json({ message: "Consumer already registered with this email" });
      }

      // Register consumer
      const consumer = await storage.registerConsumer({
        tenantId: tenant.id,
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        ssnLast4,
        address,
        city,
        state,
        zipCode,
      });

      res.json({ 
        message: "Registration successful", 
        consumerId: consumer.id,
        consumer: {
          id: consumer.id,
          firstName: consumer.firstName,
          lastName: consumer.lastName,
          email: consumer.email,
        }
      });
    } catch (error) {
      console.error("Error during consumer registration:", error);
      res.status(500).json({ message: "Registration failed" });
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
  app.get('/api/callback-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const requests = await storage.getCallbackRequestsByTenant(platformUser.tenantId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching callback requests:", error);
      res.status(500).json({ message: "Failed to fetch callback requests" });
    }
  });

  // Update callback request (admin)
  app.patch('/api/callback-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
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
  app.post('/api/setup-tenant', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, slug } = req.body;
      
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
  app.get('/api/documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const documents = await storage.getDocumentsByTenant(platformUser.tenantId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post('/api/documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const document = await storage.createDocument({
        ...req.body,
        tenantId: platformUser.tenantId,
      });
      
      res.json(document);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  app.delete('/api/documents/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteDocument(req.params.id);
      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Arrangement options routes
  app.get('/api/arrangement-options', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const options = await storage.getArrangementOptionsByTenant(platformUser.tenantId);
      res.json(options);
    } catch (error) {
      console.error("Error fetching arrangement options:", error);
      res.status(500).json({ message: "Failed to fetch arrangement options" });
    }
  });

  app.post('/api/arrangement-options', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const option = await storage.createArrangementOption({
        ...req.body,
        tenantId: platformUser.tenantId,
      });
      
      res.json(option);
    } catch (error) {
      console.error("Error creating arrangement option:", error);
      res.status(500).json({ message: "Failed to create arrangement option" });
    }
  });

  app.put('/api/arrangement-options/:id', isAuthenticated, async (req: any, res) => {
    try {
      const option = await storage.updateArrangementOption(req.params.id, req.body);
      res.json(option);
    } catch (error) {
      console.error("Error updating arrangement option:", error);
      res.status(500).json({ message: "Failed to update arrangement option" });
    }
  });

  app.delete('/api/arrangement-options/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteArrangementOption(req.params.id);
      res.json({ message: "Arrangement option deleted successfully" });
    } catch (error) {
      console.error("Error deleting arrangement option:", error);
      res.status(500).json({ message: "Failed to delete arrangement option" });
    }
  });

  // Tenant settings routes
  app.get('/api/settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const settings = await storage.getTenantSettings(platformUser.tenantId);
      res.json(settings || {});
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.put('/api/settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const settings = await storage.upsertTenantSettings({
        ...req.body,
        tenantId: platformUser.tenantId,
      });
      
      res.json(settings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Logo upload route
  app.post('/api/upload/logo', isAuthenticated, upload.single('logo'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const logoUrl = `/uploads/${req.file.filename}`;
      
      // Get current settings
      const currentSettings = await storage.getTenantSettings(platformUser.tenantId);
      
      // Update custom branding with logo URL
      const customBranding = (currentSettings?.customBranding as any) || {};
      customBranding.logoUrl = logoUrl;
      
      // Update tenant settings
      const updatedSettings = await storage.upsertTenantSettings({
        ...currentSettings,
        tenantId: platformUser.tenantId,
        customBranding,
      });
      
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

      const documents = await storage.getDocumentsByTenant(tenant.id);
      const publicDocuments = documents.filter(doc => doc.isPublic);
      
      res.json(publicDocuments);
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

  const httpServer = createServer(app);
  return httpServer;
}
