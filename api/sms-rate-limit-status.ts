import type { VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { tenantSettings, smsTracking, smsCampaigns } from '../shared/schema.js';
import { eq, and, sql, gte } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const db = await getDb();

    const token = req.headers.authorization?.replace('Bearer ', '') ||
      req.headers.cookie?.split(';').find((c) => c.trim().startsWith('authToken='))?.split('=')[1];

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

    const [settings] = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);

    const limit = settings?.smsThrottleLimit ?? 10;
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60_000);

    const usageResult = await db
      .select({ count: sql<number>`COALESCE(count(*), 0)` })
      .from(smsTracking)
      .innerJoin(smsCampaigns, eq(smsTracking.campaignId, smsCampaigns.id))
      .where(and(
        eq(smsCampaigns.tenantId, tenantId),
        gte(smsTracking.sentAt, oneMinuteAgo),
      ));

    const used = Number(usageResult[0]?.count ?? 0);

    const currentWindowStart = new Date(now);
    currentWindowStart.setSeconds(0, 0);
    const resetTime = new Date(currentWindowStart.getTime() + 60_000);

    res.status(200).json({
      limit,
      used,
      remaining: Math.max(limit - used, 0),
      canSend: used < limit,
      resetTime: resetTime.toISOString(),
      windowSeconds: 60,
    });
  } catch (error) {
    console.error('SMS rate limit status error:', error);
    res.status(500).json({ error: 'Failed to retrieve SMS rate limit status' });
  }
}

export default withAuth(handler);
