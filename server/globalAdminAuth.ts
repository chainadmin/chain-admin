import jwt from 'jsonwebtoken';

export type GlobalAdminClaims = {
  isAdmin: true;
  type: 'global_admin';
};

export function createGlobalAdminToken(secret: string): string {
  return jwt.sign(
    { isAdmin: true, type: 'global_admin' } satisfies GlobalAdminClaims,
    secret,
    { expiresIn: '24h' },
  );
}

export function verifyGlobalAdminToken(token: string, secret: string): GlobalAdminClaims | null {
  try {
    const decoded = jwt.verify(token, secret);
    if (
      typeof decoded === 'object'
      && decoded !== null
      && decoded.isAdmin === true
      && decoded.type === 'global_admin'
    ) {
      return { isAdmin: true, type: 'global_admin' };
    }
  } catch {
    // Invalid, expired, or incorrectly signed tokens are not Global Admin sessions.
  }
  return null;
}