import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { agencyCredentials, users, platformUsers, tenants } from '../_lib/schema';
import { generateToken } from '../_lib/auth';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(1),
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

    const { username, password } = parsed.data;
    const db = getDb();

    // Get agency credentials (username can be either username or email)
    const [credentials] = await db
      .select()
      .from(agencyCredentials)
      .where(eq(agencyCredentials.username, username))
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
    const email = credentials.email;
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // Create user if doesn't exist - let PostgreSQL generate the UUID
      [user] = await db.insert(users).values({
        email,
        firstName: credentials.firstName,
        lastName: credentials.lastName
      }).returning();
    }

    // Get platform user
    const [platformUser] = await db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.authId, user.id))
      .limit(1);

    if (!platformUser) {
      return res.status(401).json({ error: 'User not associated with any agency' });
    }

    // Get tenant info
    if (!platformUser.tenantId) {
      return res.status(401).json({ error: 'User not associated with any agency' });
    }
    
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, platformUser.tenantId))
      .limit(1);

    if (!tenant) {
      return res.status(401).json({ error: 'Agency not found' });
    }

    // Check if tenant is active
    if (!tenant.isActive) {
      return res.status(403).json({ error: 'Agency account is not active' });
    }

    // Generate JWT token with tenant info
    const token = generateToken(user.id, tenant.id, tenant.slug, tenant.name);

    // Set cookie that works across subdomains (only in production with custom domain)
    // Check multiple headers for the domain (Vercel may use different headers)
    const hostname = req.headers.host || req.headers['x-forwarded-host'] || '';
    const origin = req.headers.origin || '';
    const isCustomDomain = hostname.includes('chainsoftwaregroup.com') || origin.includes('chainsoftwaregroup.com');
    const domain = isCustomDomain ? '.chainsoftwaregroup.com' : undefined;
    
    // Set cookies (authToken needs to be readable by JavaScript for authentication check)
    res.setHeader('Set-Cookie', [
      `authToken=${token}; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${domain ? `; Domain=${domain}` : ''}`,
      `tenantSlug=${tenant.slug}; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${domain ? `; Domain=${domain}` : ''}`,
      `tenantName=${encodeURIComponent(tenant.name)}; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${domain ? `; Domain=${domain}` : ''}`
    ]);

    res.status(200).json({
      success: true,
      token, // Still return token for backwards compatibility
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        role: platformUser.role
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        isActive: tenant.isActive,
        isTrialAccount: tenant.isTrialAccount,
        isPaidAccount: tenant.isPaidAccount
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
}

// Import helper
import { nanoid } from 'nanoid';