import { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, sql } from 'drizzle-orm';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: 'Email and date of birth are required' });
    }

    const { email, dateOfBirth, tenantSlug: bodyTenantSlug } = parsed.data;
    const tenantSlug = bodyTenantSlug || (req as any)?.agencySlug;

    const db = await getDb();

    let tenant: typeof tenants.$inferSelect | null = null;
    let consumer: typeof consumers.$inferSelect | null = null;

    if (tenantSlug) {
      const [tenantMatch] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (!tenantMatch) {
        return res.status(404).json({ message: 'Agency not found' });
      }

      tenant = tenantMatch;

      const consumerMatches = await db
        .select({ consumer: consumers })
        .from(consumers)
        .where(
          and(
            eq(consumers.tenantId, tenant.id),
            sql`LOWER(${consumers.email}) = LOWER(${email})`
          )
        )
        .limit(1);

      if (consumerMatches.length === 0) {
        return res.status(404).json({
          message: 'No account found with this email for this agency. Would you like to create a new account?',
          canRegister: true,
          suggestedAction: 'register'
        });
      }

      consumer = consumerMatches[0].consumer;
    } else {
      const consumerRows = await db
        .select({
          consumer: consumers,
          tenant: tenants
        })
        .from(consumers)
        .leftJoin(tenants, eq(consumers.tenantId, tenants.id))
        .where(sql`LOWER(${consumers.email}) = LOWER(${email})`);

      if (consumerRows.length === 0) {
        return res.status(404).json({
          message: 'No account found with this email. Would you like to create a new account?',
          canRegister: true,
          suggestedAction: 'register'
        });
      }

      const linkedConsumers = consumerRows.filter(row => row.consumer.tenantId && row.tenant);
      const uniqueLinkedConsumers = Array.from(
        new Map(
          linkedConsumers.map(row => [row.tenant!.id, row])
        ).values()
      );

      if (uniqueLinkedConsumers.length > 1) {
        const agencies = uniqueLinkedConsumers.map(row => ({
          id: row.tenant!.id,
          name: row.tenant!.name,
          slug: row.tenant!.slug
        }));

        return res.status(200).json({
          multipleAgencies: true,
          message: 'Your account is registered with multiple agencies. Please select one:',
          agencies,
          email
        });
      }

      if (uniqueLinkedConsumers.length === 1) {
        consumer = uniqueLinkedConsumers[0].consumer;
        tenant = uniqueLinkedConsumers[0].tenant!;
      } else {
        const firstConsumer = consumerRows[0]?.consumer;
        if (!firstConsumer) {
          return res.status(404).json({
            message: 'No account found with this email. Would you like to create a new account?',
            canRegister: true,
            suggestedAction: 'register'
          });
        }

        // If consumer has a tenant_id, let the flow continue to fetch the tenant by ID
        // Only return needsAgencyLink if truly no tenant_id exists
        if (firstConsumer.tenantId) {
          consumer = firstConsumer;
          // Flow will continue and fetch tenant by ID below
        } else {
          return res.status(200).json({
            message: 'Your account needs to be linked to an agency. Please complete registration.',
            needsAgencyLink: true,
            consumer: {
              id: firstConsumer.id,
              firstName: firstConsumer.firstName,
              lastName: firstConsumer.lastName,
              email: firstConsumer.email
            },
            suggestedAction: 'register'
          });
        }
      }
    }

    if (!consumer) {
      return res.status(404).json({
        message: tenantSlug
          ? 'No account found with this email for this agency. Would you like to create a new account?'
          : 'No account found with this email. Would you like to create a new account?',
        canRegister: true,
        suggestedAction: 'register'
      });
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
      return res.status(200).json({
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
      return res.status(200).json({
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

    // Normalize date format (both should be YYYY-MM-DD)
    const normalizeDate = (dateStr: string) => {
      try {
        // Create date object to validate, then extract components to avoid timezone issues
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) {
          return null;
        }
        // Return in YYYY-MM-DD format
        return date.toISOString().split('T')[0];
      } catch {
        return null;
      }
    };

    const normalizedProvided = normalizeDate(dateOfBirth);
    const normalizedStored = normalizeDate(consumer.dateOfBirth);

    if (!normalizedProvided || !normalizedStored) {
      return res.status(401).json({ message: 'Invalid date format provided.' });
    }

    if (normalizedProvided !== normalizedStored) {
      return res.status(401).json({ message: 'Date of birth verification failed. Please check your information.' });
    }

    if (!consumer.tenantId) {
      return res.status(200).json({
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
      }
    });
  } catch (error) {
    console.error('Consumer login error:', error);
    return res.status(500).json({ message: 'Login failed' });
  }
}
