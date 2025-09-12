import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './db';
import { platformUsers, users } from './schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production';

export interface AuthenticatedRequest extends VercelRequest {
  user?: any;
  platformUser?: any;
}

export async function verifyAuth(req: AuthenticatedRequest): Promise<boolean> {
  try {
    // Check for token in Authorization header or cookies
    let token = req.headers.authorization?.replace('Bearer ', '');
    
    // If no Authorization header, check cookies
    if (!token && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
      
      token = cookies.authToken;
    }
    
    if (!token) {
      return false;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const db = getDb();
    
    // Get the user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);
    
    if (!user) {
      return false;
    }

    // Get platform user if tenantId is provided
    if (decoded.tenantId) {
      const [platformUser] = await db
        .select()
        .from(platformUsers)
        .where(eq(platformUsers.authId, user.id))
        .limit(1);
      
      req.platformUser = platformUser;
    }

    req.user = user;
    return true;
  } catch (error) {
    console.error('Auth verification error:', error);
    return false;
  }
}

export function withAuth(handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>) {
  return async (req: AuthenticatedRequest, res: VercelResponse) => {
    const isAuthenticated = await verifyAuth(req);
    
    if (!isAuthenticated) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    return handler(req, res);
  };
}

export function generateToken(userId: string, tenantId?: string, tenantSlug?: string, tenantName?: string): string {
  return jwt.sign(
    { 
      userId, 
      tenantId,
      tenantSlug,
      tenantName
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}