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
          tenantId: platformUser.tenantId,
          consumerId: consumer.id,
          accountNumber: accountData.accountNumber,
          creditor: accountData.creditor,
          balanceCents: accountData.balanceCents,
          dueDate: accountData.dueDate ? new Date(accountData.dueDate) : null,
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

  const httpServer = createServer(app);
  return httpServer;
}
