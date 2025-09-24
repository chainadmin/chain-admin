import { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '../../_lib/db.js';
import { verifyConsumerAuth } from '../../_lib/auth.js';
import {
  arrangementOptions,
  consumers,
  tenants,
  tenantSettings,
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
    const balanceParam = req.query.balance;

    const requestedEmail = Array.isArray(emailParam) ? emailParam[0] : emailParam;
    const requestedTenantSlug = Array.isArray(tenantSlugParam) ? tenantSlugParam[0] : tenantSlugParam;
    const balanceRaw = Array.isArray(balanceParam) ? balanceParam[0] : balanceParam;

    const sanitizedEmail = decodeURIComponent((requestedEmail ?? '').trim());

    if (!sanitizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (sanitizedEmail.toLowerCase() !== authConsumer.email.trim().toLowerCase()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenantSlug = (requestedTenantSlug ?? authConsumer.tenantSlug ?? '').trim();
    if (!tenantSlug) {
      return res.status(400).json({ error: 'Tenant slug required' });
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

    const [settings] = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenant.id))
      .limit(1);

    if (settings && settings.showPaymentPlans === false) {
      return res.status(200).json([]);
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

    const balanceCents = Number.parseInt(balanceRaw ?? '0', 10);
    const safeBalance = Number.isFinite(balanceCents) ? balanceCents : 0;

    const options = await db
      .select()
      .from(arrangementOptions)
      .where(and(eq(arrangementOptions.tenantId, tenant.id), eq(arrangementOptions.isActive, true)));

    const applicableOptions = options.filter(option => {
      const min = option.minBalance ?? 0;
      const max = option.maxBalance ?? Number.MAX_SAFE_INTEGER;
      return safeBalance >= min && safeBalance <= max;
    });

    res.status(200).json(applicableOptions);
  } catch (error) {
    console.error('Error fetching arrangement options:', error);
    res.status(500).json({ error: 'Failed to fetch arrangement options' });
  }
}
