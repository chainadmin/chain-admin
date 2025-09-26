import type { VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import type { AuthenticatedRequest } from '../_lib/auth.js';
import { folders, accounts } from '../_lib/schema.js';
import { eq, and } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../_lib/auth.js';

type NormalizedBody = Record<string, unknown>;

function normalizeBody(req: AuthenticatedRequest): NormalizedBody {
  const { body } = req;

  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as NormalizedBody;
    } catch (error) {
      console.error('Failed to parse request body for folder delete handler', error);
      return {};
    }
  }

  return body as NormalizedBody;
}

function resolveFolderId(
  req: AuthenticatedRequest,
  override?: unknown,
): string | undefined {
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }

  if (req.query) {
    const { folderId, id } = req.query;

    if (typeof folderId === 'string' && folderId.trim().length > 0) {
      return folderId.trim();
    }

    if (Array.isArray(folderId) && folderId.length > 0 && folderId[0]?.trim()) {
      return folderId[0].trim();
    }

    if (typeof id === 'string' && id.trim().length > 0) {
      return id.trim();
    }

    if (Array.isArray(id) && id.length > 0 && id[0]?.trim()) {
      return id[0].trim();
    }
  }

  const normalizedBody = normalizeBody(req);
  const bodyFolderId = normalizedBody.folderId ?? normalizedBody.id;

  if (typeof bodyFolderId === 'string' && bodyFolderId.trim().length > 0) {
    return bodyFolderId.trim();
  }

  if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const segments = url.pathname.split('/').filter(Boolean);
      const deleteIndex = segments.lastIndexOf('delete');

      if (deleteIndex > 0) {
        const possibleId = segments[deleteIndex - 1];
        if (possibleId?.trim()) {
          return possibleId.trim();
        }
      }
    } catch (error) {
      console.error('Failed to parse request URL for folder delete handler', error);
    }
  }

  return undefined;
}

function extractToken(req: AuthenticatedRequest): string | undefined {
  const headerToken = req.headers.authorization?.replace('Bearer ', '');
  if (headerToken) {
    return headerToken;
  }

  const rawCookies = req.headers.cookie;
  if (!rawCookies) {
    return undefined;
  }

  const cookies = rawCookies.split(';').map((cookie) => cookie.trim());
  const authCookie = cookies.find((cookie) => cookie.startsWith('authToken='));
  return authCookie?.split('=')[1];
}

export async function handleFolderDelete(
  req: AuthenticatedRequest,
  res: VercelResponse,
  options: { folderIdOverride?: unknown } = {},
): Promise<void> {
  try {
    const folderId = resolveFolderId(req, options.folderIdOverride);

    if (!folderId) {
      res.status(400).json({ error: 'Folder ID is required' });
      return;
    }

    const token = extractToken(req);

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const tenantId = decoded?.tenantId as string | undefined;

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
    console.error('Folder delete handler error:', error);
    res.status(500).json({
      error: 'Failed to delete folder',
      message: error?.message ?? 'Unknown error',
    });
  }
}
