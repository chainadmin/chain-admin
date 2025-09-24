import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { consumers, consumerNotifications, tenants } from '../../shared/schema.js';
import { and, desc, eq, sql } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawEmail = typeof req.query.email === 'string' ? req.query.email : Array.isArray(req.query.email) ? req.query.email[0] : '';
    const rawTenantSlug = typeof req.query.tenantSlug === 'string'
      ? req.query.tenantSlug
      : Array.isArray(req.query.tenantSlug)
        ? req.query.tenantSlug[0]
        : undefined;

    const email = rawEmail?.trim() ?? '';
    const tenantSlug = rawTenantSlug?.trim() || undefined;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const db = getDb();

    let tenantId: string | null = null;
    if (tenantSlug) {
      const [tenant] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (!tenant) {
        return res.status(404).json({ error: 'Agency not found' });
      }

      tenantId = tenant.id;
    }

    const normalizedEmailMatch = sql`LOWER(${consumers.email}) = LOWER(${email})`;
    const consumerQuery = tenantId
      ? and(eq(consumers.tenantId, tenantId), normalizedEmailMatch)
      : normalizedEmailMatch;

    const [consumer] = await db
      .select({ id: consumers.id })
      .from(consumers)
      .where(consumerQuery)
      .limit(1);

    if (!consumer) {
      return res.status(404).json({ error: 'Consumer not found' });
    }

    const notifications = await db
      .select()
      .from(consumerNotifications)
      .where(eq(consumerNotifications.consumerId, consumer.id))
      .orderBy(desc(consumerNotifications.createdAt));

    return res.status(200).json(notifications);
  } catch (error) {
    console.error('Error fetching consumer notifications:', error);
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}
