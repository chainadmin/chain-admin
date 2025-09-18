import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { getDb } from './_lib/db.js';
import { documents } from './_lib/schema.js';
import { eq, and } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

interface AuthenticatedRequest extends VercelRequest {
  method: string;
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
      // Get all documents for the tenant
      const tenantDocuments = await db
        .select()
        .from(documents)
        .where(eq(documents.tenantId, tenantId));

      res.status(200).json(tenantDocuments);
    } else if (req.method === 'POST') {
      // Create a new document
      const { title, description, fileName, fileUrl, fileSize, mimeType, isPublic } = req.body;

      if (!title || !fileName || !fileUrl) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const [newDocument] = await db
        .insert(documents)
        .values({
          tenantId,
          title,
          description: description || null,
          fileName,
          fileUrl,
          fileSize: fileSize || 0,
          mimeType: mimeType || 'application/octet-stream',
          isPublic: isPublic ?? true,
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