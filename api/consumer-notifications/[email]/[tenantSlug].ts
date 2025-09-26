import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../../_lib/db.js';
import { consumers, consumerNotifications, tenants } from '../../../_lib/schema.js';
import { and, desc, eq, sql } from 'drizzle-orm';

function normalizeParam(param: string | string[] | undefined) {
  if (!param) {
    return undefined;
  }

  const value = Array.isArray(param) ? param[0] : param;
  return value ? value.trim() : undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const emailParam = normalizeParam(req.query.email);
    const tenantParam = normalizeParam(req.query.tenantSlug);

    if (!emailParam || !tenantParam) {
      res.status(400).json({ error: 'Email and tenant identifier are required' });
      return;
    }

    const email = decodeURIComponent(emailParam);
    const tenantIdentifier = decodeURIComponent(tenantParam);

    const db = getDb();

    // Resolve tenant identifier to tenant ID
    const [tenantBySlug] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, tenantIdentifier))
      .limit(1);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const tenantId = tenantBySlug?.id ?? (uuidRegex.test(tenantIdentifier) ? tenantIdentifier : undefined);

    if (!tenantId) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    const [consumer] = await db
      .select({ id: consumers.id })
      .from(consumers)
      .where(
        and(
          eq(consumers.tenantId, tenantId),
          sql`LOWER(${consumers.email}) = LOWER(${email})`
        )
      )
      .limit(1);

    if (!consumer) {
      res.status(404).json({ error: 'Consumer not found' });
      return;
    }

    const notifications = await db
      .select()
      .from(consumerNotifications)
      .where(eq(consumerNotifications.consumerId, consumer.id))
      .orderBy(desc(consumerNotifications.createdAt));

    res.status(200).json(notifications);
  } catch (error) {
    console.error('Error fetching consumer notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}
