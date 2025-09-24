import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';

import { getDb } from '../../../_lib/db.js';
import { consumerNotifications } from '../../../_lib/schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { id } = req.query;

    if (typeof id !== 'string' || !id) {
      res.status(400).json({ error: 'Notification ID is required' });
      return;
    }

    const db = getDb();

    const [notification] = await db
      .select()
      .from(consumerNotifications)
      .where(eq(consumerNotifications.id, id))
      .limit(1);

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    if (notification.isRead) {
      res.status(200).json({ message: 'Notification already marked as read' });
      return;
    }

    await db
      .update(consumerNotifications)
      .set({ isRead: true })
      .where(eq(consumerNotifications.id, id));

    res.status(200).json({ message: 'Notification marked as read' });
  } catch (error: any) {
    console.error('Mark notification read API error:', error);
    res.status(500).json({
      error: 'Failed to mark notification as read',
      message: error.message ?? 'Unknown error'
    });
  }
}
