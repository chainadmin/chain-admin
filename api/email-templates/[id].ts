import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from '../_lib/auth.js';
import { emailTemplates } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const db = getDb();
    const templateIdParam = req.query.id;
    const templateId = Array.isArray(templateIdParam) ? templateIdParam[0] : templateIdParam;

    if (!templateId || typeof templateId !== 'string') {
      res.status(400).json({ error: 'Template ID is required' });
      return;
    }

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

    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(and(
        eq(emailTemplates.id, templateId),
        eq(emailTemplates.tenantId, tenantId)
      ))
      .limit(1);

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    await db
      .delete(emailTemplates)
      .where(eq(emailTemplates.id, templateId));

    res.status(200).json({ success: true, message: 'Template deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting email template:', error);
    res.status(500).json({
      error: 'Failed to delete email template',
      message: error.message,
    });
  }
}

export default withAuth(handler);
