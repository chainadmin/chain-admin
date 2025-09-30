import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from '../_lib/auth.js';
import { consumers, accounts } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const method = (req.method ?? '').toUpperCase();

  if (method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const db = await getDb();
    const consumerIdParam = req.query.id;
    const consumerId = Array.isArray(consumerIdParam) ? consumerIdParam[0] : consumerIdParam;

    if (!consumerId || typeof consumerId !== 'string') {
      res.status(400).json({ error: 'Consumer ID is required' });
      return;
    }

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

    // Check if consumer exists and belongs to tenant
    const [consumer] = await db
      .select()
      .from(consumers)
      .where(and(
        eq(consumers.id, consumerId),
        eq(consumers.tenantId, tenantId)
      ))
      .limit(1);

    if (!consumer) {
      res.status(404).json({ error: 'Consumer not found' });
      return;
    }

    // Delete all accounts associated with this consumer
    await db
      .delete(accounts)
      .where(eq(accounts.consumerId, consumerId));

    // Delete the consumer
    await db
      .delete(consumers)
      .where(eq(consumers.id, consumerId));

    res.status(200).json({ success: true, message: 'Consumer deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting consumer:', error);
    res.status(500).json({
      error: 'Failed to delete consumer',
      message: error.message,
    });
  }
}

export default withAuth(handler);