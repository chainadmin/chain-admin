import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { consumers, accounts, folders } from './_lib/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
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

    // Get total consumers count
    const [consumerCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(consumers)
      .where(eq(consumers.tenantId, tenantId));

    // Get total accounts count
    const [accountCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(accounts)
      .where(eq(accounts.tenantId, tenantId));

    // Get total balance
    const [totalBalance] = await db
      .select({ 
        sum: sql<number>`COALESCE(SUM(balance_cents), 0)::bigint` 
      })
      .from(accounts)
      .where(eq(accounts.tenantId, tenantId));

    // Get folders count
    const [folderCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(folders)
      .where(eq(folders.tenantId, tenantId));

    // Get active accounts count
    const [activeAccountCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(accounts)
      .where(and(
        eq(accounts.tenantId, tenantId),
        eq(accounts.status, 'active')
      ));

    // Get account status breakdown
    const statusBreakdown = await db
      .select({
        status: accounts.status,
        count: sql<number>`count(*)::int`
      })
      .from(accounts)
      .where(eq(accounts.tenantId, tenantId))
      .groupBy(accounts.status);

    // Get recent accounts (last 7 days)
    const [recentAccountCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(accounts)
      .where(and(
        eq(accounts.tenantId, tenantId),
        sql`${accounts.createdAt} >= NOW() - INTERVAL '7 days'`
      ));

    // Get registered vs imported consumers
    const registrationStats = await db
      .select({
        isRegistered: consumers.isRegistered,
        count: sql<number>`count(*)::int`
      })
      .from(consumers)
      .where(eq(consumers.tenantId, tenantId))
      .groupBy(consumers.isRegistered);

    const stats = {
      totalConsumers: consumerCount?.count || 0,
      totalAccounts: accountCount?.count || 0,
      activeAccounts: activeAccountCount?.count || 0,
      totalBalanceCents: Number(totalBalance?.sum || 0),
      totalFolders: folderCount?.count || 0,
      recentAccounts: recentAccountCount?.count || 0,
      statusBreakdown: statusBreakdown || [],
      registeredConsumers: registrationStats.find(s => s.isRegistered === true)?.count || 0,
      importedConsumers: registrationStats.find(s => s.isRegistered === false)?.count || 0,
    };

    res.status(200).json(stats);
  } catch (error: any) {
    console.error('Stats API error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch statistics',
      message: error.message 
    });
  }
}

export default withAuth(handler);