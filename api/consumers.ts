import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { consumers, accounts, folders } from './_lib/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const db = getDb();
    
    // Get tenant ID from JWT token
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.headers.cookie?.split(';').find((c: string) => c.trim().startsWith('authToken='))?.split('=')[1];
    
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

    if (req.method === 'GET') {
      // Get all consumers for the tenant with their folders
      const tenantConsumers = await db
        .select({
          id: consumers.id,
          firstName: consumers.firstName,
          lastName: consumers.lastName,
          email: consumers.email,
          phone: consumers.phone,
          dateOfBirth: consumers.dateOfBirth,
          ssnLast4: consumers.ssnLast4,
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
      const accountCounts = consumerIds.length > 0 ? await db
        .select({
          consumerId: accounts.consumerId,
          count: sql<number>`count(*)::int`
        })
        .from(accounts)
        .where(and(
          eq(accounts.tenantId, tenantId),
          inArray(accounts.consumerId, consumerIds)
        ))
        .groupBy(accounts.consumerId) : [];

      // Merge account counts with consumers
      const consumersWithCounts = tenantConsumers.map(consumer => ({
        ...consumer,
        accountCount: accountCounts.find(ac => ac.consumerId === consumer.id)?.count || 0,
      }));

      res.status(200).json(consumersWithCounts);
    } else if (req.method === 'PATCH') {
      // Update consumer information
      const consumerId = req.url?.split('/').pop();
      
      if (!consumerId || consumerId === 'consumers') {
        res.status(400).json({ error: 'Consumer ID is required' });
        return;
      }
      
      const updates = req.body ?? {};
      const updateData: any = { ...updates };

      if (Object.prototype.hasOwnProperty.call(updates, 'ssnLast4')) {
        const rawValue = updates.ssnLast4;

        if (rawValue === null || (typeof rawValue === 'string' && rawValue.trim() === '')) {
          updateData.ssnLast4 = null;
        } else if (typeof rawValue === 'string') {
          const normalized = rawValue.replace(/\D/g, '').slice(-4);
          if (normalized.length !== 4) {
            res.status(400).json({ error: 'SSN last 4 must contain exactly four digits' });
            return;
          }
          updateData.ssnLast4 = normalized;
        } else {
          res.status(400).json({ error: 'SSN last 4 must be provided as a string or null' });
          return;
        }
      }

      // Verify consumer belongs to tenant
      const [existingConsumer] = await db
        .select()
        .from(consumers)
        .where(and(
          eq(consumers.id, consumerId),
          eq(consumers.tenantId, tenantId)
        ))
        .limit(1);
      
      if (!existingConsumer) {
        res.status(404).json({ error: 'Consumer not found' });
        return;
      }
      
      // Update the consumer
      const [updatedConsumer] = await db
        .update(consumers)
        .set(updateData)
        .where(and(
          eq(consumers.id, consumerId),
          eq(consumers.tenantId, tenantId)
        ))
        .returning();
      
      res.status(200).json(updatedConsumer);
    } else if (req.method === 'DELETE') {
      // Handle consumer deletion
      const normalizeIds = (value: unknown): string[] => {
        if (!value && value !== 0) {
          return [];
        }

        if (Array.isArray(value)) {
          return value.reduce<string[]>((acc, item) => acc.concat(normalizeIds(item)), []);
        }

        if (typeof value === 'number') {
          return [String(value)];
        }

        if (typeof value === 'string') {
          const trimmedValue = value.trim();

          if (!trimmedValue) {
            return [];
          }

          if (
            (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) ||
            (trimmedValue.startsWith('{') && trimmedValue.endsWith('}'))
          ) {
            try {
              const parsed = JSON.parse(trimmedValue);
              return normalizeIds(parsed);
            } catch {
              // Fall through to standard parsing if JSON.parse fails
            }
          }

          return trimmedValue
            .split(',')
            .map(idValue => idValue.trim().replace(/^['"]+|['"]+$/g, ''))
            .filter(Boolean);
        }

        return [];
      };

      const bodyPayload = (req.body ?? {}) as { id?: unknown; ids?: unknown };
      const queryPayload = (req.query ?? {}) as { [key: string]: unknown };

      const urlPath = req.url ? req.url.split('?')[0] : '';
      const pathSegments = urlPath ? urlPath.split('/').filter(Boolean) : [];
      const pathId = pathSegments[pathSegments.length - 1];
      const idsFromPath = pathId && pathId !== 'consumers' ? normalizeIds(pathId) : [];

      const consumerIds = Array.from(
        new Set([
          ...normalizeIds(bodyPayload.id),
          ...normalizeIds(bodyPayload.ids),
          ...normalizeIds(queryPayload.id),
          ...normalizeIds(queryPayload.ids),
          ...idsFromPath,
        ])
      );

      if (consumerIds.length === 0) {
        res.status(400).json({ error: 'No valid consumer IDs provided' });
        return;
      }
      
      // Verify all consumers belong to the tenant before deletion
      const existingConsumers = await db
        .select({ id: consumers.id })
        .from(consumers)
        .where(and(
          eq(consumers.tenantId, tenantId),
          inArray(consumers.id, consumerIds)
        ));
      
      if (existingConsumers.length === 0) {
        res.status(404).json({ error: 'No consumers found to delete' });
        return;
      }
      
      const validConsumerIds = existingConsumers.map(c => c.id);
      
      // Delete associated accounts first (cascade delete)
      await db
        .delete(accounts)
        .where(and(
          eq(accounts.tenantId, tenantId),
          inArray(accounts.consumerId, validConsumerIds)
        ));
      
      // Delete the consumers
      await db
        .delete(consumers)
        .where(and(
          eq(consumers.tenantId, tenantId),
          inArray(consumers.id, validConsumerIds)
        ));
      
      res.status(200).json({ 
        success: true, 
        message: `Successfully deleted ${validConsumerIds.length} consumer(s)`,
        deletedCount: validConsumerIds.length
      });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Consumers API error:', error);
    res.status(500).json({ 
      error: 'Failed to process consumer request',
      message: error.message 
    });
  }
}

export default withAuth(handler);