import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';
import { insertConsumerSchema, consumers, tenants, accounts, consumerNotifications } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

async function consumerOwnsFileNumber(db: any, consumerId: string, fileNumber: string): Promise<boolean> {
  const normalized = String(fileNumber ?? '').trim().toLowerCase();
  if (!normalized) return false;
  const consumerAccounts = await db
    .select({ filenumber: accounts.filenumber, accountNumber: accounts.accountNumber })
    .from(accounts)
    .where(eq(accounts.consumerId, consumerId));
  return consumerAccounts.some((acc: { filenumber: string | null; accountNumber: string | null }) =>
    (acc.filenumber && acc.filenumber.trim().toLowerCase() === normalized) ||
    (acc.accountNumber && acc.accountNumber.trim().toLowerCase() === normalized)
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the request body, allowing additional fields like tenantSlug and fileNumber
    const { tenantSlug, fileNumber, ...consumerData } = req.body;
    const parsed = insertConsumerSchema.safeParse(consumerData);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid registration data', details: parsed.error.errors });
    }

    if (!parsed.data.dateOfBirth && !fileNumber) {
      return res.status(400).json({ error: 'Either date of birth or file number is required' });
    }

    const data = parsed.data;
    const db = await getDb();

    // Get tenant by slug
    let tenant: typeof tenants.$inferSelect | null = null;
    // Check both tenantSlug (from new client) and tenantId (legacy/backwards compatibility)
    const agencySlug = tenantSlug || data.tenantId;
    if (agencySlug) {
      // If slug is provided, look up the tenant
      const [foundTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, agencySlug))
        .limit(1);
      tenant = foundTenant || null;

      if (!tenant) {
        return res.status(404).json({ error: 'Agency not found' });
      }
    }

    // Check if consumer already exists
    const existingConsumer = await db
      .select()
      .from(consumers)
      .where(
        tenant
          ? and(
              eq(consumers.email, data.email!),
              eq(consumers.tenantId, tenant.id)
            )
          : eq(consumers.email, data.email!)
      )
      .limit(1);

    let consumerId: string;

    if (existingConsumer.length > 0) {
      const existing = existingConsumer[0];
      
      // If already registered, reject
      if (existing.isRegistered) {
        return res.status(400).json({ error: 'Consumer already registered' });
      }

      // Verify the registrant against the existing record using DOB or file number
      let verified = false;
      if (data.dateOfBirth) {
        // Missing stored DOB should not block registration (matches Express route behavior)
        verified = existing.dateOfBirth ? existing.dateOfBirth === data.dateOfBirth : true;
      }
      if (!verified && fileNumber) {
        verified = await consumerOwnsFileNumber(db, existing.id, fileNumber);
      }
      if (!verified) {
        return res.status(400).json({
          error: "An account with this email exists, but the verification details don't match. Please check your date of birth or file number."
        });
      }

      // Update pre-created consumer with registration data
      const [updatedConsumer] = await db
        .update(consumers)
        .set({
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          dateOfBirth: data.dateOfBirth,
          ssnLast4: data.ssnLast4,
          address: data.address,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
          isRegistered: true,
          registrationDate: new Date()
        })
        .where(eq(consumers.id, existing.id))
        .returning();
      
      consumerId = updatedConsumer.id;
      
      // If consumer has a tenantId but tenant isn't loaded, get it for response
      if (updatedConsumer.tenantId && !tenant) {
        const [foundTenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, updatedConsumer.tenantId))
          .limit(1);
        tenant = foundTenant || null;
      }
    } else {
      // Create consumer - let PostgreSQL generate the UUID
      const [newConsumer] = await db.insert(consumers).values({
        tenantId: tenant?.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        dateOfBirth: data.dateOfBirth,
        ssnLast4: data.ssnLast4,
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        isRegistered: true,
        registrationDate: new Date()
      }).returning();
      
      consumerId = newConsumer.id;
    }

    // If tenant is provided, get associated accounts
    let consumerAccounts: typeof accounts.$inferSelect[] = [];
    if (tenant) {
      consumerAccounts = await db
        .select()
        .from(accounts)
        .where(and(
          eq(accounts.consumerId, consumerId),
          eq(accounts.tenantId, tenant.id)
        ));

      // Create welcome notification
      await db.insert(consumerNotifications).values({
        consumerId,
        tenantId: tenant.id,
        title: 'Welcome to Your Account Portal',
        message: `Welcome ${data.firstName}! You can now view and manage your accounts online.`,
        type: 'info',
        isRead: false
      });
    }

    res.status(201).json({
      success: true,
      consumer: {
        id: consumerId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email
      },
      tenant: tenant ? {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug
      } : null,
      accounts: consumerAccounts
    });
  } catch (error) {
    console.error('Consumer registration error:', error);
    res.status(500).json({ error: 'Failed to register consumer' });
  }
}