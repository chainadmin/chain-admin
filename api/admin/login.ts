import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function valuesMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  // Keep the credentials used by the Express deployment as compatibility
  // defaults; production can rotate them without a deploy via environment vars.
  const adminUsername = process.env.ADMIN_USERNAME || 'ChainAdmin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'W@yp0intsolutions';
  if (!jwtSecret) {
    console.error('Admin login requires JWT_SECRET');
    return res.status(503).json({ success: false, message: 'Administrative login is not configured' });
  }

  const usernameValid = valuesMatch(parsed.data.username.trim(), adminUsername);
  const passwordValid = valuesMatch(parsed.data.password, adminPassword);
  if (!usernameValid || !passwordValid) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const token = jwt.sign({ isAdmin: true, type: 'global_admin' }, jwtSecret, { expiresIn: '24h' });
  return res.status(200).json({ success: true, token, message: 'Admin authenticated successfully' });
}
