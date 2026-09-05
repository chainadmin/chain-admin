import { VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';
import { accounts, consumers, documents } from './_lib/schema';
import { eq, and } from 'drizzle-orm';
import { withAuth, type AuthenticatedRequest } from './_lib/auth';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const db = await getDb();
    
    const tenantId = req.authClaims?.tenantId;

    if (!tenantId) {
      res.status(403).json({ error: 'No tenant access' });
      return;
    }

    if (req.method === 'GET') {
      // Get all documents for the tenant, including related account + consumer info when available
      const tenantDocuments = await db
        .select({
          documentId: documents.id,
          documentTenantId: documents.tenantId,
          documentAccountId: documents.accountId,
          title: documents.title,
          description: documents.description,
          fileName: documents.fileName,
          fileUrl: documents.fileUrl,
          fileSize: documents.fileSize,
          mimeType: documents.mimeType,
          isPublic: documents.isPublic,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
          joinedAccountId: accounts.id,
          accountNumber: accounts.accountNumber,
          accountCreditor: accounts.creditor,
          accountConsumerId: accounts.consumerId,
          consumerId: consumers.id,
          consumerFirstName: consumers.firstName,
          consumerLastName: consumers.lastName,
          consumerEmail: consumers.email,
          consumerPhone: consumers.phone,
        })
        .from(documents)
        .leftJoin(accounts, eq(documents.accountId, accounts.id))
        .leftJoin(consumers, eq(accounts.consumerId, consumers.id))
        .where(eq(documents.tenantId, tenantId));

      const formattedDocuments = tenantDocuments.map((document) => {
        const account = document.joinedAccountId
          ? {
              id: document.joinedAccountId,
              accountNumber: document.accountNumber,
              creditor: document.accountCreditor,
              consumerId: document.accountConsumerId,
              consumer: document.consumerId
                ? {
                    id: document.consumerId,
                    firstName: document.consumerFirstName,
                    lastName: document.consumerLastName,
                    email: document.consumerEmail,
                    phone: document.consumerPhone,
                  }
                : null,
            }
          : null;

        return {
          id: document.documentId,
          tenantId: document.documentTenantId,
          accountId: document.documentAccountId,
          title: document.title,
          description: document.description,
          fileName: document.fileName,
          fileUrl: document.fileUrl,
          fileSize: document.fileSize,
          mimeType: document.mimeType,
          isPublic: document.isPublic,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
          account,
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

export default withAuth(handler);
