import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { communicationAutomations, automationExecutions, emailTemplates, smsTemplates } from './_lib/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
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
        description,
        type, // 'email' or 'sms'
        templateId,
        templateIds,
        templateSchedule,
        triggerType, // 'schedule', 'event', 'manual'
        scheduleType, // 'once', 'daily', 'weekly', 'monthly', 'sequence'
        scheduledDate,
        scheduleTime,
        scheduleWeekdays,
        scheduleDayOfMonth,
        eventType,
        eventDelay,
        targetType, // 'all', 'folder', 'custom'
        targetFolderIds,
        targetCustomerIds,
      } = req.body;

      if (!name || !type || !triggerType || !targetType) {
        res.status(400).json({ error: 'Name, type, trigger type, and target type are required' });
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

      // Validate multiple templates if provided
      if (templateIds && templateIds.length > 0) {
        const tableToCheck = type === 'email' ? emailTemplates : smsTemplates;
        const templates = await db
          .select()
          .from(tableToCheck)
          .where(and(
            sql`${tableToCheck.id} = ANY(${templateIds})`,
            eq(tableToCheck.tenantId, tenantId)
          ));

        if (templates.length !== templateIds.length) {
          res.status(404).json({ error: `Some ${type} templates not found` });
          return;
        }
      }

      // Calculate next execution time if it's a scheduled automation
      let nextExecution = null;
      if (triggerType === 'schedule') {
        if (scheduleType === 'once' && scheduledDate) {
          nextExecution = new Date(scheduledDate);
        } else if (scheduleType === 'daily' && scheduleTime) {
          // Set next execution to today at the scheduled time
          const now = new Date();
          const [hours, minutes] = scheduleTime.split(':').map(Number);
          nextExecution = new Date();
          nextExecution.setHours(hours, minutes, 0, 0);
          
          // If time has already passed today, set for tomorrow
          if (nextExecution <= now) {
            nextExecution.setDate(nextExecution.getDate() + 1);
          }
        }
        // Add similar logic for weekly and monthly schedules as needed
      }

      const [newAutomation] = await db
        .insert(communicationAutomations)
        .values({
          tenantId,
          name,
          description,
          type,
          templateId,
          templateIds,
          templateSchedule,
          isActive: true,
          triggerType,
          scheduleType,
          scheduledDate,
          scheduledTime: scheduleTime,
          scheduleWeekdays,
          scheduleDayOfMonth,
          eventType,
          eventDelay,
          targetType,
          targetFolderIds,
          targetCustomerIds,
          nextExecution,
          totalSent: 0,
          currentTemplateIndex: 0,
        })
        .returning();

      res.status(201).json(newAutomation);
    } else if (req.method === 'PUT') {
      // Update automation (activate/deactivate or modify settings)
      const automationId = req.query.id as string;
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
      const automationId = req.query.id as string;

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