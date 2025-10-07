import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from '../_lib/auth';
import { tenants, tenantSettings } from '../_lib/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { ObjectStorageService } from '../../server/objectStorage';

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
    const db = await getDb();
    
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

    // Handle base64 image data from frontend
    // Frontend sends FormData but we'll convert to base64
    const { image, filename } = req.body;
    
    if (!image) {
      res.status(400).json({ error: 'No image data provided' });
      return;
    }
    
    // Extract base64 data from data URL if present
    let base64Data = image;
    let mimeType = 'image/png';
    
    if (image.startsWith('data:')) {
      const matches = image.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        base64Data = matches[2];
      }
    }

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(base64Data, 'base64');
    
    // Upload to object storage
    const objectStorageService = new ObjectStorageService();
    const uploadResult = await objectStorageService.uploadLogo(fileBuffer, tenantId, mimeType);
    
    if (!uploadResult) {
      res.status(500).json({ error: 'Failed to upload logo to storage' });
      return;
    }
    
    // Check if settings exist
    const [existingSettings] = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);
    
    if (existingSettings) {
      // Update existing settings with logo URL
      await db
        .update(tenantSettings)
        .set({
          customBranding: {
            ...(existingSettings.customBranding as any || {}),
            logoUrl: uploadResult.url
          }
        })
        .where(eq(tenantSettings.tenantId, tenantId));
    } else {
      // Create new settings with logo
      await db
        .insert(tenantSettings)
        .values({
          tenantId,
          customBranding: {
            logoUrl: uploadResult.url
          }
        });
    }

    res.status(200).json({
      success: true,
      url: uploadResult.url,
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

export default handler;