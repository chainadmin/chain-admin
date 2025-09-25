import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { smsCampaigns, smsTemplates, consumers, smsTracking } from './_lib/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

function resolveCampaignId(req: AuthenticatedRequest) {
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
  const method = (req.method ?? '').toUpperCase();

  if (method === 'OPTIONS') {
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

    if (method === 'GET') {
      // Get all SMS campaigns for the tenant
      const campaigns = await db
        .select()
        .from(smsCampaigns)
        .where(eq(smsCampaigns.tenantId, tenantId))
        .orderBy(desc(smsCampaigns.createdAt));

      res.status(200).json(campaigns);
    } else if (method === 'POST') {
      // Create a new SMS campaign
      const { templateId, name, targetGroup, throttleRate } = req.body;

      if (!templateId || !name || !targetGroup) {
        res.status(400).json({ error: 'Template ID, name, and target group are required' });
        return;
      }

      // Verify template exists and belongs to tenant
      const [template] = await db
        .select()
        .from(smsTemplates)
        .where(and(
          eq(smsTemplates.id, templateId),
          eq(smsTemplates.tenantId, tenantId)
        ))
        .limit(1);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      // Count target recipients based on targetGroup
      let recipientCount = 0;
      
      if (targetGroup === 'all') {
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(consumers)
          .where(eq(consumers.tenantId, tenantId));
        recipientCount = Number(result[0]?.count || 0);
      } else if (targetGroup === 'with-balance') {
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(consumers)
          .where(and(
            eq(consumers.tenantId, tenantId),
            sql`EXISTS (SELECT 1 FROM accounts WHERE accounts.consumer_id = consumers.id AND accounts.balance > 0)`
          ));
        recipientCount = Number(result[0]?.count || 0);
      } else if (targetGroup === 'overdue') {
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(consumers)
          .where(and(
            eq(consumers.tenantId, tenantId),
            sql`EXISTS (SELECT 1 FROM accounts WHERE accounts.consumer_id = consumers.id AND accounts.due_date < NOW())`
          ));
        recipientCount = Number(result[0]?.count || 0);
      }

      const [newCampaign] = await db
        .insert(smsCampaigns)
        .values({
          tenantId,
          templateId,
          name,
          targetGroup,
          status: 'pending',
          totalRecipients: recipientCount,
          totalSent: 0,
          totalDelivered: 0,
          totalErrors: 0,
          totalOptOuts: 0,
        })
        .returning();

      res.status(201).json(newCampaign);
    } else if (method === 'PUT') {
      // Update campaign status (start/pause/cancel)
      const { campaignId, status } = req.body;

      if (!campaignId || !status) {
        res.status(400).json({ error: 'Campaign ID and status are required' });
        return;
      }

      // Verify campaign exists and belongs to tenant
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

      const updateData: any = { status };
      
      // If marking as completed, set completedAt
      if (status === 'completed') {
        updateData.completedAt = new Date();
      }

      const [updatedCampaign] = await db
        .update(smsCampaigns)
        .set(updateData)
        .where(eq(smsCampaigns.id, campaignId))
        .returning();

      res.status(200).json(updatedCampaign);
    } else if (method === 'DELETE') {
      // Delete a campaign
      const campaignId = resolveCampaignId(req);

      if (!campaignId) {
        res.status(400).json({ error: 'Campaign ID is required' });
        return;
      }

      // Verify campaign exists and belongs to tenant
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

      res.status(200).json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('SMS campaign error:', error);
    res.status(500).json({ 
      error: 'Failed to process SMS campaign request',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default withAuth(handler);