import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './db';
import { agencyCredentials, platformUsers, tenants, users } from '../../shared/schema';
import { and, eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { getKnownDomainOrigins } from '@shared/utils/baseUrl';
import { isOriginOnKnownDomain } from '@shared/utils/domains';
import { canAgencyProductAccessPath } from '../../shared/productRouteAccess';

export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthenticatedRequest extends VercelRequest {
  user?: any;
  platformUser?: any;
  authClaims?: any;
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
    req.authClaims = decoded;

    if (!decoded.tenantId) {
      return false;
    }

    const product = decoded.product === undefined ? 'chain' : decoded.product;
    if (product !== 'chain' && product !== 'chiamo') {
      return false;
    }

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, decoded.tenantId))
      .limit(1);
    if (
      !tenant ||
      tenant.isActive !== true ||
      (product === 'chain' && tenant.chainCoreEnabled !== true) ||
      (product === 'chiamo' && tenant.chiamoConnectEnabled !== true)
    ) {
      return false;
    }

    if (decoded.isImpersonation) {
      req.user = {
        id: decoded.userId,
        tenantId: decoded.tenantId,
        role: decoded.role || 'owner',
      };
      req.platformUser = {
        tenantId: decoded.tenantId,
        role: decoded.role || 'owner',
        restrictedServices: [],
      };
      return true;
    }
    if (!decoded.userId) {
      return false;
    }

    const [agencyCredential] = await db
      .select()
      .from(agencyCredentials)
      .where(and(eq(agencyCredentials.id, decoded.userId), eq(agencyCredentials.tenantId, decoded.tenantId)))
      .limit(1);
    if (agencyCredential && agencyCredential.isActive === true) {
      req.user = agencyCredential;
      req.platformUser = {
        tenantId: agencyCredential.tenantId,
        role: agencyCredential.role,
        restrictedServices: agencyCredential.restrictedServices || [],
      };
      return true;
    }
    if (agencyCredential) {
      return false;
    }
    // Older API tokens identify the users row instead of the agency credential.
    // Resolve that identity through an active platform membership and matching
    // active agency credential; never fall back to a user without tenant access.
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);
    
    if (!user || !user.email) {
      return false;
    }

    const [platformUser] = await db
      .select()
      .from(platformUsers)
      .where(and(
        eq(platformUsers.authId, user.id),
        eq(platformUsers.tenantId, decoded.tenantId),
      ))
      .limit(1);
    if (!platformUser || platformUser.isActive !== true) {
      return false;
    }

    const [matchingCredential] = await db
      .select()
      .from(agencyCredentials)
      .where(and(
        eq(agencyCredentials.tenantId, decoded.tenantId),
        eq(agencyCredentials.email, user.email),
      ))
      .limit(1);
    if (!matchingCredential || matchingCredential.isActive !== true) {
      return false;
    }

    req.user = matchingCredential;
    req.platformUser = platformUser;
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
    const product = req.authClaims?.product === 'chiamo' ? 'chiamo' : 'chain';
    if (!canAgencyProductAccessPath(product, req.url || '/')) {
      return res.status(403).json({
        code: 'PRODUCT_ROUTE_FORBIDDEN',
        error: 'This API is not available to the signed-in product.',
      });
    }
    
    return handler(req, res);
  };
}

export function generateToken(
  userId: string,
  tenantId?: string,
  tenantSlug?: string,
  tenantName?: string,
  product: 'chain' | 'chiamo' = 'chain',
): string {
  return jwt.sign(
    { 
      userId, 
      tenantId,
      tenantSlug,
      tenantName,
      product,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}