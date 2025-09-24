import { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq } from 'drizzle-orm';

import { getDb } from '../../_lib/db.js';
import { verifyConsumerAuth } from '../../_lib/auth.js';
import { consumerNotifications } from '../../../shared/schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authResult = verifyConsumerAuth(req);
    if ('error' in authResult) {
      return res.status(authResult.error.status).json({ error: authResult.error.message });
    }

    const { consumer: authConsumer } = authResult;

    const idParam = req.query.id;
    const notificationId = Array.isArray(idParam) ? idParam[0] : idParam;

    if (!notificationId) {
      return res.status(400).json({ error: 'Notification id is required' });
    }

    const db = getDb();

    const updated = await db
      .update(consumerNotifications)
      .set({ isRead: true })
      .where(
        and(
          eq(consumerNotifications.id, notificationId),
          eq(consumerNotifications.consumerId, authConsumer.consumerId),
        )
      )
      .returning({ id: consumerNotifications.id });

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
}
