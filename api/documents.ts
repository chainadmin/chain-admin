import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { getDb } from './_lib/db.js';
import { accounts, consumers, documents } from './_lib/schema.js';
import { eq, and } from 'drizzle-orm';
import { JWT_SECRET } from './_lib/auth.js';

interface AuthenticatedRequest extends VercelRequest {
  method: string;
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
      // Get all documents for the tenant, including related account + consumer info when available
      const tenantDocuments = await db
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
          account: {
            id: accounts.id,
            accountNumber: accounts.accountNumber,
            creditor: accounts.creditor,
            consumerId: accounts.consumerId,
            consumer: {
              id: consumers.id,
              firstName: consumers.firstName,
              lastName: consumers.lastName,
              email: consumers.email,
              phone: consumers.phone,
            },
          },
        })
        .from(documents)
        .leftJoin(accounts, eq(documents.accountId, accounts.id))
        .leftJoin(consumers, eq(accounts.consumerId, consumers.id))
        .where(eq(documents.tenantId, tenantId));

      const formattedDocuments = tenantDocuments.map((document) => {
        const { account, ...rest } = document;

        if (!account?.id) {
          return {
            ...rest,
            account: null,
          };
        }

        const consumer = account.consumer?.id
          ? account.consumer
          : null;

        return {
          ...rest,
          account: {
            ...account,
            consumer,
          },
        };
      });

      res.status(200).json(formattedDocuments);
    } else if (req.method === 'POST') {
      // Create a new document
      const {
        title,
        description,
        fileName,
        fileUrl,
        fileSize,
        mimeType,
        isPublic,
        accountId,
      } = req.body;

      if (!title || !fileName || !fileUrl) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const isPublicDocument = isPublic ?? true;

      if (!isPublicDocument && !accountId) {
        res.status(400).json({ error: 'Account is required when document is not public' });
        return;
      }

      let validatedAccountId: string | null = null;
      if (accountId) {
        const [account] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, tenantId)))
          .limit(1);

        if (!account) {
          res.status(404).json({ error: 'Account not found for this tenant' });
          return;
        }

        validatedAccountId = account.id;
      }

      const [newDocument] = await db
        .insert(documents)
        .values({
          tenantId,
          accountId: validatedAccountId,
          title,
          description: description || null,
          fileName,
          fileUrl,
          fileSize: fileSize || 0,
          mimeType: mimeType || 'application/octet-stream',
          isPublic: isPublicDocument,
        })
        .returning();

      res.status(201).json(newDocument);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Documents API error:', error);
    res.status(500).json({ error: error.message });
  }
}

export default handler;