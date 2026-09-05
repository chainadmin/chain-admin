import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { tenants } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { withAuth, type AuthenticatedRequest } from '../_lib/auth';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const method = (req.method ?? '').toUpperCase();

  if (method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const tenantId = req.platformUser?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const db = await getDb();
    const [tenant] = await db
      .select({
        name: tenants.name,
        slug: tenants.slug,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    res.status(200).json({
      id: req.user?.id,
      firstName: req.user?.firstName,
      lastName: req.user?.lastName,
      email: req.user?.email,
      role: req.platformUser?.role,
      tenantId,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
    });
  } catch (error: any) {
    console.error('Auth user API error:', error);
    res.status(500).json({
      error: 'Failed to get user info',
      message: error.message
    });
  }
}

export default withAuth(handler);