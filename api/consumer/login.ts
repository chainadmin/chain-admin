import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { consumers, tenants } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

const loginSchema = z.object({
  email: z.string().email(),
  dateOfBirth: z.string()  // Consumer verifies with DOB
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid login data' });
    }

    const { email, dateOfBirth } = parsed.data;
    const db = getDb();

    // Search for consumer across all tenants
    const consumersFound = await db
      .select({
        consumer: consumers,
        tenant: tenants
      })
      .from(consumers)
      .innerJoin(tenants, eq(consumers.tenantId, tenants.id))
      .where(eq(consumers.email, email));

    if (consumersFound.length === 0) {
      return res.status(404).json({ 
        error: 'No account found',
        message: 'No account found with this email. Please contact your agency for account details.'
      });
    }

    // TODO: In the future, verify dateOfBirth against consumer record
    // For now, we're using it as a simple verification step
    // You could add a dateOfBirth field to consumers table and verify here

    if (consumersFound.length === 1) {
      // Single agency - proceed with login
      const { consumer, tenant } = consumersFound[0];
      
      // Generate consumer JWT token
      const token = jwt.sign(
        { 
          consumerId: consumer.id,
          email: consumer.email,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          type: 'consumer'
        },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.status(200).json({
        success: true,
        token,
        consumer: {
          id: consumer.id,
          email: consumer.email,
          firstName: consumer.firstName,
          lastName: consumer.lastName
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug
        }
      });
    } else {
      // Multiple agencies - let consumer choose
      const agencies = consumersFound.map(({ tenant }) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug
      }));

      res.status(200).json({
        multipleAgencies: true,
        message: 'Your account is registered with multiple agencies. Please select one:',
        agencies,
        email
      });
    }
  } catch (error) {
    console.error('Consumer login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
}