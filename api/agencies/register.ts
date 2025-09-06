import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { agencyTrialRegistrationSchema, tenants, users, platformUsers, agencyCredentials } from '../../shared/schema';
import { generateToken } from '../_lib/auth';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';

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
    const db = getDb();
    
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

    // Create tenant
    await db.insert(tenants).values({
      name: data.businessName,
      slug: slug,
      isTrialAccount: true,
      isPaidAccount: false,
      ownerFirstName: data.ownerFirstName,
      ownerLastName: data.ownerLastName,
      ownerDateOfBirth: data.ownerDateOfBirth,
      ownerSSN: data.ownerSSN,
      businessName: data.businessName,
      phoneNumber: data.phoneNumber,
      email: data.email,
      isActive: true
    });

    // Get the created tenant
    const [newTenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    // Create user
    const userId = nanoid();
    await db.insert(users).values({
      id: userId,
      email: data.email,
      firstName: data.ownerFirstName,
      lastName: data.ownerLastName
    });

    // Generate a random password for initial setup
    const tempPassword = nanoid(12);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create agency credentials
    await db.insert(agencyCredentials).values({
      tenantId: newTenant.id,
      username: data.email,
      email: data.email,
      passwordHash: hashedPassword,
      firstName: data.ownerFirstName,
      lastName: data.ownerLastName,
      role: 'owner',
      isActive: true
    });

    // Create platform user association
    await db.insert(platformUsers).values({
      authId: userId,
      tenantId: newTenant.id,
      role: 'owner',
      permissions: {
        canManageAgency: true,
        canManageUsers: true,
        canManageAccounts: true,
        canManageBilling: true,
        canViewReports: true,
        canManageAutomations: true,
        canManageIntegrations: true
      },
      isActive: true
    });

    // Generate JWT token
    const token = generateToken(userId, newTenant.id);

    res.status(201).json({
      success: true,
      token,
      tempPassword, // Send temporary password to user
      user: {
        id: userId,
        email: data.email,
        name: `${data.ownerFirstName} ${data.ownerLastName}`
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