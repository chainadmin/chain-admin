import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth';
import { emailTemplates } from '../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

function resolveTemplateId(req: AuthenticatedRequest) {
  const queryId = req.query?.id;
  if (typeof queryId === 'string' && queryId) {
    return queryId;
  }
  if (Array.isArray(queryId) && queryId.length > 0 && queryId[0]) {
    return queryId[0];
  }
  if (req.url) {
    const url = new URL(req.url, 'http://localhost');
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length > 2) {
      return segments[segments.length - 1];
    }
  }
  return undefined;
}

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

    if (method === 'GET') {
      // Get all email templates for the tenant
      const templates = await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.tenantId, tenantId))
        .orderBy(desc(emailTemplates.createdAt));

      res.status(200).json(templates);
    } else if (method === 'POST') {
      // Create a new email template
      const { name, subject, html, status } = req.body;

      if (!name || !subject || !html) {
        res.status(400).json({ error: 'Name, subject, and content are required' });
        return;
      }

      const [newTemplate] = await db
        .insert(emailTemplates)
        .values({
          tenantId,
          name,
          subject,
          html,
          ...(status ? { status } : {}),
        })
        .returning();

      res.status(201).json(newTemplate);
    } else if (method === 'DELETE') {
      // Delete an email template - supports /api/email-templates?id=<templateId> and /api/email-templates/<templateId>
      const templateId = resolveTemplateId(req);

      if (!templateId) {
        res.status(400).json({ error: 'Template ID is required' });
        return;
      }

      // Check if template exists and belongs to tenant
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

      // Delete the template
      await db
        .delete(emailTemplates)
        .where(eq(emailTemplates.id, templateId));

      res.status(200).json({ success: true, message: 'Template deleted successfully' });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Email templates API error:', error);
    res.status(500).json({ 
      error: 'Failed to process email template request',
      message: error.message 
    });
  }
}

export default withAuth(handler);