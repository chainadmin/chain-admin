import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { withAuth, AuthenticatedRequest } from '../_lib/auth';
import { tenants } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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

    // Parse the request body to get the file data
    // Note: In production, you might need to use a library like formidable or multer
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      res.status(400).json({ error: 'Expected multipart/form-data' });
      return;
    }

    // For Vercel, we need to handle the file upload differently
    // The file should be sent as base64 or use a library to parse multipart
    // For now, let's assume the client sends the file as base64
    const { file, filename, mimeType } = req.body;
    
    if (!file || !filename) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Convert base64 to buffer
    const buffer = Buffer.from(file, 'base64');
    
    // Upload to Supabase Storage
    const fileName = `${tenantId}_${Date.now()}_${filename}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('tenant-logos')
      .upload(fileName, buffer, {
        contentType: mimeType || 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      res.status(500).json({ error: 'Failed to upload logo' });
      return;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('tenant-logos')
      .getPublicUrl(fileName);

    // Update tenant record with logo URL
    await db
      .update(tenants)
      .set({ 
        brand: {
          logoUrl: publicUrl
        }
      })
      .where(eq(tenants.id, tenantId));

    res.status(200).json({
      success: true,
      url: publicUrl,
      message: 'Logo uploaded successfully'
    });
  } catch (error: any) {
    console.error('Logo upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload logo',
      message: error.message 
    });
  }
}

export default withAuth(handler);