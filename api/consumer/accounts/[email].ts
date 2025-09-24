import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db.js';
import { consumers, accounts, tenants } from '../../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const email = (req.query.email as string | undefined) ?? '';
    const tenantSlug = req.query.tenantSlug as string;

    const sanitizedEmail = email.trim();

    if (!sanitizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const db = getDb();
    let tenantId: string | null = null;

    // Get tenant if slug provided
    if (tenantSlug) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (!tenant) {
        return res.status(404).json({ error: 'Agency not found' });
      }
      tenantId = tenant.id;
    }

    // Get consumer
    const normalizedEmailMatch = sql`LOWER(${consumers.email}) = LOWER(${sanitizedEmail})`;

    const consumerQuery = tenantId
      ? and(eq(consumers.tenantId, tenantId), normalizedEmailMatch)
      : normalizedEmailMatch;

    const [consumer] = await db
      .select()
      .from(consumers)
      .where(consumerQuery)
      .limit(1);

    if (!consumer) {
      return res.status(404).json({ error: 'Consumer not found' });
    }

    // Get accounts
    const accountsData = await db
      .select()
      .from(accounts)
      .where(eq(accounts.consumerId, consumer.id));

    res.status(200).json({
      consumer: {
        id: consumer.id,
        firstName: consumer.firstName,
        lastName: consumer.lastName,
        email: consumer.email,
        phone: consumer.phone
      },
      accounts: accountsData
    });
  } catch (error) {
    console.error('Error fetching consumer accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
}