import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { tenants, tenantSettings, users, platformUsers, agencyCredentials } from '../../shared/schema';
import { generateToken } from '../_lib/auth';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { and, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  classifyCanonicalTenantCandidates,
  companyIdentityLockKeys,
  normalizeCompanyEmail,
  normalizeCompanyName,
} from '../../server/phoneProductIdentity';

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
    const email = normalizeCompanyEmail(data.email);
    const passwordHash = await bcrypt.hash(data.password, 10);
    const baseSlug = data.businessName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 40) || 'agency';

    const result = await db.transaction(async tx => {
      for (const key of companyIdentityLockKeys(email, data.businessName)) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
      }

      const candidates = await tx.select().from(tenants).where(or(
        sql`lower(trim(${tenants.email})) = ${email}`,
        sql`lower(regexp_replace(trim(coalesce(${tenants.businessName}, ${tenants.name})), '[[:space:]]+', ' ', 'g')) = ${normalizeCompanyName(data.businessName)}`,
      ));
      const canonical = classifyCanonicalTenantCandidates(candidates, email, data.businessName);
      if (canonical.reason) {
        throw Object.assign(new Error('A company record has a conflicting or ambiguous identity and requires manual review.'), { status: 409 });
      }

      let tenant = canonical.tenant;
      if (tenant && !tenant.chiamoConnectEnabled) {
        throw Object.assign(new Error('An agency with this company identity already exists. Please try logging in instead.'), { status: 400 });
      }
      if (tenant) {
        throw Object.assign(new Error('This company already has a Chiamo Connect account. Sign in with the existing owner login; no duplicate company was created.'), { status: 409 });
      }
      [tenant] = await tx.insert(tenants).values({
        name: data.businessName,
        businessName: data.businessName,
        slug: `${baseSlug}-${crypto.randomBytes(5).toString('hex')}`,
        email,
        phoneNumber: data.phone,
        ownerFirstName: data.firstName,
        ownerLastName: data.lastName,
        chainCoreEnabled: true,
        isActive: true,
        isTrialAccount: true,
        isPaidAccount: false,
      }).returning();

      const credentialsForEmail = await tx.select().from(agencyCredentials)
        .where(sql`lower(trim(${agencyCredentials.email})) = ${email}`);
      const credentialElsewhere = credentialsForEmail.find(row => row.tenantId !== tenant.id);
      if (credentialElsewhere) {
        throw Object.assign(new Error('The owner credential is associated with another company and requires manual review.'), { status: 409 });
      }
      const [credential] = await tx.insert(agencyCredentials).values({
        tenantId: tenant.id,
        username: email,
        email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'owner',
        isActive: true,
      }).returning();

      const matchingUsers = await tx.select().from(users)
        .where(sql`lower(trim(${users.email})) = ${email}`);
      if (matchingUsers.length > 1) {
        throw Object.assign(new Error('Multiple user records match this email and require manual review.'), { status: 409 });
      }
      let user = matchingUsers[0];
      if (!user) {
        [user] = await tx.insert(users).values({
          email,
          firstName: data.firstName,
          lastName: data.lastName,
        }).returning();
      }

      const userTenants = await tx.select().from(platformUsers)
        .where(eq(platformUsers.authId, user.id));
      if (userTenants.some(row => row.tenantId && row.tenantId !== tenant.id)) {
        throw Object.assign(new Error('The login identity is associated with another company and requires manual review.'), { status: 409 });
      }
      const platformUser = userTenants.find(row => row.tenantId === tenant.id);
      if (!platformUser) {
        await tx.insert(platformUsers).values({
          authId: user.id,
          tenantId: tenant.id,
          role: 'owner',
          isActive: true,
        });
      }

      await tx.insert(tenantSettings).values({
        tenantId: tenant.id,
        showPaymentPlans: true,
        showDocuments: true,
        allowSettlementRequests: true,
        smsThrottleLimit: 10,
        customBranding: {},
        consumerPortalSettings: {},
      }).onConflictDoNothing();

      return { tenant, user, credential };
    });

    // Generate JWT token
    const token = generateToken(result.user.id, result.tenant.id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: result.user.id,
        email,
        name: `${data.firstName} ${data.lastName}`
      },
      tenant: {
        id: result.tenant.id,
        name: data.businessName,
        slug: result.tenant.slug
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (typeof error === 'object' && error !== null && 'status' in error) {
      const expected = error as { status: number; message?: string };
      return res.status(expected.status).json({ error: expected.message || 'Registration could not be completed' });
    }
    res.status(500).json({ error: 'Failed to register agency' });
  }
}