import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { getDb } from '../_lib/db.js';
import { documents } from '../_lib/schema.js';
import { eq, and } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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

    const { id } = req.query;
    
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    if (req.method === 'GET') {
      // Get a specific document
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

      res.status(200).json(document);
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
        .where(eq(documents.id, id));

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