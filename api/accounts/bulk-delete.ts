import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { withAuth, AuthenticatedRequest } from '../_lib/auth.js';
import { accounts } from '../_lib/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'DELETE') {
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

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Account IDs array is required' });
      return;
    }

    // Verify all accounts belong to the tenant before deleting
    const accountsToDelete = await db
      .select()
      .from(accounts)
      .where(and(
        inArray(accounts.id, ids),
        eq(accounts.tenantId, tenantId)
      ));

    if (accountsToDelete.length === 0) {
      res.status(404).json({ error: 'No accounts found to delete' });
      return;
    }

    // Delete the accounts
    await db
      .delete(accounts)
      .where(and(
        inArray(accounts.id, ids),
        eq(accounts.tenantId, tenantId)
      ));

    res.status(200).json({ 
      success: true, 
      message: `${accountsToDelete.length} accounts deleted successfully`,
      deletedCount: accountsToDelete.length
    });
  } catch (error: any) {
    console.error('Bulk delete accounts error:', error);
    res.status(500).json({ 
      error: 'Failed to delete accounts',
      message: error.message 
    });
  }
}

export default withAuth(handler);