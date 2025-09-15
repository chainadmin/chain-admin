import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { withAuth, AuthenticatedRequest } from '../_lib/auth.js';
import { consumers, accounts, folders } from '../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const db = getDb();
    
    // Get tenant ID from JWT token
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.headers.cookie?.split(';').find(c => c.trim().startsWith('authToken='))?.split('=')[1];
    
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const tenantId = decoded.tenantId;

    if (!tenantId) {
      res.status(403).json({ error: 'No tenant access' });
      return;
    }

    const { consumers: csvConsumers, accounts: csvAccounts, folderId } = req.body;

    if (!csvConsumers || !csvAccounts) {
      res.status(400).json({ error: 'Missing consumer or account data' });
      return;
    }

    // Get the folder if specified, or use default folder
    let targetFolderId = folderId;
    if (!targetFolderId) {
      const [defaultFolder] = await db
        .select()
        .from(folders)
        .where(and(
          eq(folders.tenantId, tenantId),
          eq(folders.isDefault, true)
        ))
        .limit(1);
      
      if (defaultFolder) {
        targetFolderId = defaultFolder.id;
      }
    }

    const importedConsumers: any[] = [];
    const importedAccounts: any[] = [];

    // Process each consumer
    for (const csvConsumer of csvConsumers) {
      // Check if consumer already exists
      let [existingConsumer] = await db
        .select()
        .from(consumers)
        .where(and(
          eq(consumers.email, csvConsumer.email),
          eq(consumers.tenantId, tenantId)
        ))
        .limit(1);

      if (!existingConsumer) {
        // Create new consumer with all available fields
        const [newConsumer] = await db
          .insert(consumers)
          .values({
            tenantId,
            folderId: targetFolderId,
            firstName: csvConsumer.firstName,
            lastName: csvConsumer.lastName,
            email: csvConsumer.email,
            phone: csvConsumer.phone || null,
            dateOfBirth: csvConsumer.dateOfBirth || null,
            address: csvConsumer.address || null,
            city: csvConsumer.city || null,
            state: csvConsumer.state || null,
            zipCode: csvConsumer.zipCode || null,
            additionalData: csvConsumer.additionalData || {},
            isRegistered: false,
          })
          .returning();
        
        existingConsumer = newConsumer;
        importedConsumers.push(newConsumer);
      }

      // Find accounts for this consumer
      const consumerAccounts = csvAccounts.filter(
        (acc: any) => acc.consumerEmail === csvConsumer.email
      );

      // Process each account
      for (const csvAccount of consumerAccounts) {
        // Check if account already exists
        const [existingAccount] = await db
          .select()
          .from(accounts)
          .where(and(
            eq(accounts.consumerId, existingConsumer.id),
            eq(accounts.creditor, csvAccount.creditor),
            eq(accounts.accountNumber, csvAccount.accountNumber || '')
          ))
          .limit(1);

        if (!existingAccount) {
          // Create new account
          const [newAccount] = await db
            .insert(accounts)
            .values({
              consumerId: existingConsumer.id,
              tenantId,
              accountNumber: csvAccount.accountNumber || '',
              creditor: csvAccount.creditor,
              balanceCents: csvAccount.balanceCents,
              dueDate: csvAccount.dueDate || null,
              status: 'active',
              additionalData: csvAccount.additionalData || {},
            })
            .returning();
          
          importedAccounts.push(newAccount);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Imported ${importedConsumers.length} consumers and ${importedAccounts.length} accounts`,
      consumersImported: importedConsumers.length,
      accountsImported: importedAccounts.length,
    });
  } catch (error: any) {
    console.error('CSV import error:', error);
    res.status(500).json({ 
      error: 'Failed to import CSV data',
      message: error.message 
    });
  }
}

export default withAuth(handler);