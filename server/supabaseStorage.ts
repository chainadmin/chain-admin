import { StorageClient } from '@supabase/storage-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials not configured. Logo upload will not work.');
}

const storageClient = new StorageClient(`${SUPABASE_URL}/storage/v1`, {
  apikey: SUPABASE_ANON_KEY!,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
});

const BUCKET_NAME = 'tenant-logos';

export async function ensureBucketExists() {
  try {
    const { data: buckets } = await storageClient.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);
    
    if (!bucketExists) {
      const { error } = await storageClient.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
      });
      
      if (error && !error.message?.includes('already exists')) {
        console.error('Failed to create bucket:', error);
        throw error;
      }
    }
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
  }
}

export async function uploadLogo(file: Express.Multer.File, tenantId: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase not configured');
    return null;
  }

  try {
    await ensureBucketExists();
    
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${tenantId}_${Date.now()}.${fileExt}`;
    
    const { data, error } = await storageClient
      .from(BUCKET_NAME)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${data.path}`;
    return publicUrl;
  } catch (error) {
    console.error('Error uploading logo:', error);
    return null;
  }
}

export async function deleteLogo(logoUrl: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return false;
  }

  try {
    const urlParts = logoUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    
    const { error } = await storageClient
      .from(BUCKET_NAME)
      .remove([fileName]);

    if (error) {
      console.error('Delete error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting logo:', error);
    return false;
  }
}