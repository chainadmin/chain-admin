import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { tenants, users, platformUsers, agencyCredentials } from '../../shared/schema';
import { generateToken } from '../_lib/auth';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Define the registration schema here
const agencyTrialRegistrationSchema = z.object({
  businessName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional()
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the request with the trial registration schema
    const parsed = agencyTrialRegistrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid registration data', details: parsed.error.errors });
    }

    const data = parsed.data;
    const db = await getDb();
    
    // Generate a slug from business name
    const slug = data.businessName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);

    // Check if tenant slug already exists
    const existingTenant = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (existingTenant.length > 0) {
      return res.status(400).json({ error: 'Business name already exists' });
    }

    // Check if email already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create tenant - let PostgreSQL generate the UUID
    const [newTenant] = await db.insert(tenants).values({
      name: data.businessName,
      slug: slug,
      isActive: true,
      isTrialAccount: true,
      isPaidAccount: false
    }).returning();

    // Create user - let PostgreSQL generate the UUID
    const [newUser] = await db.insert(users).values({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName
    }).returning();
    
    const userId = newUser.id;

    // Hash the user's password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create agency credentials
    await db.insert(agencyCredentials).values({
      tenantId: newTenant.id,
      username: data.email, // Use email as username
      email: data.email,
      passwordHash: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      role: 'owner',
      isActive: true
    });

    // Create platform user association
    await db.insert(platformUsers).values({
      authId: userId,
      tenantId: newTenant.id,
      role: 'owner',
      isActive: true
    });

    // Generate JWT token
    const token = generateToken(userId, newTenant.id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        email: data.email,
        name: `${data.firstName} ${data.lastName}`
      },
      tenant: {
        id: newTenant.id,
        name: data.businessName,
        slug: slug
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register agency' });
  }
}