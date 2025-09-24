import { VercelRequest, VercelResponse } from '@vercel/node';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getDb } from '../../_lib/db.js';
import { verifyConsumerAuth } from '../../_lib/auth.js';
import {
  consumerNotifications,
  consumers,
  tenants,
} from '../../../shared/schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authResult = verifyConsumerAuth(req);
    if ('error' in authResult) {
      return res.status(authResult.error.status).json({ error: authResult.error.message });
    }

    const { consumer: authConsumer } = authResult;

    const emailParam = req.query.email;
    const tenantSlugParam = req.query.tenantSlug;

    const requestedEmail = Array.isArray(emailParam) ? emailParam[0] : emailParam;
    const requestedTenantSlug = Array.isArray(tenantSlugParam) ? tenantSlugParam[0] : tenantSlugParam;

    const sanitizedEmail = decodeURIComponent((requestedEmail ?? '').trim());
    const tenantSlug = decodeURIComponent((requestedTenantSlug ?? '').trim());

    if (!sanitizedEmail || !tenantSlug) {
      return res.status(400).json({ error: 'Email and tenant slug are required' });
    }

    if (sanitizedEmail.toLowerCase() !== authConsumer.email.trim().toLowerCase()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getDb();

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (authConsumer.tenantId && authConsumer.tenantId !== tenant.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [consumer] = await db
      .select()
      .from(consumers)
      .where(
        and(
          eq(consumers.id, authConsumer.consumerId),
          eq(consumers.tenantId, tenant.id),
          sql`LOWER(${consumers.email}) = LOWER(${sanitizedEmail})`
        )
      )
      .limit(1);

    if (!consumer) {
      return res.status(404).json({ error: 'Consumer not found' });
    }

    const notifications = await db
      .select()
      .from(consumerNotifications)
      .where(and(eq(consumerNotifications.consumerId, consumer.id), eq(consumerNotifications.tenantId, tenant.id)))
      .orderBy(desc(consumerNotifications.createdAt));

    res.status(200).json(notifications);
  } catch (error) {
    console.error('Error fetching consumer notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}
