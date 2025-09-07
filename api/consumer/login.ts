import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { consumers, tenants } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

const loginSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string()
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

    const { email, tenantSlug } = parsed.data;
    const db = getDb();

    // Get tenant
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: 'Agency not found' });
    }

    // Get consumer
    const [consumer] = await db
      .select()
      .from(consumers)
      .where(and(
        eq(consumers.email, email),
        eq(consumers.tenantId, tenant.id)
      ))
      .limit(1);

    if (!consumer) {
      return res.status(401).json({ error: 'Consumer account not found' });
    }

    // Generate consumer JWT token
    const token = jwt.sign(
      { 
        consumerId: consumer.id,
        email: consumer.email,
        tenantId: tenant.id,
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
  } catch (error) {
    console.error('Consumer login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
}