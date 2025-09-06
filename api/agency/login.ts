import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { agencyCredentials, users, platformUsers, tenants } from '../../shared/schema';
import { generateToken } from '../_lib/auth';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
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

    const { email, password } = parsed.data;
    const db = getDb();

    // Get agency credentials
    const [credentials] = await db
      .select()
      .from(agencyCredentials)
      .where(eq(agencyCredentials.email, email))
      .limit(1);

    if (!credentials) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, credentials.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get or create user
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // Create user if doesn't exist
      const userId = nanoid();
      await db.insert(users).values({
        id: userId,
        email,
        name: email.split('@')[0],
        replitId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
    }

    // Get platform user
    const [platformUser] = await db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.userId, user.id))
      .limit(1);

    if (!platformUser) {
      return res.status(401).json({ error: 'User not associated with any agency' });
    }

    // Get tenant info
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, platformUser.tenantId))
      .limit(1);

    if (!tenant) {
      return res.status(401).json({ error: 'Agency not found' });
    }

    // Check if tenant is active
    if (tenant.status !== 'active') {
      return res.status(403).json({ error: 'Agency account is not active' });
    }

    // Generate JWT token
    const token = generateToken(user.id, tenant.id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: platformUser.role
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        subscriptionTier: tenant.subscriptionTier,
        subscriptionEndDate: tenant.subscriptionEndDate
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
}

// Import helper
import { nanoid } from 'nanoid';