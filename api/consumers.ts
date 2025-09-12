import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest } from './_lib/auth.js';
import { consumers, accounts, folders } from './_lib/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const db = getDb();
    
    // Get tenant ID from JWT token
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.headers.cookie?.split(';').find(c => c.trim().startsWith('authToken='))?.split('=')[1];
    
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const tenantId = decoded.tenantId;

    if (!tenantId) {
      res.status(403).json({ error: 'No tenant access' });
      return;
    }

    // Get all consumers for the tenant with their folders
    const tenantConsumers = await db
      .select({
        id: consumers.id,
        firstName: consumers.firstName,
        lastName: consumers.lastName,
        email: consumers.email,
        phone: consumers.phone,
        dateOfBirth: consumers.dateOfBirth,
        address: consumers.address,
        city: consumers.city,
        state: consumers.state,
        zipCode: consumers.zipCode,
        isRegistered: consumers.isRegistered,
        registrationDate: consumers.registrationDate,
        contactPrefs: consumers.contactPrefs,
        additionalData: consumers.additionalData,
        createdAt: consumers.createdAt,
        folder: {
          id: folders.id,
          name: folders.name,
          color: folders.color,
        },
      })
      .from(consumers)
      .leftJoin(folders, eq(consumers.folderId, folders.id))
      .where(eq(consumers.tenantId, tenantId));

    // Get account counts for each consumer
    const consumerIds = tenantConsumers.map(c => c.id);
    const accountCounts = await db
      .select({
        consumerId: accounts.consumerId,
        count: sql<number>`count(*)::int`
      })
      .from(accounts)
      .where(and(
        eq(accounts.tenantId, tenantId),
        accounts.consumerId ? sql`${accounts.consumerId} = ANY(${consumerIds})` : sql`false`
      ))
      .groupBy(accounts.consumerId);

    // Merge account counts with consumers
    const consumersWithCounts = tenantConsumers.map(consumer => ({
      ...consumer,
      accountCount: accountCounts.find(ac => ac.consumerId === consumer.id)?.count || 0,
    }));

    res.status(200).json(consumersWithCounts);
  } catch (error: any) {
    console.error('Consumers API error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch consumers',
      message: error.message 
    });
  }
}

export default withAuth(handler);