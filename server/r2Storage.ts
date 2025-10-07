import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'chain-logos';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g., https://logos.yourdomain.com

// Initialize R2 client (S3-compatible)
let r2Client: S3Client | null = null;

function getR2Client(): S3Client | null {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.warn('Cloudflare R2 credentials not configured. Logo upload will not work.');
    return null;
  }

  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }

  return r2Client;
}

export async function uploadLogo(
  fileBuffer: Buffer,
  tenantId: string,
  mimeType: string
): Promise<{ url: string; path: string } | null> {
  const client = getR2Client();
  if (!client) {
    return null;
  }

  try {
    // Generate file path
    const fileExt = mimeType.split('/')[1] || 'png';
    const fileName = `logos/${tenantId}/${Date.now()}.${fileExt}`;

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000', // Cache for 1 year
    });

    await client.send(command);

    // Generate public URL
    // If R2_PUBLIC_URL is set (custom domain), use it. Otherwise use R2 public bucket URL
    const publicUrl = R2_PUBLIC_URL 
      ? `${R2_PUBLIC_URL}/${fileName}`
      : `https://pub-${R2_ACCOUNT_ID}.r2.dev/${fileName}`;

    return {
      url: publicUrl,
      path: fileName
    };
  } catch (error) {
    console.error('Error uploading logo to R2:', error);
    return null;
  }
}

export async function deleteLogo(logoPath: string): Promise<boolean> {
  const client = getR2Client();
  if (!client) {
    return false;
  }

  try {
    // Extract path from URL if needed
    let path = logoPath;
    if (logoPath.includes('://')) {
      // Extract path from full URL
      const url = new URL(logoPath);
      path = url.pathname.substring(1); // Remove leading slash
    }

    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: path,
    });

    await client.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting logo from R2:', error);
    return false;
  }
}

// Generate a presigned URL for direct client-side upload (optional, for future use)
export async function getUploadPresignedUrl(
  tenantId: string,
  fileName: string,
  mimeType: string
): Promise<string | null> {
  const client = getR2Client();
  if (!client) {
    return null;
  }

  try {
    const fileExt = fileName.split('.').pop() || 'png';
    const key = `logos/${tenantId}/${Date.now()}.${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: mimeType,
    });

    // Generate presigned URL valid for 5 minutes
    const presignedUrl = await getSignedUrl(client, command, { expiresIn: 300 });
    return presignedUrl;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return null;
  }
}
