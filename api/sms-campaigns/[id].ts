import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from '../_lib/auth.js';
import { smsCampaigns } from '../../shared/schema.js';
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
    const campaignIdParam = req.query.id;
    const campaignId = Array.isArray(campaignIdParam) ? campaignIdParam[0] : campaignIdParam;

    if (!campaignId || typeof campaignId !== 'string') {
      res.status(400).json({ error: 'Campaign ID is required' });
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

    const [campaign] = await db
      .select()
      .from(smsCampaigns)
      .where(and(
        eq(smsCampaigns.id, campaignId),
        eq(smsCampaigns.tenantId, tenantId)
      ))
      .limit(1);

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    await db
      .delete(smsCampaigns)
      .where(eq(smsCampaigns.id, campaignId));

    res.status(200).json({ success: true, message: 'SMS campaign deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting SMS campaign:', error);
    res.status(500).json({
      error: 'Failed to delete SMS campaign',
      message: error.message,
    });
  }
}

export default withAuth(handler);