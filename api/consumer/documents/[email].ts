import { VercelRequest, VercelResponse } from '@vercel/node';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getDb } from '../../_lib/db.js';
import { verifyConsumerAuth } from '../../_lib/auth.js';
import {
  accounts,
  consumers,
  documents,
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
    const accountIdParam = req.query.accountId;

    const requestedEmail = Array.isArray(emailParam) ? emailParam[0] : emailParam;
    const requestedTenantSlug = Array.isArray(tenantSlugParam) ? tenantSlugParam[0] : tenantSlugParam;
    const requestedAccountId = Array.isArray(accountIdParam) ? accountIdParam[0] : accountIdParam;

    const sanitizedEmail = decodeURIComponent((requestedEmail ?? '').trim());

    if (!sanitizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (sanitizedEmail.toLowerCase() !== authConsumer.email.trim().toLowerCase()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getDb();

    const tenantSlug = (requestedTenantSlug ?? authConsumer.tenantSlug ?? '').trim();
    if (!tenantSlug) {
      return res.status(400).json({ error: 'Tenant slug required' });
    }

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

    if (settings && settings.showDocuments === false) {
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

    const consumerAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.consumerId, consumer.id), eq(accounts.tenantId, tenant.id)));

    const consumerAccountIds = new Set(consumerAccounts.map(account => account.id));

    if (requestedAccountId && !consumerAccountIds.has(requestedAccountId)) {
      return res.status(200).json([]);
    }

    const documentsList = await db
      .select()
      .from(documents)
      .where(eq(documents.tenantId, tenant.id))
      .orderBy(desc(documents.createdAt));

    const visibleDocuments = documentsList.filter(doc => {
      if (doc.isPublic) {
        return true;
      }

      if (!doc.accountId) {
        return false;
      }

      if (requestedAccountId) {
        return doc.accountId === requestedAccountId;
      }

      return consumerAccountIds.has(doc.accountId);
    });

    res.status(200).json(visibleDocuments);
  } catch (error) {
    console.error('Error fetching consumer documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
}
