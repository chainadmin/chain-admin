import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';
import { withAuth, AuthenticatedRequest } from './_lib/auth';
import { accounts, consumers, folders } from './_lib/schema';
import { eq, and } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
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

    if (req.method === 'GET') {
      // Get all accounts for the tenant
      const tenantAccounts = await db
        .select({
          id: accounts.id,
          accountNumber: accounts.accountNumber,
          creditor: accounts.creditor,
          balanceCents: accounts.balanceCents,
          dueDate: accounts.dueDate,
          status: accounts.status,
          additionalData: accounts.additionalData,
          consumerId: accounts.consumerId,
          tenantId: accounts.tenantId,
          createdAt: accounts.createdAt,
          consumer: {
            id: consumers.id,
            firstName: consumers.firstName,
            lastName: consumers.lastName,
            email: consumers.email,
            phone: consumers.phone,
            folderId: consumers.folderId,
          },
          folder: {
            id: folders.id,
            name: folders.name,
            color: folders.color,
            isDefault: folders.isDefault,
          },
        })
        .from(accounts)
        .leftJoin(consumers, eq(accounts.consumerId, consumers.id))
        .leftJoin(folders, eq(consumers.folderId, folders.id))
        .where(eq(accounts.tenantId, tenantId));

      res.status(200).json(tenantAccounts);
    } else if (req.method === 'POST') {
      // Create a new account
      const { firstName, lastName, email, phone, accountNumber, creditor, balanceCents, folderId } = req.body;

      if (!firstName || !lastName || !email || !creditor || balanceCents === undefined) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Check if consumer exists or create new one
      let [consumer] = await db
        .select()
        .from(consumers)
        .where(and(
          eq(consumers.email, email),
          eq(consumers.tenantId, tenantId)
        ))
        .limit(1);

      if (!consumer) {
        // Get default folder if no folder specified
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

        // Create new consumer
        const [newConsumer] = await db
          .insert(consumers)
          .values({
            tenantId,
            folderId: targetFolderId,
            firstName,
            lastName,
            email,
            phone: phone || null,
            isRegistered: false,
          })
          .returning();
        
        consumer = newConsumer;
      }

      // Create the account
      const [newAccount] = await db
        .insert(accounts)
        .values({
          consumerId: consumer.id,
          tenantId,
          accountNumber: accountNumber || '',
          creditor,
          balanceCents,
          status: 'active',
        })
        .returning();

      res.status(201).json(newAccount);
    } else if (req.method === 'DELETE') {
      // Delete an account - expects /api/accounts?id=<accountId>
      const accountId = req.query.id as string;

      if (!accountId) {
        res.status(400).json({ error: 'Account ID is required' });
        return;
      }

      // Check if account exists and belongs to tenant
      const [account] = await db
        .select()
        .from(accounts)
        .where(and(
          eq(accounts.id, accountId),
          eq(accounts.tenantId, tenantId)
        ))
        .limit(1);

      if (!account) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      // Delete the account
      await db
        .delete(accounts)
        .where(eq(accounts.id, accountId));

      res.status(200).json({ success: true, message: 'Account deleted successfully' });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Accounts API error:', error);
    res.status(500).json({ 
      error: 'Failed to process account request',
      message: error.message 
    });
  }
}

export default withAuth(handler);