import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { getDb } from '../_lib/db';
import { arrangementOptions } from '../_lib/schema';
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
      res.status(400).json({ error: 'Arrangement option ID is required' });
      return;
    }

    if (req.method === 'GET') {
      // Get a specific arrangement option
      const [option] = await db
        .select()
        .from(arrangementOptions)
        .where(and(
          eq(arrangementOptions.id, id),
          eq(arrangementOptions.tenantId, tenantId)
        ))
        .limit(1);

      if (!option) {
        res.status(404).json({ error: 'Arrangement option not found' });
        return;
      }

      res.status(200).json(option);
    } else if (req.method === 'DELETE') {
      // Check if option belongs to tenant
      const [option] = await db
        .select()
        .from(arrangementOptions)
        .where(and(
          eq(arrangementOptions.id, id),
          eq(arrangementOptions.tenantId, tenantId)
        ))
        .limit(1);

      if (!option) {
        res.status(404).json({ error: 'Arrangement option not found' });
        return;
      }

      // Delete the option
      await db
        .delete(arrangementOptions)
        .where(eq(arrangementOptions.id, id));

      res.status(200).json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Arrangement options API error:', error);
    res.status(500).json({ error: error.message });
  }
}

export default handler;