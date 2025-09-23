import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, getSqlClient } from './_lib/db.js';
import { withAuth, AuthenticatedRequest } from './_lib/auth.js';
import { smsCampaigns, smsTemplates, consumers, accounts } from './_lib/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { filterConsumersForCampaign, sanitizeTargetingInput } from '@shared/utils/campaignTargeting.js';
import jwt from 'jsonwebtoken';

type RawRecord = Record<string, unknown>;

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) {
        result.push(trimmed);
      }
    }
  }

  return result;
}

function ensureCustomFilters(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const record = value as RawRecord;
  const result: RawRecord = {};

  const keys: Array<keyof typeof record> = ['balanceMin', 'balanceMax', 'status', 'lastContactDays'];
  for (const key of keys) {
    const entry = record[key];
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) {
        result[key] = trimmed;
      }
    }
  }

  return result;
}

function ensureDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapLegacySmsCampaignRow(row: RawRecord, templateNameKey: string) {
  const templateNameValue = row[templateNameKey];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    templateId: row.template_id,
    name: row.name,
    targetGroup: (row.target_group as string) ?? 'all',
    targetType: ((row.target_type as string) ?? 'all') as 'all' | 'folder' | 'custom',
    targetFolderIds: ensureStringArray(row.target_folder_ids),
    customFilters: ensureCustomFilters(row.custom_filters),
    status: (row.status as string) ?? 'pending',
    totalRecipients: Number((row.total_recipients as string | number | null) ?? 0),
    totalSent: Number((row.total_sent as string | number | null) ?? 0),
    totalDelivered: Number((row.total_delivered as string | number | null) ?? 0),
    totalErrors: Number((row.total_errors as string | number | null) ?? 0),
    totalOptOuts: Number((row.total_opt_outs as string | number | null) ?? 0),
    createdAt: ensureDate(row.created_at),
    completedAt: ensureDate(row.completed_at),
    templateName: typeof templateNameValue === 'string' ? templateNameValue : null,
  };
}

let smsCampaignTargetingSupported: boolean | null = null;
async function supportsSmsCampaignTargeting(): Promise<boolean> {
  if (smsCampaignTargetingSupported !== null) {
    return smsCampaignTargetingSupported;
  }

  try {
    const sql = getSqlClient();
    const result = await sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${'sms_campaigns'}
        AND column_name = ${'target_type'}
      LIMIT 1
    `;

    smsCampaignTargetingSupported = result.length > 0;
  } catch (error) {
    console.error('Failed to inspect sms_campaigns columns', error);
    smsCampaignTargetingSupported = false;
  }

  return smsCampaignTargetingSupported;
}

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
      if (await supportsSmsCampaignTargeting()) {
        const [campaigns, templates] = await Promise.all([
          db
            .select()
            .from(smsCampaigns)
            .where(eq(smsCampaigns.tenantId, tenantId))
            .orderBy(desc(smsCampaigns.createdAt)),
          db
            .select()
            .from(smsTemplates)
            .where(eq(smsTemplates.tenantId, tenantId)),
        ]);

        const templateNameMap = new Map(templates.map((template) => [template.id, template.name]));

        const normalizedCampaigns = campaigns.map((campaign) => ({
          ...campaign,
          targetFolderIds: ensureStringArray(campaign.targetFolderIds),
          customFilters: ensureCustomFilters(campaign.customFilters),
          templateName: templateNameMap.get(campaign.templateId) ?? null,
        }));

        res.status(200).json(normalizedCampaigns);
        return;
      }

      const sql = getSqlClient();
      const campaigns = await sql`
        SELECT sc.*, st.name AS template_name
        FROM sms_campaigns sc
        LEFT JOIN sms_templates st ON sc.template_id = st.id
        WHERE sc.tenant_id = ${tenantId}
        ORDER BY sc.created_at DESC
      `;

      const normalizedCampaigns = campaigns.map((campaign) =>
        mapLegacySmsCampaignRow(campaign as RawRecord, 'template_name'),
      );

      res.status(200).json(normalizedCampaigns);
    } else if (req.method === 'POST') {
      const smsCampaignSchema = z.object({
        templateId: z.string().uuid(),
        name: z.string().min(1),
        targetGroup: z.enum(['all', 'with-balance', 'decline', 'recent-upload']).default('all'),
        targetType: z.enum(['all', 'folder', 'custom']).optional(),
        targetFolderIds: z.array(z.string().uuid()).optional(),
        customFilters: z.object({
          balanceMin: z.string().optional(),
          balanceMax: z.string().optional(),
          status: z.string().optional(),
          lastContactDays: z.string().optional(),
        }).optional(),
      });

      const parsedBody = smsCampaignSchema.parse(req.body);

      const targeting = sanitizeTargetingInput({
        targetGroup: parsedBody.targetGroup,
        targetType: parsedBody.targetType,
        targetFolderIds: parsedBody.targetFolderIds,
        customFilters: parsedBody.customFilters,
      });

      if (targeting.targetType === 'folder' && targeting.targetFolderIds.length === 0) {
        res.status(400).json({ error: 'Please select at least one folder' });
        return;
      }

      const [template] = await db
        .select()
        .from(smsTemplates)
        .where(and(
          eq(smsTemplates.id, parsedBody.templateId),
          eq(smsTemplates.tenantId, tenantId)
        ))
        .limit(1);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      const consumersList = await db
        .select()
        .from(consumers)
        .where(eq(consumers.tenantId, tenantId));

      const accountsList = await db
        .select()
        .from(accounts)
        .where(eq(accounts.tenantId, tenantId));

      const targetedConsumers = filterConsumersForCampaign(consumersList, accountsList, targeting);
      const recipientCount = targetedConsumers.filter((consumer) => !!consumer.phone).length;

      if (await supportsSmsCampaignTargeting()) {
        const [newCampaign] = await db
          .insert(smsCampaigns)
          .values({
            tenantId,
            templateId: parsedBody.templateId,
            name: parsedBody.name,
            targetGroup: targeting.targetGroup,
            targetType: targeting.targetType,
            targetFolderIds: targeting.targetFolderIds,
            customFilters: targeting.customFilters,
            status: 'pending',
            totalRecipients: recipientCount,
            totalSent: 0,
            totalDelivered: 0,
            totalErrors: 0,
            totalOptOuts: 0,
          })
          .returning();

        res.status(201).json({
          ...newCampaign,
          targetFolderIds: ensureStringArray(newCampaign.targetFolderIds),
          customFilters: ensureCustomFilters(newCampaign.customFilters),
          templateName: template.name,
        });
        return;
      }

      const sql = getSqlClient();
      const legacyInsert = await sql`
        INSERT INTO sms_campaigns (
          tenant_id,
          template_id,
          name,
          target_group,
          status,
          total_recipients
        )
        VALUES (${tenantId}, ${parsedBody.templateId}, ${parsedBody.name}, ${targeting.targetGroup}, ${'pending'}, ${recipientCount})
        RETURNING *
      `;

      const legacyCampaign = legacyInsert[0] as RawRecord | undefined;
      if (!legacyCampaign) {
        res.status(500).json({ error: 'Failed to create SMS campaign' });
        return;
      }

      const normalized = mapLegacySmsCampaignRow(legacyCampaign, 'template_name');
      res.status(201).json({
        ...normalized,
        targetType: 'all',
        targetFolderIds: [],
        customFilters: {},
        templateName: template.name,
      });
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
    } else if (req.method === 'DELETE') {
      // Delete a campaign
      const campaignId = req.query.id as string;

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