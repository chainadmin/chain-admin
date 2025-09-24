import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getDb } from '../../../../_lib/db.js';
import { consumers, consumerNotifications, tenants } from '../../../../_lib/schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { tenantSlug, email } = req.query;

    if (typeof tenantSlug !== 'string' || !tenantSlug) {
      res.status(400).json({ error: 'Tenant slug is required' });
      return;
    }

    if (typeof email !== 'string' || !email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const db = getDb();

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    const [consumer] = await db
      .select()
      .from(consumers)
      .where(
        and(
          eq(consumers.tenantId, tenant.id),
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
  } catch (error: any) {
    console.error('Consumer notifications API error:', error);
    res.status(500).json({
      error: 'Failed to fetch notifications',
      message: error.message ?? 'Unknown error'
    });
  }
}
