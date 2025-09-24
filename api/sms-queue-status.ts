import type { VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { tenantSettings, smsCampaigns } from './_lib/schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
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
    const db = getDb();

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

    const throttleLimit = settings?.smsThrottleLimit ?? 10;

    const campaigns = await db
      .select({
        id: smsCampaigns.id,
        status: smsCampaigns.status,
        createdAt: smsCampaigns.createdAt,
        remaining: sql<number>`GREATEST(${smsCampaigns.totalRecipients} - ${smsCampaigns.totalSent}, 0)`
      })
      .from(smsCampaigns)
      .where(and(
        eq(smsCampaigns.tenantId, tenantId),
        inArray(smsCampaigns.status, ['pending', 'sending'])
      ));

    const queueLength = campaigns.reduce((sum, campaign) => sum + Number(campaign.remaining || 0), 0);
    const activeCampaigns = campaigns.length;

    const estimatedWaitTime = throttleLimit > 0
      ? Math.ceil(queueLength / throttleLimit) * 60
      : 0;

    const oldestCampaign = campaigns.reduce<Date | null>((oldest, campaign) => {
      if (!campaign.createdAt) {
        return oldest;
      }
      const campaignDate = new Date(campaign.createdAt);
      if (!oldest || campaignDate < oldest) {
        return campaignDate;
      }
      return oldest;
    }, null);

    res.status(200).json({
      queueLength,
      activeCampaigns,
      estimatedWaitTime,
      throttleLimit,
      oldestCampaignStartedAt: oldestCampaign ? oldestCampaign.toISOString() : null,
    });
  } catch (error) {
    console.error('SMS queue status error:', error);
    res.status(500).json({ error: 'Failed to retrieve SMS queue status' });
  }
}

export default withAuth(handler);
