import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db.js';
import { consumers, accounts, tenants, tenantSettings } from '../../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { verifyConsumerAuth } from '../../_lib/auth.js';

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

    if (!sanitizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (sanitizedEmail.toLowerCase() !== authConsumer.email.trim().toLowerCase()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getDb();

    let tenantRecord: typeof tenants.$inferSelect | null = null;
    if (authConsumer.tenantId) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, authConsumer.tenantId))
        .limit(1);
      tenantRecord = tenant ?? null;
    }

    const tenantSlug = (requestedTenantSlug ?? authConsumer.tenantSlug ?? '').trim();

    if (!tenantRecord && tenantSlug) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (!tenant) {
        return res.status(404).json({ error: 'Agency not found' });
      }
      tenantRecord = tenant;
    }

    if (!tenantRecord) {
      return res.status(400).json({ error: 'Tenant context is missing' });
    }

    if (tenantSlug && tenantRecord.slug !== tenantSlug) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenantId = tenantRecord.id;

    const [consumer] = await db
      .select()
      .from(consumers)
      .where(
        and(
          eq(consumers.id, authConsumer.consumerId),
          eq(consumers.tenantId, tenantId),
          sql`LOWER(${consumers.email}) = LOWER(${sanitizedEmail})`
        )
      )
      .limit(1);

    if (!consumer) {
      return res.status(404).json({ error: 'Consumer not found' });
    }

    const accountsData = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.consumerId, consumer.id), eq(accounts.tenantId, tenantId)));

    const [settings] = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);

    res.status(200).json({
      consumer: {
        id: consumer.id,
        firstName: consumer.firstName,
        lastName: consumer.lastName,
        email: consumer.email,
        phone: consumer.phone,
      },
      accounts: accountsData,
      tenant: {
        id: tenantRecord.id,
        name: tenantRecord.name,
        slug: tenantRecord.slug,
      },
      tenantSettings: settings ?? null,
    });
  } catch (error) {
    console.error('Error fetching consumer accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
}