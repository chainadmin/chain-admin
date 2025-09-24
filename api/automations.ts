import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { communicationAutomations, automationExecutions, emailTemplates, smsTemplates } from './_lib/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

function resolveAutomationId(req: AuthenticatedRequest) {
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
      // Get all automations for the tenant
      const automations = await db
        .select()
        .from(communicationAutomations)
        .where(eq(communicationAutomations.tenantId, tenantId))
        .orderBy(desc(communicationAutomations.createdAt));

      res.status(200).json(automations);
    } else if (req.method === 'POST') {
      // Create a new automation
      const {
        name,
        type, // 'email' or 'sms'
        templateId,
        trigger, // 'scheduled', 'account_added', 'payment_received', etc.
        targetGroup, // 'all', 'with-balance', 'overdue', etc.
        scheduleType, // 'one-time', 'recurring'
        scheduledTime, // For one-time scheduled automations
        scheduledDaysOfWeek, // For recurring: ["monday", "wednesday", "friday"]
        scheduledTimeOfDay, // For recurring: "09:00"
        removeOnPayment,
        isActive,
      } = req.body;

      if (!name || !type || !trigger) {
        res.status(400).json({ error: 'Name, type, and trigger are required' });
        return;
      }

      // Validate template exists if provided
      if (templateId) {
        const tableToCheck = type === 'email' ? emailTemplates : smsTemplates;
        const [template] = await db
          .select()
          .from(tableToCheck)
          .where(and(
            eq(tableToCheck.id, templateId),
            eq(tableToCheck.tenantId, tenantId)
          ))
          .limit(1);

        if (!template) {
          res.status(404).json({ error: `${type} template not found` });
          return;
        }
      }

      const [newAutomation] = await db
        .insert(communicationAutomations)
        .values({
          tenantId,
          name,
          type,
          templateId,
          trigger,
          targetGroup,
          isActive: isActive !== undefined ? isActive : true,
          scheduleType,
          scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
          scheduledDaysOfWeek: scheduledDaysOfWeek || [],
          scheduledTimeOfDay: scheduledTimeOfDay || null,
          removeOnPayment: removeOnPayment || false,
          metadata: {},
        })
        .returning();

      res.status(201).json(newAutomation);
    } else if (req.method === 'PUT') {
      // Update automation (activate/deactivate or modify settings)
      const automationId = resolveAutomationId(req);
      const updates = req.body;

      if (!automationId) {
        res.status(400).json({ error: 'Automation ID is required' });
        return;
      }

      // Verify automation exists and belongs to tenant
      const [automation] = await db
        .select()
        .from(communicationAutomations)
        .where(and(
          eq(communicationAutomations.id, automationId),
          eq(communicationAutomations.tenantId, tenantId)
        ))
        .limit(1);

      if (!automation) {
        res.status(404).json({ error: 'Automation not found' });
        return;
      }

      // Update automation
      const [updatedAutomation] = await db
        .update(communicationAutomations)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(communicationAutomations.id, automationId))
        .returning();

      res.status(200).json(updatedAutomation);
    } else if (req.method === 'DELETE') {
      // Delete an automation
      const automationId = resolveAutomationId(req);

      if (!automationId) {
        res.status(400).json({ error: 'Automation ID is required' });
        return;
      }

      // Verify automation exists and belongs to tenant
      const [automation] = await db
        .select()
        .from(communicationAutomations)
        .where(and(
          eq(communicationAutomations.id, automationId),
          eq(communicationAutomations.tenantId, tenantId)
        ))
        .limit(1);

      if (!automation) {
        res.status(404).json({ error: 'Automation not found' });
        return;
      }

      await db
        .delete(communicationAutomations)
        .where(eq(communicationAutomations.id, automationId));

      res.status(200).json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Automation error:', error);
    res.status(500).json({ 
      error: 'Failed to process automation request',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default withAuth(handler);