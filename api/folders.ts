import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';
import { withAuth, AuthenticatedRequest } from './_lib/auth';
import { folders, accounts } from './_lib/schema';
import { eq, and } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const db = getDb();
    
    // Get tenant ID from JWT token
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.headers.cookie?.split(';').find(c => c.trim().startsWith('authToken='))?.split('=')[1];
    
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

    if (req.method === 'GET') {
      // Get all folders for the tenant
      const tenantFolders = await db
        .select()
        .from(folders)
        .where(eq(folders.tenantId, tenantId))
        .orderBy(folders.isDefault, folders.name);

      res.status(200).json(tenantFolders);
    } else if (req.method === 'POST') {
      // Create a new folder
      const { name, color } = req.body;

      if (!name) {
        res.status(400).json({ error: 'Folder name is required' });
        return;
      }

      const [newFolder] = await db
        .insert(folders)
        .values({
          tenantId,
          name,
          color: color || '#3B82F6',
          isDefault: false,
        })
        .returning();

      res.status(201).json(newFolder);
    } else if (req.method === 'DELETE') {
      // Delete a folder - expects /api/folders?id=<folderId>
      const folderId = req.query.id as string;

      if (!folderId) {
        res.status(400).json({ error: 'Folder ID is required' });
        return;
      }

      // Check if folder exists and belongs to tenant
      const [folder] = await db
        .select()
        .from(folders)
        .where(and(
          eq(folders.id, folderId),
          eq(folders.tenantId, tenantId)
        ))
        .limit(1);

      if (!folder) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }

      if (folder.isDefault) {
        res.status(400).json({ error: 'Cannot delete default folder' });
        return;
      }

      // Find default folder to move accounts to
      const [defaultFolder] = await db
        .select()
        .from(folders)
        .where(and(
          eq(folders.tenantId, tenantId),
          eq(folders.isDefault, true)
        ))
        .limit(1);

      // Move all accounts from this folder to default folder
      if (defaultFolder) {
        await db
          .update(accounts)
          .set({ folderId: defaultFolder.id })
          .where(eq(accounts.folderId, folderId));
      }

      // Delete the folder
      await db
        .delete(folders)
        .where(eq(folders.id, folderId));

      res.status(200).json({ success: true, message: 'Folder deleted successfully' });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Folders API error:', error);
    res.status(500).json({ 
      error: 'Failed to process folder request',
      message: error.message 
    });
  }
}

export default withAuth(handler);