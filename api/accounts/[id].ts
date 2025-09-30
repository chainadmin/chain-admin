import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from '../_lib/auth';
import { accounts } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const method = (req.method ?? '').toUpperCase();

  if (method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const db = await getDb();
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'Account ID is required' });
      return;
    }

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

    if (method === 'GET') {
      // Get single account
      const [account] = await db
        .select()
        .from(accounts)
        .where(and(
          eq(accounts.id, id),
          eq(accounts.tenantId, tenantId)
        ))
        .limit(1);

      if (!account) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      res.status(200).json(account);
    } else if (method === 'DELETE') {
      // Check if account exists and belongs to tenant
      const [account] = await db
        .select()
        .from(accounts)
        .where(and(
          eq(accounts.id, id),
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
        .where(and(
          eq(accounts.id, id),
          eq(accounts.tenantId, tenantId)
        ));

      res.status(200).json({ success: true, message: 'Account deleted successfully' });
    } else if (method === 'PATCH') {
      // Update account
      const { accountNumber, creditor, balanceCents, dueDate, status } = req.body;

      const [account] = await db
        .select()
        .from(accounts)
        .where(and(
          eq(accounts.id, id),
          eq(accounts.tenantId, tenantId)
        ))
        .limit(1);

      if (!account) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      const updateData: any = {};
      if (accountNumber !== undefined) updateData.accountNumber = accountNumber;
      if (creditor !== undefined) updateData.creditor = creditor;
      if (balanceCents !== undefined) updateData.balanceCents = balanceCents;
      if (dueDate !== undefined) updateData.dueDate = dueDate;
      if (status !== undefined) updateData.status = status;

      const [updatedAccount] = await db
        .update(accounts)
        .set(updateData)
        .where(and(
          eq(accounts.id, id),
          eq(accounts.tenantId, tenantId)
        ))
        .returning();

      res.status(200).json(updatedAccount);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Account API error:', error);
    res.status(500).json({ 
      error: 'Failed to process account request',
      message: error.message 
    });
  }
}

export default withAuth(handler);