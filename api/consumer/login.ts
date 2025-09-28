import { VercelRequest, VercelResponse } from '@vercel/node';
import { eq, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { getDb } from '../_lib/db.js';
import { JWT_SECRET } from '../_lib/auth.js';
import { consumers, tenants } from '../../shared/schema.js';

const loginSchema = z.object({
  email: z.string().email(),
  dateOfBirth: z.string().min(1),
  tenantSlug: z.string().optional()
});

const normalizeDate = (value: string) => {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
};

function preventCaching(res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    preventCaching(res);
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: 'Email and date of birth are required' });
    }

    const { email, dateOfBirth, tenantSlug: bodyTenantSlug } = parsed.data;
    const tenantSlug = (bodyTenantSlug || (req as any)?.agencySlug || '').trim() || undefined;

    const db = await getDb();

    let requestedTenant: typeof tenants.$inferSelect | null = null;

    if (tenantSlug) {
      const [tenantMatch] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (!tenantMatch) {
        return res.status(404).json({ message: 'Agency not found' });
      }

      requestedTenant = tenantMatch;
    }

    const consumerRows = await db
      .select({ consumer: consumers, tenant: tenants })
      .from(consumers)
      .leftJoin(tenants, eq(consumers.tenantId, tenants.id))
      .where(sql`LOWER(${consumers.email}) = LOWER(${email})`);

    const filteredRows = tenantSlug
      ? consumerRows.filter(row => row.tenant?.slug === tenantSlug)
      : consumerRows;

    if (filteredRows.length === 0) {
      return res.status(404).json({
        message: tenantSlug
          ? 'No account found with this email for this agency. Would you like to create a new account?'
          : 'No account found with this email. Would you like to create a new account?',
        canRegister: true,
        suggestedAction: 'register'
      });
    }

    const consumer = filteredRows.find(row => row.consumer)?.consumer;

    if (!consumer) {
      return res.status(404).json({
        message: 'No account found with this email. Would you like to create a new account?',
        canRegister: true,
        suggestedAction: 'register'
      });
    }

    let tenant = filteredRows.find(row => row.tenant)?.tenant ?? requestedTenant;

    if (!tenant && !tenantSlug && consumerRows.length > 1) {
      const uniqueLinkedConsumers = Array.from(
        new Map(
          consumerRows
            .filter(row => row.tenant)
            .map(row => [row.tenant!.id, row])
        ).values()
      );

      if (uniqueLinkedConsumers.length > 1) {
        const agencies = uniqueLinkedConsumers.map(row => ({
          id: row.tenant!.id,
          name: row.tenant!.name,
          slug: row.tenant!.slug
        }));

        return res.status(409).json({
          multipleAgencies: true,
          message: 'Your account is registered with multiple agencies. Please select one:',
          agencies,
          email
        });
      }

      if (uniqueLinkedConsumers.length === 1) {
        tenant = uniqueLinkedConsumers[0].tenant!;
      }
    }

    if (!tenant && consumer.tenantId) {
      const [tenantById] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, consumer.tenantId))
        .limit(1);

      if (tenantById) {
        tenant = tenantById;
      }
    }

    if (!tenant) {
      return res.status(409).json({
        message: 'Your account needs to be linked to an agency. Please complete registration.',
        needsAgencyLink: true,
        consumer: {
          id: consumer.id,
          firstName: consumer.firstName,
          lastName: consumer.lastName,
          email: consumer.email
        },
        suggestedAction: 'register'
      });
    }

    if (!consumer.isRegistered) {
      return res.status(409).json({
        message: 'Account found but not yet activated. Complete your registration.',
        needsRegistration: true,
        consumer: {
          id: consumer.id,
          firstName: consumer.firstName,
          lastName: consumer.lastName,
          email: consumer.email,
          tenantId: consumer.tenantId
        },
        tenant: {
          name: tenant.name,
          slug: tenant.slug
        }
      });
    }

    // Compare date strings directly instead of Date objects to avoid timezone issues
    if (!consumer.dateOfBirth) {
      return res.status(401).json({ message: 'Date of birth verification required. Please contact your agency.' });
    }

    const normalizedProvided = normalizeDate(dateOfBirth);
    const normalizedStored = normalizeDate(consumer.dateOfBirth);

    if (!normalizedProvided || !normalizedStored) {
      return res.status(401).json({ message: 'Invalid date format provided.' });
    }

    if (normalizedProvided !== normalizedStored) {
      return res.status(401).json({ message: 'Date of birth verification failed. Please check your information.' });
    }

    if (!consumer.tenantId) {
      return res.status(409).json({
        message: 'Your account needs to be linked to an agency. Please complete registration.',
        needsAgencyLink: true,
        consumer: {
          id: consumer.id,
          firstName: consumer.firstName,
          lastName: consumer.lastName,
          email: consumer.email
        },
        suggestedAction: 'register'
      });
    }

    const token = jwt.sign(
      {
        consumerId: consumer.id,
        email: consumer.email,
        tenantId: consumer.tenantId,
        tenantSlug: tenant.slug,
        type: 'consumer'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      token,
      consumer: {
        id: consumer.id,
        firstName: consumer.firstName,
        lastName: consumer.lastName,
        email: consumer.email,
        phone: consumer.phone,
        tenantId: consumer.tenantId
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug
      },
      tenantSlug: tenant.slug
    });
  } catch (error) {
    console.error('Consumer login error:', error);
    return res.status(500).json({ message: 'Login failed' });
  }
}
