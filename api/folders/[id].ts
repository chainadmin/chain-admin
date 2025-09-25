import type { VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from '../_lib/auth.js';
import { folders, accounts } from '../_lib/schema.js';
import { eq, and } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

function resolveFolderId(req: AuthenticatedRequest) {
  const { id } = req.query ?? {};
  if (typeof id === 'string' && id) {
    return id;
  }
  if (Array.isArray(id) && id.length > 0 && id[0]) {
    return id[0];
  }
  if (req.url) {
    const url = new URL(req.url, 'http://localhost');
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1];
    }
  }
  return undefined;
}

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const method = (req.method ?? '').toUpperCase();

  if (method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const folderId = resolveFolderId(req);

    if (!folderId) {
      res.status(400).json({ error: 'Folder ID is required' });
      return;
    }

    const token =
      req.headers.authorization?.replace('Bearer ', '') ||
      req.headers.cookie?.split(';').find((c) => c.trim().startsWith('authToken='))?.split('=')[1];

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

    const db = await getDb();

    const [folder] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.tenantId, tenantId)))
      .limit(1);

    if (!folder) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    if (folder.isDefault) {
      res.status(400).json({ error: 'Cannot delete default folder' });
      return;
    }

    const [defaultFolder] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.tenantId, tenantId), eq(folders.isDefault, true)))
      .limit(1);

    if (defaultFolder) {
      await db
        .update(accounts)
        .set({ folderId: defaultFolder.id })
        .where(eq(accounts.folderId, folderId));
    }

    await db.delete(folders).where(eq(folders.id, folderId));

    res.status(200).json({ success: true, message: 'Folder deleted successfully' });
  } catch (error: any) {
    console.error('Folder delete API error:', error);
    res.status(500).json({
      error: 'Failed to delete folder',
      message: error.message,
    });
  }
}

export default withAuth(handler);
