import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { insertConsumerSchema, consumers, tenants, accounts, consumerNotifications } from '../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = insertConsumerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid registration data', details: parsed.error.errors });
    }

    const data = parsed.data;
    const db = getDb();

    // Get tenant by slug
    let tenant: typeof tenants.$inferSelect | null = null;
    if (data.tenantId) {
      // If tenantId is provided, assume it's actually a slug
      const [foundTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, data.tenantId))
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

    if (existingConsumer.length > 0) {
      return res.status(400).json({ error: 'Consumer already registered' });
    }

    // Create consumer
    const consumerId = nanoid();
    await db.insert(consumers).values({
      id: consumerId,
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
    });

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