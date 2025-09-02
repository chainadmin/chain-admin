import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { postmarkServerService } from "./postmarkServerService";
import { insertConsumerSchema, insertAccountSchema, agencyTrialRegistrationSchema, platformUsers } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";
import express from "express";
import { emailService } from "./emailService";
import { smsService } from "./smsService";

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

// Helper function to replace email template variables
function replaceEmailVariables(
  template: string, 
  consumer: any, 
  account: any, 
  tenant: any,
  baseUrl: string = process.env.REPLIT_DOMAINS || 'localhost:5000'
): string {
  let processedTemplate = template;
  
  // Consumer variables
  processedTemplate = processedTemplate.replace(/\{\{firstName\}\}/g, consumer.firstName || '');
  processedTemplate = processedTemplate.replace(/\{\{lastName\}\}/g, consumer.lastName || '');
  processedTemplate = processedTemplate.replace(/\{\{email\}\}/g, consumer.email || '');
  
  // Account variables (if account exists)
  if (account) {
    processedTemplate = processedTemplate.replace(/\{\{accountNumber\}\}/g, account.accountNumber || '');
    processedTemplate = processedTemplate.replace(/\{\{creditor\}\}/g, account.creditor || '');
    processedTemplate = processedTemplate.replace(/\{\{balance\}\}/g, 
      account.balanceCents ? `$${(account.balanceCents / 100).toFixed(2)}` : '$0.00');
    processedTemplate = processedTemplate.replace(/\{\{dueDate\}\}/g, 
      account.dueDate ? new Date(account.dueDate).toLocaleDateString() : '');
  }
  
  // Consumer portal and app download links
  const consumerPortalUrl = `https://${baseUrl}/consumer/${tenant.slug}/${encodeURIComponent(consumer.email)}`;
  const appDownloadUrl = `https://${baseUrl}/download`; // Generic app download page
  
  processedTemplate = processedTemplate.replace(/\{\{consumerPortalLink\}\}/g, consumerPortalUrl);
  processedTemplate = processedTemplate.replace(/\{\{appDownloadLink\}\}/g, appDownloadUrl);
  
  // Process any additional data from consumer.additionalData (CSV columns)
  if (consumer.additionalData && typeof consumer.additionalData === 'object') {
    Object.keys(consumer.additionalData).forEach(key => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      processedTemplate = processedTemplate.replace(regex, consumer.additionalData[key] || '');
    });
  }
  
  return processedTemplate;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Body parser middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

  app.post('/api/folders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { name, color, description } = req.body;

      if (!name || !color) {
        return res.status(400).json({ message: "Name and color are required" });
      }

      // Get current folder count for sort order
      const existingFolders = await storage.getFoldersByTenant(platformUser.tenantId);
      const sortOrder = existingFolders.length;

      const folder = await storage.createFolder({
        tenantId: platformUser.tenantId,
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

  app.delete('/api/folders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const folderId = req.params.id;
      await storage.deleteFolder(folderId, platformUser.tenantId);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting folder:", error);
      res.status(500).json({ message: "Failed to delete folder" });
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

  // Folder routes
  app.get('/api/folders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Ensure default folders exist for this tenant
      await storage.ensureDefaultFolders(platformUser.tenantId);
      
      const folders = await storage.getFoldersByTenant(platformUser.tenantId);
      res.json(folders);
    } catch (error) {
      console.error("Error fetching folders:", error);
      res.status(500).json({ message: "Failed to fetch folders" });
    }
  });

  app.post('/api/folders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { name, description, color } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Folder name is required" });
      }

      const folder = await storage.createFolder({
        tenantId: platformUser.tenantId,
        name,
        description,
        color: color || "#3b82f6",
        sortOrder: Date.now(), // Simple ordering by creation time
      });

      res.json(folder);
    } catch (error) {
      console.error("Error creating folder:", error);
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  app.get('/api/folders/:folderId/accounts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const accounts = await storage.getAccountsByFolder(req.params.folderId);
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching accounts by folder:", error);
      res.status(500).json({ message: "Failed to fetch accounts by folder" });
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

      const { consumers: consumersData, accounts: accountsData, folderId } = req.body;
      
      // Get default folder if no folder is specified
      let targetFolderId = folderId;
      if (!targetFolderId) {
        await storage.ensureDefaultFolders(platformUser.tenantId);
        const defaultFolder = await storage.getDefaultFolder(platformUser.tenantId);
        targetFolderId = defaultFolder?.id;
      }
      
      // Create consumers first
      const createdConsumers = new Map();
      for (const consumerData of consumersData) {
        const consumer = await storage.createConsumer({
          ...consumerData,
          tenantId: platformUser.tenantId,
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
          tenantId: platformUser.tenantId!,
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
  app.post('/api/accounts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { firstName, lastName, email, phone, accountNumber, creditor, balanceCents, folderId } = req.body;

      if (!firstName || !lastName || !email || !creditor || balanceCents === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Check if consumer already exists  
      let consumer = await storage.getConsumerByEmail(email);
      
      if (!consumer) {
        // Create new consumer
        consumer = await storage.createConsumer({
          tenantId: platformUser.tenantId,
          firstName,
          lastName,
          email,
          phone: phone || null,
          folderId: folderId || null,
        });
      }

      // Create account
      const account = await storage.createAccount({
        tenantId: platformUser.tenantId,
        consumerId: consumer.id,
        folderId: folderId || null,
        accountNumber: accountNumber || null,
        creditor,
        balanceCents,
        status: 'active',
        additionalData: {},
      });

      res.status(201).json(account);
    } catch (error) {
      console.error("Error creating account:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.delete('/api/accounts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const accountId = req.params.id;
      await storage.deleteAccount(accountId, platformUser.tenantId);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ message: "Failed to delete account" });
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
        tenantId: platformUser.tenantId,
        name,
        templateId,
        targetGroup,
        totalRecipients: targetedConsumers.length,
        status: 'sending',
      });

      // Get email template for variable replacement
      const templates = await storage.getEmailTemplatesByTenant(platformUser.tenantId);
      const template = templates.find(t => t.id === templateId);
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }

      // Get tenant details for URL generation
      const tenant = await storage.getTenant(platformUser.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      // Process variables for each consumer and prepare email content
      const accountsData = await storage.getAccountsByTenant(platformUser.tenantId);
      
      // Prepare emails with variable replacement (filter out consumers without emails)
      const processedEmails = targetedConsumers
        .filter(consumer => consumer.email) // Only include consumers with valid emails
        .map(consumer => {
        // Find the primary account for this consumer (could be multiple accounts)
        const consumerAccount = accountsData.find(acc => acc.consumerId === consumer.id);
        
        // Replace variables in both subject and HTML content
        const processedSubject = replaceEmailVariables(template.subject, consumer, consumerAccount, tenant);
        const processedHtml = replaceEmailVariables(template.html, consumer, consumerAccount, tenant);
        
        return {
          to: consumer.email!,
          from: tenant.email || 'noreply@chainplatform.com', // Use tenant email or default
          subject: processedSubject,
          html: processedHtml,
          tag: `campaign-${campaign.id}`,
          metadata: {
            campaignId: campaign.id,
            tenantId: platformUser.tenantId || '',
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

  // Test email route
  app.post('/api/test-email', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { to, subject, message } = req.body;
      
      if (!to || !subject || !message) {
        return res.status(400).json({ message: "To, subject, and message are required" });
      }

      const tenant = await storage.getTenant(platformUser.tenantId);
      const fromEmail = tenant?.email || 'noreply@chainplatform.com';

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
          tenantId: platformUser.tenantId,
        }
      });

      res.json(result);
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({ message: "Failed to send test email" });
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

  // SMS template routes
  app.get('/api/sms-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const templates = await storage.getSmsTemplatesByTenant(platformUser.tenantId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching SMS templates:", error);
      res.status(500).json({ message: "Failed to fetch SMS templates" });
    }
  });

  app.post('/api/sms-templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
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
        tenantId: platformUser.tenantId,
      });
      
      res.status(201).json(newTemplate);
    } catch (error) {
      console.error("Error creating SMS template:", error);
      res.status(500).json({ message: "Failed to create SMS template" });
    }
  });

  app.delete('/api/sms-templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      await storage.deleteSmsTemplate(req.params.id, platformUser.tenantId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting SMS template:", error);
      res.status(500).json({ message: "Failed to delete SMS template" });
    }
  });

  // SMS campaign routes
  app.get('/api/sms-campaigns', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const campaigns = await storage.getSmsCampaignsByTenant(platformUser.tenantId);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching SMS campaigns:", error);
      res.status(500).json({ message: "Failed to fetch SMS campaigns" });
    }
  });

  app.post('/api/sms-campaigns', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const insertSmsCampaignSchema = z.object({
        templateId: z.string().uuid(),
        name: z.string().min(1),
        targetGroup: z.enum(["all", "with-balance", "decline", "recent-upload"]),
      });

      const validatedData = insertSmsCampaignSchema.parse(req.body);
      
      const newCampaign = await storage.createSmsCampaign({
        ...validatedData,
        tenantId: platformUser.tenantId,
      });
      
      res.status(201).json(newCampaign);
    } catch (error) {
      console.error("Error creating SMS campaign:", error);
      res.status(500).json({ message: "Failed to create SMS campaign" });
    }
  });

  // SMS metrics route
  app.get('/api/sms-metrics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const metrics = await storage.getSmsMetricsByTenant(platformUser.tenantId);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching SMS metrics:", error);
      res.status(500).json({ message: "Failed to fetch SMS metrics" });
    }
  });

  // SMS throttling and queue management routes
  app.get('/api/sms-rate-limit-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const rateLimitStatus = await smsService.getRateLimitStatus(platformUser.tenantId);
      res.json(rateLimitStatus);
    } catch (error) {
      console.error("Error getting SMS rate limit status:", error);
      res.status(500).json({ message: "Failed to get rate limit status" });
    }
  });

  app.get('/api/sms-queue-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const queueStatus = smsService.getQueueStatus(platformUser.tenantId);
      res.json(queueStatus);
    } catch (error) {
      console.error("Error getting SMS queue status:", error);
      res.status(500).json({ message: "Failed to get queue status" });
    }
  });

  app.post('/api/send-test-sms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { phoneNumber, message } = req.body;

      if (!phoneNumber || !message) {
        return res.status(400).json({ message: "Phone number and message are required" });
      }

      const result = await smsService.sendSms(phoneNumber, message, platformUser.tenantId);
      res.json(result);
    } catch (error) {
      console.error("Error sending test SMS:", error);
      res.status(500).json({ message: "Failed to send test SMS" });
    }
  });

  // Communication Automation Routes
  app.get('/api/automations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const automations = await storage.getAutomationsByTenant(platformUser.tenantId);
      res.json(automations);
    } catch (error) {
      console.error("Error fetching automations:", error);
      res.status(500).json({ message: "Failed to fetch automations" });
    }
  });

  app.post('/api/automations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const insertAutomationSchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(['email', 'sms']),
        templateId: z.string().uuid().optional(), // For single template (one-time)
        templateIds: z.array(z.string().uuid()).optional(), // For multiple templates (recurring)
        triggerType: z.enum(['schedule', 'event', 'manual']),
        scheduleType: z.enum(['once', 'daily', 'weekly', 'monthly']).optional(),
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
        // Either templateId or templateIds must be provided
        return data.templateId || (data.templateIds && data.templateIds.length > 0);
      }, {
        message: "Either templateId or templateIds must be provided"
      });

      const validatedData = insertAutomationSchema.parse(req.body);
      
      // Calculate next execution if it's a scheduled automation
      let nextExecution = null;
      if (validatedData.triggerType === 'schedule' && validatedData.scheduledDate) {
        nextExecution = new Date(validatedData.scheduledDate);
      }

      const automationData: any = {
        ...validatedData,
        tenantId: platformUser.tenantId,
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

  app.put('/api/automations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
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

  app.delete('/api/automations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      await storage.deleteAutomation(req.params.id, platformUser.tenantId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting automation:", error);
      res.status(500).json({ message: "Failed to delete automation" });
    }
  });

  app.get('/api/automations/:id/executions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Verify automation belongs to tenant
      const automation = await storage.getAutomationById(req.params.id, platformUser.tenantId);
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

  // Consumer registration route (public)
  app.post('/api/consumer-registration', async (req, res) => {
    try {
      const { 
        firstName, 
        lastName, 
        email, 
        dateOfBirth, 
        address, 
        city, 
        state, 
        zipCode 
      } = req.body;

      if (!firstName || !lastName || !email || !dateOfBirth || !address) {
        return res.status(400).json({ message: "Name, email, date of birth, and address are required" });
      }

      // First, check if consumer already exists in any agency
      const existingConsumer = await storage.getConsumerByEmail(email);
      
      if (existingConsumer) {
        // Verify date of birth matches
        const providedDOB = new Date(dateOfBirth);
        const storedDOB = existingConsumer.dateOfBirth ? new Date(existingConsumer.dateOfBirth) : null;
        
        if (storedDOB && providedDOB.getTime() === storedDOB.getTime()) {
          // Get tenant information
          const tenant = await storage.getTenant(existingConsumer.tenantId);
          if (!tenant) {
            return res.status(500).json({ message: "Account configuration error" });
          }

          // Update existing consumer with complete registration info
          const updatedConsumer = await storage.updateConsumer(existingConsumer.id, {
            firstName,
            lastName,
            address,
            city,
            state,
            zipCode,
            isRegistered: true,
            registrationDate: new Date(),
          });

          return res.json({ 
            message: "Registration completed successfully! Your agency has been automatically identified.", 
            consumerId: updatedConsumer.id,
            consumer: {
              id: updatedConsumer.id,
              firstName: updatedConsumer.firstName,
              lastName: updatedConsumer.lastName,
              email: updatedConsumer.email,
            },
            tenant: {
              name: tenant.name,
              slug: tenant.slug,
            }
          });
        } else {
          return res.status(400).json({ 
            message: "An account with this email exists, but the date of birth doesn't match. Please verify your information." 
          });
        }
      }

      // No existing account found - this means they're completely new
      // For now, we'll create a pending account that agencies can claim
      // In a real system, you might want to route this differently
      return res.status(404).json({ 
        message: "No account found with this email and date of birth combination. Please contact your agency directly to get set up.",
        suggestedAction: "contact_agency"
      });

    } catch (error) {
      console.error("Error during consumer registration:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Agency trial registration route (public)
  app.post('/api/agencies/register', async (req, res) => {
    try {
      // Validate the request body
      const validationResult = agencyTrialRegistrationSchema.safeParse(req.body);
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

      // TODO: Add notification system to alert platform owners about new trial registration
      console.log(`New trial agency registered: ${data.businessName} (${data.email})`);

      res.status(201).json({
        message: "Trial account created successfully! Our team will contact you soon.",
        tenantId: tenant.id,
        slug: tenant.slug,
        redirectUrl: "/api/login" // They can now log in with their Replit account
      });

    } catch (error) {
      console.error("Error during agency registration:", error);
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  // Consumer login route
  app.post('/api/consumer/login', async (req, res) => {
    try {
      const { email, dateOfBirth } = req.body;

      if (!email || !dateOfBirth) {
        return res.status(400).json({ message: "Email and date of birth are required" });
      }

      // Search for consumer across all tenants
      const consumer = await storage.getConsumerByEmail(email);
      
      if (!consumer) {
        // If consumer not found, create a new account opportunity
        return res.status(404).json({ 
          message: "No account found with this email. Would you like to create a new account?",
          canRegister: true,
          suggestedAction: "register"
        });
      }

      // Get tenant information
      const tenant = await storage.getTenant(consumer.tenantId);
      if (!tenant) {
        return res.status(500).json({ message: "Account configuration error. Please contact support." });
      }

      // Verify date of birth if consumer is registered
      if (consumer.isRegistered) {
        const providedDOB = new Date(dateOfBirth);
        const storedDOB = consumer.dateOfBirth ? new Date(consumer.dateOfBirth) : null;
        
        if (!storedDOB) {
          return res.status(401).json({ message: "Date of birth verification required. Please contact your agency." });
        }
        
        if (providedDOB.getTime() !== storedDOB.getTime()) {
          return res.status(401).json({ message: "Date of birth verification failed. Please check your information." });
        }
      } else {
        // For unregistered consumers, allow them to complete registration
        return res.status(200).json({
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
          }
        });
      }

      // Return consumer data for successful login
      res.json({
        consumer: {
          id: consumer.id,
          firstName: consumer.firstName,
          lastName: consumer.lastName,
          email: consumer.email,
          phone: consumer.phone,
          tenantId: consumer.tenantId,
        },
        tenant: {
          name: tenant.name,
          slug: tenant.slug,
        }
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
      const settingsData = {
        tenantId: platformUser.tenantId,
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

  // Company management routes
  app.get('/api/company/consumers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const consumers = await storage.getConsumersByTenant(platformUser.tenantId);
      
      // Add account count and total balance for each consumer
      const consumersWithStats = await Promise.all(
        consumers.map(async (consumer) => {
          const accounts = await storage.getAccountsByConsumer(consumer.id);
          return {
            ...consumer,
            accountCount: accounts.length,
            totalBalanceCents: accounts.reduce((sum, acc) => sum + (acc.balanceCents || 0), 0),
          };
        })
      );
      
      res.json(consumersWithStats);
    } catch (error) {
      console.error("Error fetching company consumers:", error);
      res.status(500).json({ message: "Failed to fetch consumers" });
    }
  });

  app.get('/api/company/admins', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const admins = await storage.getPlatformUsersByTenant(platformUser.tenantId);
      res.json(admins);
    } catch (error) {
      console.error("Error fetching company admins:", error);
      res.status(500).json({ message: "Failed to fetch admins" });
    }
  });

  app.patch('/api/company/consumers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      const { id } = req.params;
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const consumer = await storage.updateConsumer(id, req.body);
      res.json(consumer);
    } catch (error) {
      console.error("Error updating consumer:", error);
      res.status(500).json({ message: "Failed to update consumer" });
    }
  });

  // Payment routes
  app.get('/api/payments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const payments = await storage.getPaymentsByTenant(platformUser.tenantId);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.get('/api/payments/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const stats = await storage.getPaymentStats(platformUser.tenantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching payment stats:", error);
      res.status(500).json({ message: "Failed to fetch payment stats" });
    }
  });

  // Real-time payment processing endpoint
  app.post('/api/payments/process', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
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
      const consumer = await storage.getConsumerByEmailAndTenant(consumerEmail, platformUser.tenantId);
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
        tenantId: platformUser.tenantId,
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

  app.post('/api/payments/manual', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const { consumerEmail, accountId, amountCents, paymentMethod, transactionId, notes } = req.body;

      // Get consumer
      const consumer = await storage.getConsumerByEmailAndTenant(consumerEmail, platformUser.tenantId);
      if (!consumer) {
        return res.status(404).json({ message: "Consumer not found" });
      }

      // Create payment record
      const payment = await storage.createPayment({
        tenantId: platformUser.tenantId,
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
  app.get('/api/billing/subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const subscription = await storage.getSubscriptionByTenant(platformUser.tenantId);
      res.json(subscription);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  app.get('/api/billing/invoices', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const invoices = await storage.getInvoicesByTenant(platformUser.tenantId);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get('/api/billing/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const stats = await storage.getBillingStats(platformUser.tenantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching billing stats:", error);
      res.status(500).json({ message: "Failed to fetch billing stats" });
    }
  });

  app.get('/api/billing/current-invoice', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const platformUser = await storage.getPlatformUser(userId);
      
      if (!platformUser?.tenantId) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const currentInvoice = await storage.getCurrentInvoice(platformUser.tenantId);
      res.json(currentInvoice);
    } catch (error) {
      console.error("Error fetching current invoice:", error);
      res.status(500).json({ message: "Failed to fetch current invoice" });
    }
  });

  // Global Admin Routes (Platform Owner Only)
  const isPlatformAdmin = async (req: any, res: any, next: any) => {
    const userId = req.user.claims.sub;
    
    // Check if user has platform_admin role (they might have multiple roles)
    const userRoles = await db.select().from(platformUsers).where(eq(platformUsers.authId, userId));
    const hasPlatformAdminRole = userRoles.some((user: any) => user.role === 'platform_admin');
    
    if (!hasPlatformAdminRole) {
      return res.status(403).json({ message: "Platform admin access required" });
    }
    
    next();
  };

  // Get all tenants for platform admin overview
  app.get('/api/admin/tenants', isAuthenticated, isPlatformAdmin, async (req: any, res) => {
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
  app.get('/api/admin/stats', isAuthenticated, isPlatformAdmin, async (req: any, res) => {
    try {
      const stats = await storage.getPlatformStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching platform stats:", error);
      res.status(500).json({ message: "Failed to fetch platform stats" });
    }
  });

  // Update tenant status (activate/suspend)
  app.put('/api/admin/tenants/:id/status', isAuthenticated, isPlatformAdmin, async (req: any, res) => {
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
  app.put('/api/admin/tenants/:id/upgrade', isAuthenticated, isPlatformAdmin, async (req: any, res) => {
    try {
      const updatedTenant = await storage.upgradeTenantToPaid(req.params.id);
      res.json(updatedTenant);
    } catch (error) {
      console.error("Error upgrading tenant:", error);
      res.status(500).json({ message: "Failed to upgrade tenant" });
    }
  });

  // Create new agency with Postmark server
  app.post('/api/admin/agencies', isAuthenticated, isPlatformAdmin, async (req: any, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
