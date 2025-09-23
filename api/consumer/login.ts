import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { consumers, tenants } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../_lib/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  dateOfBirth: z.string()  // Consumer verifies with DOB
});

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

    // Filter consumers by DOB verification
    const verifiedConsumers = consumersFound.filter(({ consumer }) => {
      if (!consumer.dateOfBirth || !dateOfBirth) {
        // If either DOB is missing, allow login for backward compatibility
        return true;
      }
      // Compare DOB strings (format: MM/DD/YYYY or YYYY-MM-DD)
      const normalizedInputDob = dateOfBirth.replace(/\//g, '-');
      const normalizedStoredDob = consumer.dateOfBirth.replace(/\//g, '-');
      
      // Try to parse and compare dates
      const inputDate = new Date(normalizedInputDob);
      const storedDate = new Date(normalizedStoredDob);
      
      // If dates are valid, compare them
      if (!isNaN(inputDate.getTime()) && !isNaN(storedDate.getTime())) {
        return inputDate.toDateString() === storedDate.toDateString();
      }
      
      // Fallback to string comparison
      return normalizedInputDob === normalizedStoredDob;
    });

    if (verifiedConsumers.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'The date of birth provided does not match our records. Please verify and try again.'
      });
    }

    if (verifiedConsumers.length === 1) {
      // Single agency - proceed with login
      const { consumer, tenant } = verifiedConsumers[0];
      
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
      const agencies = verifiedConsumers.map(({ tenant }) => ({
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