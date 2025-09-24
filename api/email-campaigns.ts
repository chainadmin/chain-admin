import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { emailCampaigns, emailTemplates, consumers, emailTracking } from './_lib/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { resolveResourceId } from './_lib/request-helpers.js';

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
      // Get all email campaigns for the tenant
      const campaigns = await db
        .select()
        .from(emailCampaigns)
        .where(eq(emailCampaigns.tenantId, tenantId))
        .orderBy(desc(emailCampaigns.createdAt));

      res.status(200).json(campaigns);
    } else if (req.method === 'POST') {
      // Create a new email campaign
      const { templateId, name, targetGroup } = req.body;

      if (!templateId || !name || !targetGroup) {
        res.status(400).json({ error: 'Template ID, name, and target group are required' });
        return;
      }

      // Verify template exists and belongs to tenant
      const [template] = await db
        .select()
        .from(emailTemplates)
        .where(and(
          eq(emailTemplates.id, templateId),
          eq(emailTemplates.tenantId, tenantId)
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
        // This would need to join with accounts table and check balance > 0
        // For now, using a simplified query
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(consumers)
          .where(and(
            eq(consumers.tenantId, tenantId),
            sql`EXISTS (SELECT 1 FROM accounts WHERE accounts.consumer_id = consumers.id AND accounts.balance > 0)`
          ));
        recipientCount = Number(result[0]?.count || 0);
      } else if (targetGroup === 'overdue') {
        // This would check for overdue accounts
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
        .insert(emailCampaigns)
        .values({
          tenantId,
          templateId,
          name,
          targetGroup,
          status: 'pending',
          totalRecipients: recipientCount,
          totalSent: 0,
          totalDelivered: 0,
          totalOpened: 0,
          totalClicked: 0,
          totalErrors: 0,
          totalOptOuts: 0,
        })
        .returning();

      res.status(201).json(newCampaign);
    } else if (req.method === 'PUT') {
      // Update campaign status (start/pause/cancel)
      const { campaignId, status } = req.body;

      if (!campaignId || !status) {
        res.status(400).json({ error: 'Campaign ID and status are required' });
        return;
      }

      // Verify campaign exists and belongs to tenant
      const [campaign] = await db
        .select()
        .from(emailCampaigns)
        .where(and(
          eq(emailCampaigns.id, campaignId),
          eq(emailCampaigns.tenantId, tenantId)
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
        .update(emailCampaigns)
        .set(updateData)
        .where(eq(emailCampaigns.id, campaignId))
        .returning();

      res.status(200).json(updatedCampaign);
    } else if (req.method === 'DELETE') {
      // Delete a campaign
      const campaignId = resolveResourceId(req);

      if (!campaignId) {
        res.status(400).json({ error: 'Campaign ID is required' });
        return;
      }

      // Verify campaign exists and belongs to tenant
      const [campaign] = await db
        .select()
        .from(emailCampaigns)
        .where(and(
          eq(emailCampaigns.id, campaignId),
          eq(emailCampaigns.tenantId, tenantId)
        ))
        .limit(1);

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found' });
        return;
      }

      await db
        .delete(emailCampaigns)
        .where(eq(emailCampaigns.id, campaignId));

      res.status(200).json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Email campaign error:', error);
    res.status(500).json({ 
      error: 'Failed to process email campaign request',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default withAuth(handler);