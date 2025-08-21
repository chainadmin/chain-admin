import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertConsumerSchema, insertAccountSchema } from "@shared/schema";
import { z } from "zod";

const csvUploadSchema = z.object({
  consumers: z.array(z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
  })),
  accounts: z.array(z.object({
    accountNumber: z.string(),
    creditor: z.string(),
    balanceCents: z.number(),
    dueDate: z.string().optional(),
    consumerEmail: z.string().email(),
  })),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

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
      res.json({ consumer, accounts });
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
