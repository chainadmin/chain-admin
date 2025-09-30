import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { getDb } from '../_lib/db';
import { users, platformUsers, tenants } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

async function handler(req: VercelRequest, res: VercelResponse) {
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
    // Get token from Authorization header or cookie
    const token = req.headers.authorization?.replace('Bearer ', '') ||
                  req.cookies?.authToken;

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Get user from database
    const db = await getDb();

    // Get user and platform user info
    const userInfo = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        platformUserId: platformUsers.id,
        role: platformUsers.role,
        tenantId: platformUsers.tenantId,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
      })
      .from(users)
      .leftJoin(platformUsers, eq(users.id, platformUsers.userId))
      .leftJoin(tenants, eq(platformUsers.tenantId, tenants.id))
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (!userInfo.length) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userInfo[0];
    
    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenantName,
      tenantSlug: user.tenantSlug,
    });
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    
    console.error('Auth user API error:', error);
    res.status(500).json({
      error: 'Failed to get user info',
      message: error.message
    });
  }
}

export default handler;