import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './db';
import { platformUsers, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { getKnownDomainOrigins } from '@shared/utils/baseUrl';
import { isOriginOnKnownDomain } from '@shared/utils/domains';

export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
    const db = await getDb();
    
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

function appendVaryHeader(res: VercelResponse, value: string) {
  const existing = res.getHeader('Vary');

  if (!existing) {
    res.setHeader('Vary', value);
    return;
  }

  const values = Array.isArray(existing) ? existing.join(', ') : String(existing);

  if (!values.split(/,\s*/).includes(value)) {
    res.setHeader('Vary', `${values}, ${value}`);
  }
}

function applyCorsHeaders(req: AuthenticatedRequest, res: VercelResponse) {
  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:3000',
    ...(process.env.REPLIT_DOMAINS ? [process.env.REPLIT_DOMAINS] : []),
    ...getKnownDomainOrigins(),
  ]);

  const origin = req.headers.origin as string | undefined;

  let isAllowed = true;

  if (origin) {
    isAllowed =
      allowedOrigins.has(origin) ||
      origin.includes('vercel.app') ||
      origin.includes('vercel.sh') ||
      origin.includes('replit.dev') ||
      origin.includes('replit.app') ||
      origin.includes('repl.co') ||
      origin.includes('railway.app') ||
      origin.includes('railway.internal') ||
      isOriginOnKnownDomain(origin);
  }

  appendVaryHeader(res, 'Origin');

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export function withAuth(handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>) {
  return async (req: AuthenticatedRequest, res: VercelResponse) => {
    applyCorsHeaders(req, res);

    // Allow CORS preflight requests to proceed without authentication
    if (req.method?.toUpperCase() === 'OPTIONS') {
      res.status(200).end();
      return;
    }

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