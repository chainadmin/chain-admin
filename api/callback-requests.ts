import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth';
import { callbackRequests, consumers } from './_lib/schema';
import { eq, and, desc } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

function resolveRequestId(req: AuthenticatedRequest) {
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
      // Get all callback requests for the tenant
      const requests = await db
        .select({
          id: callbackRequests.id,
          consumerId: callbackRequests.consumerId,
          phoneNumber: callbackRequests.phoneNumber,
          emailAddress: callbackRequests.emailAddress,
          requestType: callbackRequests.requestType,
          preferredTime: callbackRequests.preferredTime,
          subject: callbackRequests.subject,
          message: callbackRequests.message,
          status: callbackRequests.status,
          priority: callbackRequests.priority,
          assignedTo: callbackRequests.assignedTo,
          adminNotes: callbackRequests.adminNotes,
          resolvedAt: callbackRequests.resolvedAt,
          createdAt: callbackRequests.createdAt,
          consumer: {
            id: consumers.id,
            firstName: consumers.firstName,
            lastName: consumers.lastName,
            email: consumers.email,
            phone: consumers.phone,
          },
        })
        .from(callbackRequests)
        .leftJoin(consumers, eq(callbackRequests.consumerId, consumers.id))
        .where(eq(callbackRequests.tenantId, tenantId))
        .orderBy(desc(callbackRequests.createdAt));

      res.status(200).json(requests);
    } else if (req.method === 'PATCH') {
      // Update callback request - supports /api/callback-requests?id=<requestId> and /api/callback-requests/<requestId>
      const requestId = resolveRequestId(req);
      const updates = req.body;

      if (!requestId) {
        res.status(400).json({ error: 'Request ID is required' });
        return;
      }

      // Check if request exists and belongs to tenant
      const [request] = await db
        .select()
        .from(callbackRequests)
        .where(and(
          eq(callbackRequests.id, requestId),
          eq(callbackRequests.tenantId, tenantId)
        ))
        .limit(1);

      if (!request) {
        res.status(404).json({ error: 'Callback request not found' });
        return;
      }

      // Build update object
      const updateData: any = {};
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.assignedTo !== undefined) updateData.assignedTo = updates.assignedTo;
      if (updates.adminNotes !== undefined) updateData.adminNotes = updates.adminNotes;
      
      // If marking as completed, set resolvedAt
      if (updates.status === 'completed') {
        updateData.resolvedAt = new Date();
      }

      const [updatedRequest] = await db
        .update(callbackRequests)
        .set(updateData)
        .where(eq(callbackRequests.id, requestId))
        .returning();

      res.status(200).json(updatedRequest);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Callback requests API error:', error);
    res.status(500).json({ 
      error: 'Failed to process callback request',
      message: error.message 
    });
  }
}

export default withAuth(handler);