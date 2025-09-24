import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { consumerNotifications } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

function resolveNotificationId(req: VercelRequest): string | undefined {
  if (typeof req.body === 'object' && req.body !== null) {
    const bodyId = (req.body as { notificationId?: unknown }).notificationId;
    if (typeof bodyId === 'string' && bodyId.trim()) {
      return bodyId.trim();
    }
  }

  const queryId = req.query.id ?? req.query.notificationId;
  if (typeof queryId === 'string' && queryId.trim()) {
    return queryId.trim();
  }
  if (Array.isArray(queryId) && queryId.length > 0) {
    const candidate = queryId[0];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (req.url) {
    const url = new URL(req.url, 'http://localhost');
    const lastSegment = url.pathname.split('/').filter(Boolean).pop();
    if (lastSegment && lastSegment !== 'mark-read') {
      return lastSegment;
    }
  }

  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const notificationId = resolveNotificationId(req);

    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }

    const db = getDb();

    const updated = await db
      .update(consumerNotifications)
      .set({ isRead: true })
      .where(eq(consumerNotifications.id, notificationId))
      .returning({ id: consumerNotifications.id });

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.status(200).json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}
