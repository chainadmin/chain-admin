import { VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { arrangementOptions } from '../_lib/schema';
import { withAuth, type AuthenticatedRequest } from '../_lib/auth';
import { eq, and } from 'drizzle-orm';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const method = (req.method ?? '').toUpperCase();

  if (method === 'OPTIONS') {
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

    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    
    if (!id) {
      res.status(400).json({ error: 'Arrangement option ID is required' });
      return;
    }

    if (method === 'GET') {
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
    } else if (method === 'DELETE') {
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

export default withAuth(handler);