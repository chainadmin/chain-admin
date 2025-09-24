import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { getDb } from '../_lib/db.js';
import { accounts, consumers, documents } from '../_lib/schema.js';
import { eq, and } from 'drizzle-orm';
import { JWT_SECRET } from '../_lib/auth.js';

interface AuthenticatedRequest extends VercelRequest {
  method: string;
  query: {
    id: string;
  };
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

    const { id } = req.query;
    
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    if (req.method === 'GET') {
      // Get a specific document including related account & consumer info if available
      const [document] = await db
        .select({
          id: documents.id,
          tenantId: documents.tenantId,
          accountId: documents.accountId,
          title: documents.title,
          description: documents.description,
          fileName: documents.fileName,
          fileUrl: documents.fileUrl,
          fileSize: documents.fileSize,
          mimeType: documents.mimeType,
          isPublic: documents.isPublic,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
          linkedAccountId: accounts.id,
          linkedAccountNumber: accounts.accountNumber,
          linkedAccountCreditor: accounts.creditor,
          linkedAccountConsumerId: accounts.consumerId,
          linkedConsumerId: consumers.id,
          linkedConsumerFirstName: consumers.firstName,
          linkedConsumerLastName: consumers.lastName,
          linkedConsumerEmail: consumers.email,
          linkedConsumerPhone: consumers.phone,
        })
        .from(documents)
        .leftJoin(accounts, eq(documents.accountId, accounts.id))
        .leftJoin(consumers, eq(accounts.consumerId, consumers.id))
        .where(and(
          eq(documents.id, id),
          eq(documents.tenantId, tenantId)
        ))
        .limit(1);

      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      const formattedDocument = (() => {
        const {
          linkedAccountId,
          linkedAccountNumber,
          linkedAccountCreditor,
          linkedAccountConsumerId,
          linkedConsumerId,
          linkedConsumerFirstName,
          linkedConsumerLastName,
          linkedConsumerEmail,
          linkedConsumerPhone,
          ...rest
        } = document;

        if (!linkedAccountId) {
          return {
            ...rest,
            account: null,
          };
        }

        const consumer = linkedConsumerId
          ? {
              id: linkedConsumerId,
              firstName: linkedConsumerFirstName,
              lastName: linkedConsumerLastName,
              email: linkedConsumerEmail,
              phone: linkedConsumerPhone,
            }
          : null;

        return {
          ...rest,
          account: {
            id: linkedAccountId,
            accountNumber: linkedAccountNumber,
            creditor: linkedAccountCreditor,
            consumerId: linkedAccountConsumerId,
            consumer,
          },
        };
      })();

      res.status(200).json(formattedDocument);
    } else if (req.method === 'DELETE') {
      // Check if document belongs to tenant
      const [document] = await db
        .select()
        .from(documents)
        .where(and(
          eq(documents.id, id),
          eq(documents.tenantId, tenantId)
        ))
        .limit(1);

      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      // Delete the document
      await db
        .delete(documents)
        .where(and(
          eq(documents.id, id),
          eq(documents.tenantId, tenantId)
        ));

      res.status(200).json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Document API error:', error);
    res.status(500).json({ error: error.message });
  }
}

export default handler;