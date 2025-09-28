import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db.js';
import { consumers, accounts, tenants, tenantSettings } from '../../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../_lib/auth.js';

const sanitizeTokenString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized =
    typeof value === 'string'
      ? value
      : typeof value === 'number'
        ? value.toString()
        : null;

  if (!normalized) {
    return null;
  }

  const trimmed = normalized.trim();
  return trimmed === '' || trimmed === 'undefined' ? null : trimmed;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check for consumer token
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No consumer token provided' });
    }
    
    const token = authHeader.slice(7);
    let decodedToken: any;
    
    try {
      decodedToken = jwt.verify(token, JWT_SECRET) as any;

      // Verify this is a consumer token
      if (decodedToken.type !== 'consumer') {
        return res.status(401).json({ message: 'Invalid token type' });
      }
    } catch (error) {
      return res.status(401).json({ message: 'Invalid consumer token' });
    }

    const tokenTenantId = sanitizeTokenString(decodedToken.tenantId);
    const tokenTenantSlug = sanitizeTokenString(decodedToken.tenantSlug);

    // Now proceed with the original logic
    const email = (req.query.email as string | undefined) ?? '';
    const rawTenantSlug = req.query.tenantSlug;
    const sanitizedRequestTenantSlug = sanitizeTokenString(rawTenantSlug);
    const requestTenantSlug = sanitizedRequestTenantSlug ?? undefined;

    const sanitizedEmail = email.trim();

    if (!sanitizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Verify the consumer is requesting their own data
    if (decodedToken.email && decodedToken.email.toLowerCase() !== sanitizedEmail.toLowerCase()) {
      return res.status(403).json({ message: 'You can only access your own account information' });
    }

    // Verify tenant slug matches if provided in token
    if (tokenTenantSlug && requestTenantSlug && tokenTenantSlug !== requestTenantSlug) {
      return res.status(403).json({ message: 'Tenant mismatch' });
    }

    const db = await getDb();
    const effectiveTenantSlug = requestTenantSlug ?? tokenTenantSlug ?? undefined;
    let tenantId: string | null = tokenTenantId;

    // Get tenant if slug provided
    let tenantRecord: typeof tenants.$inferSelect | null = null;

    if (effectiveTenantSlug) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, effectiveTenantSlug))
        .limit(1);
      if (!tenant) {
        return res.status(404).json({ error: 'Agency not found' });
      }
      tenantRecord = tenant;
      tenantId = tenant.id;
    }

    if (!tenantRecord && tenantId) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      tenantRecord = tenant ?? null;
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

    if (!tenantRecord && consumer.tenantId) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, consumer.tenantId))
        .limit(1);
      tenantRecord = tenant ?? null;
    }

    // Get accounts
    const accountsData = await db
      .select()
      .from(accounts)
      .where(eq(accounts.consumerId, consumer.id));

    const [settings] = tenantRecord
      ? await db
          .select()
          .from(tenantSettings)
          .where(eq(tenantSettings.tenantId, tenantRecord.id))
          .limit(1)
      : [];

    res.status(200).json({
      consumer: {
        id: consumer.id,
        firstName: consumer.firstName,
        lastName: consumer.lastName,
        email: consumer.email,
        phone: consumer.phone
      },
      accounts: accountsData,
      tenant: tenantRecord
        ? {
            id: tenantRecord.id,
            name: tenantRecord.name,
            slug: tenantRecord.slug
          }
        : null,
      tenantSettings: settings ?? null
    });
  } catch (error) {
    console.error('Error fetching consumer accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
}
