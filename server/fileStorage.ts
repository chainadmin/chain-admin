import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

// Storage directory - will be mounted to Railway Volume in production
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'uploads');
const LOGOS_DIR = path.join(STORAGE_DIR, 'logos');

// Initialize storage directories
async function initializeStorage() {
  try {
    if (!existsSync(STORAGE_DIR)) {
      await fs.mkdir(STORAGE_DIR, { recursive: true });
    }
    if (!existsSync(LOGOS_DIR)) {
      await fs.mkdir(LOGOS_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to initialize storage directories:', error);
  }
}

// Initialize on module load
initializeStorage();

export async function uploadLogo(
  fileBuffer: Buffer,
  tenantId: string,
  mimeType: string
): Promise<{ url: string; path: string } | null> {
  try {
    // Ensure tenant directory exists
    const tenantDir = path.join(LOGOS_DIR, tenantId);
    if (!existsSync(tenantDir)) {
      await fs.mkdir(tenantDir, { recursive: true });
    }

    // Generate filename with timestamp
    const fileExt = mimeType.split('/')[1] || 'png';
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = path.join(tenantDir, fileName);
    const relativePath = path.join('logos', tenantId, fileName);

    // Write file to disk
    await fs.writeFile(filePath, fileBuffer);

    // Return URL path (will be served by Express route)
    return {
      url: `/uploads/${relativePath}`,
      path: relativePath
    };
  } catch (error) {
    console.error('Error uploading logo:', error);
    return null;
  }
}

export async function deleteLogo(logoPath: string): Promise<boolean> {
  try {
    // Extract relative path if full URL
    let relativePath = logoPath;
    if (logoPath.startsWith('/uploads/')) {
      relativePath = logoPath.replace('/uploads/', '');
    }

    const fullPath = path.join(STORAGE_DIR, relativePath);
    
    if (existsSync(fullPath)) {
      await fs.unlink(fullPath);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error deleting logo:', error);
    return false;
  }
}

export function getStorageDir() {
  return STORAGE_DIR;
}

export function getLogosDir() {
  return LOGOS_DIR;
}
