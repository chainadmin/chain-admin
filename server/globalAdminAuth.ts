import jwt from 'jsonwebtoken';

export type GlobalAdminClaims = {
  isAdmin: true;
  type: 'global_admin';
  credentialVersion: number;
};

export function createGlobalAdminToken(secret: string, credentialVersion: number): string {
  return jwt.sign(
    { isAdmin: true, type: 'global_admin', credentialVersion } satisfies GlobalAdminClaims,
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
      && Number.isInteger(decoded.credentialVersion)
      && decoded.credentialVersion > 0
    ) {
      return {
        isAdmin: true,
        type: 'global_admin',
        credentialVersion: decoded.credentialVersion,
      };
    }
  } catch {
    // Invalid, expired, or incorrectly signed tokens are not Global Admin sessions.
  }
  return null;
}

export function validateGlobalAdminPassword(password: string): string | null {
  if (password.length < 14) return 'Password must be at least 14 characters';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must include a number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character';
  return null;
}