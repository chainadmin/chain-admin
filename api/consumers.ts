import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth';
import { listConsumers, updateConsumer, deleteConsumers, ConsumerNotFoundError } from '../shared/server/consumers';
import jwt from 'jsonwebtoken';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const method = (req.method ?? '').toUpperCase();

  if (method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const db = await getDb();
    
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

    if (method === 'GET') {
      const consumers = await listConsumers(db, tenantId);
      res.status(200).json(consumers);
    } else if (method === 'PATCH') {
      // Update consumer information
      const consumerId = req.url?.split('/').pop();

      if (!consumerId || consumerId === 'consumers') {
        res.status(400).json({ error: 'Consumer ID is required' });
        return;
      }

      const updates = req.body;

      try {
        const updatedConsumer = await updateConsumer(db, tenantId, consumerId, updates);
        res.status(200).json(updatedConsumer);
      } catch (error) {
        if (error instanceof ConsumerNotFoundError) {
          res.status(404).json({ error: error.message });
        } else {
          throw error;
        }
      }
    } else if (method === 'DELETE') {
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
      
      try {
        const result = await deleteConsumers(db, tenantId, consumerIds);
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof ConsumerNotFoundError) {
          res.status(404).json({ error: error.message });
        } else {
          throw error;
        }
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Consumers API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to process consumer request',
      message: errorMessage 
    });
  }
}

export default withAuth(handler);