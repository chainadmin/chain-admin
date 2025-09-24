import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './db.js';
import { platformUsers, users } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthenticatedRequest extends VercelRequest {
  user?: any;
  platformUser?: any;
}

export interface ConsumerAuthContext {
  consumerId: string;
  email: string;
  tenantId?: string;
  tenantSlug?: string;
}

interface ConsumerAuthError {
  status: number;
  message: string;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, part) => {
    const [name, ...rest] = part.trim().split('=');
    if (name) {
      acc[name] = decodeURIComponent(rest.join('=') || '');
    }
    return acc;
  }, {} as Record<string, string>);
}

function extractBearerToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim() || null;
  }

  const cookies = parseCookies(req.headers.cookie);
  if (cookies.consumerToken) {
    return cookies.consumerToken;
  }

  return null;
}

export function verifyConsumerAuth(
  req: VercelRequest,
): { consumer: ConsumerAuthContext } | { error: ConsumerAuthError } {
  const token = extractBearerToken(req);

  if (!token) {
    return { error: { status: 401, message: 'No consumer token provided' } };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (decoded?.type !== 'consumer' || !decoded?.consumerId || !decoded?.email) {
      return { error: { status: 401, message: 'Invalid consumer token' } };
    }

    return {
      consumer: {
        consumerId: decoded.consumerId,
        email: decoded.email,
        tenantId: decoded.tenantId,
        tenantSlug: decoded.tenantSlug,
      },
    };
  } catch (error) {
    console.error('Consumer auth verification error:', error);
    return { error: { status: 401, message: 'Invalid consumer token' } };
  }
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