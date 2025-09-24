import { VercelRequest, VercelResponse } from '@vercel/node';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getDb } from '../../../../_lib/db.js';
import { consumers, consumerNotifications, tenants } from '../../../../../shared/schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const emailParam = req.query.email;
    const tenantSlugParam = req.query.tenantSlug;

    if (typeof emailParam !== 'string' || !emailParam.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (typeof tenantSlugParam !== 'string' || !tenantSlugParam.trim()) {
      return res.status(400).json({ error: 'Tenant slug is required' });
    }

    const email = emailParam.trim();
    const tenantSlug = tenantSlugParam.trim();

    const db = getDb();

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ message: 'Consumer not found' });
    }

    const normalizedEmailMatch = sql`LOWER(${consumers.email}) = LOWER(${email})`;

    const [consumer] = await db
      .select()
      .from(consumers)
      .where(and(eq(consumers.tenantId, tenant.id), normalizedEmailMatch))
      .limit(1);

    if (!consumer) {
      return res.status(404).json({ message: 'Consumer not found' });
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
