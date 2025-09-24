import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db.js';
import { consumerNotifications } from '../../_lib/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH, OPTIONS');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const idParam = req.query.id;
    const notificationId = Array.isArray(idParam) ? idParam[0] : idParam;

    if (!notificationId) {
      res.status(400).json({ error: 'Notification ID is required' });
      return;
    }

    const db = getDb();

    const updated = await db
      .update(consumerNotifications)
      .set({ isRead: true })
      .where(eq(consumerNotifications.id, notificationId))
      .returning({ id: consumerNotifications.id });

    if (updated.length === 0) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.status(200).json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking consumer notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}
