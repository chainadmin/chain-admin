import type { VercelResponse } from '@vercel/node';
import { withAuth, type AuthenticatedRequest } from '../../_lib/auth.js';
import { handleFolderDelete } from '../_delete-handler.js';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const method = (req.method ?? '').toUpperCase();

  if (method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (method !== 'POST' && method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  await handleFolderDelete(req, res, { folderIdOverride: req.query?.id });
}

export default withAuth(handler);
