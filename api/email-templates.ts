import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { emailTemplates } from './_lib/schema.js';
import { eq, and, desc } from 'drizzle-orm';
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

    if (req.method === 'GET') {
      // Get all email templates for the tenant
      const templates = await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.tenantId, tenantId))
        .orderBy(desc(emailTemplates.createdAt));

      res.status(200).json(templates);
    } else if (req.method === 'POST') {
      // Create a new email template
      // Frontend sends 'html' field, backend stores it as 'content'
      const { name, subject, html, category } = req.body;

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
          html,  // Now using 'html' directly to match database
          category: category || 'general',
        })
        .returning();

      res.status(201).json(newTemplate);
    } else if (req.method === 'DELETE') {
      // Delete an email template - expects /api/email-templates?id=<templateId>
      const templateId = req.query.id as string;

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