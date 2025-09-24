import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { accounts, consumers, folders } from './_lib/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

function resolveAccountId(req: AuthenticatedRequest) {
  const queryId = req.query?.id;
  if (typeof queryId === 'string' && queryId) {
    return queryId;
  }
  if (Array.isArray(queryId) && queryId.length > 0 && queryId[0]) {
    return queryId[0];
  }
  if (req.url) {
    const url = new URL(req.url, 'http://localhost');
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length > 2) {
      return segments[segments.length - 1];
    }
  }
  return undefined;
}

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const db = await getDb();
    
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
      const {
        firstName, lastName, email, phone,
        accountNumber, creditor, balanceCents, folderId,
        dateOfBirth, address, city, state, zipCode,
        additionalData, dueDate
      } = req.body;

      if (!firstName || !lastName || !email || !creditor || balanceCents === undefined || !dateOfBirth) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Check if consumer exists or create new one
      // Match by email, firstName, lastName, and dateOfBirth to ensure it's the same person
      const normalizedEmail = email.toLowerCase();

      let [consumer] = await db
        .select()
        .from(consumers)
        .where(and(
          sql`lower(${consumers.email}) = ${normalizedEmail}`,
          eq(consumers.firstName, firstName),
          eq(consumers.lastName, lastName),
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
            dateOfBirth: dateOfBirth,
            address: address || null,
            city: city || null,
            state: state || null,
            zipCode: zipCode || null,
            additionalData: additionalData || {},
            isRegistered: false,
          })
          .returning();

        consumer = newConsumer;
      } else {
        const updateData: Partial<typeof consumers.$inferInsert> = {};

        if (dateOfBirth) {
          updateData.dateOfBirth = dateOfBirth;
        }
        if (typeof address === 'string' && address.trim() !== '') {
          updateData.address = address;
        }
        if (typeof city === 'string' && city.trim() !== '') {
          updateData.city = city;
        }
        if (typeof state === 'string' && state.trim() !== '') {
          updateData.state = state;
        }
        if (typeof zipCode === 'string' && zipCode.trim() !== '') {
          updateData.zipCode = zipCode;
        }
        if (typeof phone === 'string' && phone.trim() !== '') {
          updateData.phone = phone;
        }

        if (Object.keys(updateData).length > 0) {
          const [updatedConsumer] = await db
            .update(consumers)
            .set(updateData)
            .where(eq(consumers.id, consumer.id))
            .returning();

          if (updatedConsumer) {
            consumer = updatedConsumer;
          }
        }
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
          dueDate: dueDate || null,
          status: 'active',
          additionalData: additionalData || {},
        })
        .returning();

      res.status(201).json(newAccount);
    } else if (req.method === 'PATCH') {
      const queryId = req.query.id;
      let accountId: string | undefined;

      if (typeof queryId === 'string') {
        accountId = queryId;
      } else if (Array.isArray(queryId) && queryId.length > 0) {
        accountId = queryId[0];
      } else if (req.url) {
        const urlPath = req.url.split('?')[0];
        const segments = urlPath.split('/').filter(Boolean);
        const lastSegment = segments[segments.length - 1];
        if (lastSegment && lastSegment !== 'accounts') {
          accountId = lastSegment;
        }
      }

      if (!accountId) {
        res.status(400).json({ error: 'Account ID is required' });
        return;
      }

      const [existingAccount] = await db
        .select({
          id: accounts.id,
          tenantId: accounts.tenantId,
          consumerId: accounts.consumerId,
        })
        .from(accounts)
        .where(and(
          eq(accounts.id, accountId),
          eq(accounts.tenantId, tenantId)
        ))
        .limit(1);

      if (!existingAccount) {
        res.status(404).json({ error: 'Account not found' });
        return;
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
        status,
        additionalData,
        consumerAdditionalData,
      } = req.body || {};

      const accountUpdates: Record<string, any> = {};
      if (accountNumber !== undefined) accountUpdates.accountNumber = accountNumber ?? '';
      if (creditor !== undefined) accountUpdates.creditor = creditor;
      if (balanceCents !== undefined) accountUpdates.balanceCents = balanceCents;
      if (dueDate !== undefined) accountUpdates.dueDate = dueDate || null;
      if (status !== undefined) accountUpdates.status = status;
      if (additionalData !== undefined) accountUpdates.additionalData = additionalData;
      if (folderId !== undefined) accountUpdates.folderId = folderId || null;

      const consumerUpdates: Record<string, any> = {};
      if (firstName !== undefined) consumerUpdates.firstName = firstName;
      if (lastName !== undefined) consumerUpdates.lastName = lastName;
      if (email !== undefined) consumerUpdates.email = email;
      if (phone !== undefined) consumerUpdates.phone = phone;
      if (folderId !== undefined) consumerUpdates.folderId = folderId || null;
      if (dateOfBirth !== undefined) consumerUpdates.dateOfBirth = dateOfBirth;
      if (address !== undefined) consumerUpdates.address = address;
      if (city !== undefined) consumerUpdates.city = city;
      if (state !== undefined) consumerUpdates.state = state;
      if (zipCode !== undefined) consumerUpdates.zipCode = zipCode;
      if (consumerAdditionalData !== undefined) consumerUpdates.additionalData = consumerAdditionalData;

      // Validate that provided folder belongs to tenant
      if (folderId) {
        const [folder] = await db
          .select({ id: folders.id })
          .from(folders)
          .where(and(
            eq(folders.id, folderId),
            eq(folders.tenantId, tenantId)
          ))
          .limit(1);

        if (!folder) {
          res.status(400).json({ error: 'Invalid folder for tenant' });
          return;
        }
      }

      if (Object.keys(accountUpdates).length > 0) {
        await db
          .update(accounts)
          .set(accountUpdates)
          .where(and(
            eq(accounts.id, accountId),
            eq(accounts.tenantId, tenantId)
          ));
      }

      if (Object.keys(consumerUpdates).length > 0) {
        await db
          .update(consumers)
          .set(consumerUpdates)
          .where(and(
            eq(consumers.id, existingAccount.consumerId),
            eq(consumers.tenantId, tenantId)
          ));
      }

      const [updatedAccount] = await db
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
            dateOfBirth: consumers.dateOfBirth,
            address: consumers.address,
            city: consumers.city,
            state: consumers.state,
            zipCode: consumers.zipCode,
            additionalData: consumers.additionalData,
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
        .where(and(
          eq(accounts.id, accountId),
          eq(accounts.tenantId, tenantId)
        ))
        .limit(1);

      res.status(200).json(updatedAccount);
    } else if (req.method === 'DELETE') {
      // Delete an account - supports /api/accounts?id=<accountId> and /api/accounts/<accountId>
      const accountId = resolveAccountId(req);

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