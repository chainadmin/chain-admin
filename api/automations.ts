import type { VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { communicationAutomations, emailTemplates, smsTemplates } from '../shared/schema.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

type TemplateScheduleItem = {
  templateId: string;
  dayOffset: number;
};

function parseTimeString(time?: string | null) {
  if (!time) {
    return null;
  }

  const [hours, minutes] = time.split(':');
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (Number.isNaN(parsedHours) || Number.isNaN(parsedMinutes)) {
    return null;
  }

  return { hours: parsedHours, minutes: parsedMinutes };
}

function getDaysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function computeNextExecution(options: {
  triggerType: string;
  scheduleType?: string | null;
  scheduledTime?: Date | null;
  scheduleTime?: string | null;
  scheduleWeekdays?: string[];
  scheduleDayOfMonth?: number | null;
  templateSchedule?: TemplateScheduleItem[];
}): Date | null {
  const {
    triggerType,
    scheduleType,
    scheduledTime,
    scheduleTime,
    scheduleWeekdays,
    scheduleDayOfMonth,
    templateSchedule,
  } = options;

  if (triggerType !== 'schedule') {
    return null;
  }

  const normalizedScheduleType = scheduleType || 'once';
  const timeParts = parseTimeString(scheduleTime) || { hours: 9, minutes: 0 };
  const now = new Date();

  if (normalizedScheduleType === 'once') {
    return scheduledTime ?? null;
  }

  if (normalizedScheduleType === 'daily') {
    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setHours(timeParts.hours, timeParts.minutes, 0, 0);
    if (candidate <= now) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  }

  if (normalizedScheduleType === 'weekly') {
    const weekdayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    const validDays = (scheduleWeekdays || [])
      .map((day) => (typeof day === 'string' ? weekdayMap[day.toLowerCase()] : undefined))
      .filter((value): value is number => value !== undefined);

    const targetDays = validDays.length > 0 ? validDays : [now.getDay()];
    let bestCandidate: Date | null = null;

    for (const dayIndex of targetDays) {
      const candidate = new Date(now);
      candidate.setSeconds(0, 0);
      candidate.setHours(timeParts.hours, timeParts.minutes, 0, 0);

      const diff = (dayIndex - now.getDay() + 7) % 7;
      candidate.setDate(candidate.getDate() + diff);

      if (candidate <= now) {
        candidate.setDate(candidate.getDate() + 7);
      }

      if (!bestCandidate || candidate < bestCandidate) {
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  if (normalizedScheduleType === 'monthly') {
    if (scheduleDayOfMonth === undefined || scheduleDayOfMonth === null) {
      return null;
    }

    const day = Number(scheduleDayOfMonth);
    if (Number.isNaN(day) || day < 1) {
      return null;
    }

    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setHours(timeParts.hours, timeParts.minutes, 0, 0);
    candidate.setDate(Math.min(day, getDaysInMonth(candidate)));

    if (candidate <= now) {
      candidate.setMonth(candidate.getMonth() + 1);
      candidate.setDate(Math.min(day, getDaysInMonth(candidate)));
    }

    return candidate;
  }

  if (normalizedScheduleType === 'sequence') {
    if (!scheduledTime) {
      return null;
    }

    const base = new Date(scheduledTime);
    base.setSeconds(0, 0);
    if (timeParts) {
      base.setHours(timeParts.hours, timeParts.minutes, 0, 0);
    }

    const sortedSchedule = (templateSchedule || [])
      .filter((item) => item && typeof item.templateId === 'string')
      .sort((a, b) => a.dayOffset - b.dayOffset);

    if (sortedSchedule.length === 0) {
      return base >= now ? base : null;
    }

    for (const item of sortedSchedule) {
      const candidate = new Date(base);
      candidate.setDate(candidate.getDate() + item.dayOffset);
      if (candidate >= now) {
        return candidate;
      }
    }

    return null;
  }

  return scheduledTime ?? null;
}

function sanitizeTemplateSchedule(input: unknown): TemplateScheduleItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const templateId = (item as any).templateId;
      const offsetRaw = (item as any).dayOffset;
      const dayOffset = Number(offsetRaw);

      if (typeof templateId !== 'string' || !templateId) {
        return null;
      }

      return {
        templateId,
        dayOffset: Number.isNaN(dayOffset) ? 0 : dayOffset,
      };
    })
    .filter((item): item is TemplateScheduleItem => item !== null);
}

function formatAutomation(raw: any) {
  const metadata = raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
  const description = typeof metadata.description === 'string' && metadata.description.trim() !== ''
    ? metadata.description
    : undefined;
  const triggerType = typeof metadata.triggerType === 'string'
    ? metadata.triggerType
    : (raw.trigger === 'scheduled' ? 'schedule' : raw.trigger || 'schedule');
  const targetType = typeof metadata.targetType === 'string'
    ? metadata.targetType
    : raw.targetGroup || 'all';
  const templateSchedule = sanitizeTemplateSchedule(metadata.templateSchedule);

  const templateIdSet = new Set<string>();

  const metadataTemplateIds = Array.isArray(metadata.templateIds)
    ? metadata.templateIds.filter((id: unknown) => typeof id === 'string' && id)
    : [];
  metadataTemplateIds.forEach((id: any) => templateIdSet.add(id));

  templateSchedule.forEach((item) => templateIdSet.add(item.templateId));

  if (typeof raw.templateId === 'string' && raw.templateId) {
    templateIdSet.add(raw.templateId);
  }

  const templateIds = Array.from(templateIdSet);

  const scheduleWeekdays = Array.isArray(metadata.scheduleWeekdays)
    ? metadata.scheduleWeekdays
    : Array.isArray(raw.scheduledDaysOfWeek)
      ? raw.scheduledDaysOfWeek
      : [];

  const scheduleDayOfMonth = metadata.scheduleDayOfMonth ?? null;
  const scheduleTime = metadata.scheduleTime || raw.scheduledTimeOfDay || null;
  const scheduledDate = metadata.scheduledDate
    || (raw.scheduledTime ? new Date(raw.scheduledTime).toISOString() : null);
  const nextExecution = metadata.nextExecution
    || (raw.scheduledTime ? new Date(raw.scheduledTime).toISOString() : null);

  const targetFolderIds = Array.isArray(metadata.targetFolderIds)
    ? metadata.targetFolderIds
    : [];
  const targetCustomerIds = Array.isArray(metadata.targetCustomerIds)
    ? metadata.targetCustomerIds
    : [];
  const customFilters = metadata.customFilters && typeof metadata.customFilters === 'object'
    ? metadata.customFilters
    : {};

  const eventType = typeof metadata.eventType === 'string' ? metadata.eventType : null;
  const eventDelay = typeof metadata.eventDelay === 'string' ? metadata.eventDelay : null;

  const mergedMetadata = {
    ...metadata,
    ...(description !== undefined ? { description } : {}),
    triggerType,
    targetType,
    templateIds,
    templateSchedule,
    scheduleWeekdays,
    scheduleDayOfMonth,
    scheduleTime,
    scheduledDate,
    nextExecution,
    targetFolderIds,
    targetCustomerIds,
    customFilters,
    eventType,
    eventDelay,
  };

  return {
    ...raw,
    description,
    triggerType,
    targetType,
    templateIds,
    templateSchedule,
    scheduleWeekdays,
    scheduleDayOfMonth,
    scheduleTime,
    scheduledDate,
    nextExecution,
    targetFolderIds,
    targetCustomerIds,
    customFilters,
    eventType,
    eventDelay,
    metadata: mergedMetadata,
  };
}

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

    if (req.method === 'GET') {
      // Get all automations for the tenant
      const automations = await db
        .select()
        .from(communicationAutomations)
        .where(eq(communicationAutomations.tenantId, tenantId))
        .orderBy(desc(communicationAutomations.createdAt));

      res.status(200).json(automations.map(formatAutomation));
    } else if (req.method === 'POST') {
      // Create a new automation aligned with the updated communications UI
      const body = req.body || {};

      const {
        name,
        type,
        templateId,
        templateIds,
        templateSchedule,
        triggerType,
        trigger,
        targetGroup,
        targetType,
        scheduleType,
        scheduledDate,
        scheduleTime,
        scheduleWeekdays,
        scheduleDayOfMonth,
        eventType,
        eventDelay,
        removeOnPayment,
        isActive,
        metadata: incomingMetadata,
        targetFolderIds,
        targetCustomerIds,
        customFilters,
      } = body;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Automation name is required' });
        return;
      }

      if (type !== 'email' && type !== 'sms') {
        res.status(400).json({ error: 'Automation type must be "email" or "sms"' });
        return;
      }

      const resolvedTriggerType = typeof triggerType === 'string'
        ? triggerType
        : (typeof trigger === 'string' ? (trigger === 'scheduled' ? 'schedule' : trigger) : 'schedule');

      const triggerColumnValue = typeof trigger === 'string'
        ? trigger
        : (resolvedTriggerType === 'schedule' ? 'scheduled' : resolvedTriggerType);

      const resolvedTargetType = typeof targetType === 'string'
        ? targetType
        : (typeof targetGroup === 'string' ? targetGroup : 'all');

      const targetGroupColumn = typeof targetGroup === 'string' ? targetGroup : resolvedTargetType;

      const normalizedTemplateSchedule = sanitizeTemplateSchedule(templateSchedule);
      const rotationTemplateIds = Array.isArray(templateIds)
        ? templateIds.filter((id: unknown) => typeof id === 'string' && id)
        : [];

      let resolvedTemplateId = typeof templateId === 'string' && templateId ? templateId : undefined;

      const templateIdSet = new Set<string>();
      if (resolvedTemplateId) {
        templateIdSet.add(resolvedTemplateId);
      }
      rotationTemplateIds.forEach((id) => templateIdSet.add(id));
      normalizedTemplateSchedule.forEach((item) => templateIdSet.add(item.templateId));

      if (!resolvedTemplateId) {
        resolvedTemplateId = rotationTemplateIds[0] || normalizedTemplateSchedule[0]?.templateId;
      }

      const templateIdsToValidate = Array.from(templateIdSet);

      if (templateIdsToValidate.length === 0) {
        res.status(400).json({ error: 'Please select at least one template for this automation.' });
        return;
      }

      const templateTable = type === 'email' ? emailTemplates : smsTemplates;

      const templates = await db
        .select({ id: templateTable.id })
        .from(templateTable)
        .where(and(
          eq(templateTable.tenantId, tenantId),
          inArray(templateTable.id, templateIdsToValidate),
        ));

      if (templates.length !== templateIdsToValidate.length) {
        res.status(404).json({ error: 'One or more selected templates could not be found.' });
        return;
      }

      const scheduleWeekdaysNormalized = Array.isArray(scheduleWeekdays)
        ? scheduleWeekdays.filter((day: unknown) => typeof day === 'string' && day)
        : Array.isArray(body.scheduledDaysOfWeek)
          ? body.scheduledDaysOfWeek.filter((day: unknown) => typeof day === 'string' && day)
          : [];

      const scheduleDayRaw = scheduleDayOfMonth ?? body.scheduleDayOfMonth ?? null;
      const parsedScheduleDay = scheduleDayRaw !== null && scheduleDayRaw !== undefined
        ? Number(scheduleDayRaw)
        : null;
      const scheduleDayValue = parsedScheduleDay !== null && !Number.isNaN(parsedScheduleDay)
        ? parsedScheduleDay
        : null;

      const scheduleTimeValue = typeof scheduleTime === 'string' && scheduleTime
        ? scheduleTime
        : typeof body.scheduledTimeOfDay === 'string' && body.scheduledTimeOfDay
          ? body.scheduledTimeOfDay
          : null;

      const scheduledDateIso = typeof scheduledDate === 'string' && scheduledDate
        ? scheduledDate
        : typeof body.scheduledTime === 'string' && body.scheduledTime
          ? body.scheduledTime
          : undefined;

      let scheduledTimestamp: Date | null = null;
      if (scheduledDateIso) {
        const parsed = new Date(scheduledDateIso);
        if (!Number.isNaN(parsed.getTime())) {
          scheduledTimestamp = parsed;
        }
      }

      const normalizedScheduleType = typeof scheduleType === 'string' && scheduleType
        ? scheduleType
        : (resolvedTriggerType === 'schedule' ? 'once' : resolvedTriggerType);

      const normalizedDescription = typeof body.description === 'string' ? body.description : undefined;

      const normalizedTargetFolderIds = Array.isArray(targetFolderIds)
        ? targetFolderIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        : [];
      const normalizedTargetCustomerIds = Array.isArray(targetCustomerIds)
        ? targetCustomerIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        : [];
      const normalizedCustomFilters = customFilters && typeof customFilters === 'object'
        ? customFilters
        : undefined;

      const metadata: Record<string, any> = {
        ...(incomingMetadata && typeof incomingMetadata === 'object' ? incomingMetadata : {}),
      };

      if (normalizedDescription !== undefined) {
        metadata.description = normalizedDescription;
      }
      metadata.triggerType = resolvedTriggerType;
      metadata.targetType = resolvedTargetType;
      metadata.templateIds = templateIdsToValidate;
      metadata.templateSchedule = normalizedTemplateSchedule;
      metadata.scheduleWeekdays = scheduleWeekdaysNormalized;
      metadata.scheduleDayOfMonth = scheduleDayValue;
      metadata.scheduleTime = scheduleTimeValue;
      metadata.scheduleType = normalizedScheduleType;
      if (scheduledTimestamp) {
        metadata.scheduledDate = scheduledTimestamp.toISOString();
      } else {
        delete metadata.scheduledDate;
      }
      metadata.targetFolderIds = normalizedTargetFolderIds;
      metadata.targetCustomerIds = normalizedTargetCustomerIds;
      metadata.customFilters = normalizedCustomFilters ?? {};
      if (typeof eventType === 'string') {
        metadata.eventType = eventType;
      }
      if (typeof eventDelay === 'string') {
        metadata.eventDelay = eventDelay;
      }

      const nextExecution = computeNextExecution({
        triggerType: resolvedTriggerType,
        scheduleType: normalizedScheduleType,
        scheduledTime: scheduledTimestamp,
        scheduleTime: scheduleTimeValue,
        scheduleWeekdays: scheduleWeekdaysNormalized,
        scheduleDayOfMonth: scheduleDayValue,
        templateSchedule: normalizedTemplateSchedule,
      });

      if (nextExecution) {
        metadata.nextExecution = nextExecution.toISOString();
      } else {
        delete metadata.nextExecution;
      }

      const [newAutomation] = await db
        .insert(communicationAutomations)
        .values({
          tenantId,
          name,
          type,
          templateId: resolvedTemplateId || null,
          triggerType: resolvedTriggerType as any,
          scheduleType: normalizedScheduleType as any,
          scheduledDate: scheduledTimestamp,
          scheduleTime: scheduleTimeValue,
          scheduleWeekdays: scheduleWeekdaysNormalized,
          targetType: resolvedTargetType as any,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        })
        .returning();

      res.status(201).json(formatAutomation(newAutomation));
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