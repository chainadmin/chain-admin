import { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';

import { getDb } from '../../../_lib/db.js';
import { consumerNotifications } from '../../../../shared/schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const idParam = req.query.id;
    const notificationId = Array.isArray(idParam) ? idParam[0] : idParam;

    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }

    const db = getDb();

    const [updated] = await db
      .update(consumerNotifications)
      .set({ isRead: true })
      .where(eq(consumerNotifications.id, notificationId))
      .returning({ id: consumerNotifications.id });

    if (!updated) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.status(200).json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}
