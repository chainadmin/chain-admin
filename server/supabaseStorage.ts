import { StorageClient } from '@supabase/storage-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Supabase credentials not configured. Logo upload will not work.');
}

// Use service role key for server-side operations
const storageClient = new StorageClient(`${SUPABASE_URL}/storage/v1`, {
  apikey: SUPABASE_SERVICE_ROLE_KEY!,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
});

const BUCKET_NAME = 'tenant-logos';

// Initialize bucket once at startup
let bucketInitialized = false;

export async function initializeBucket() {
  if (bucketInitialized || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  try {
    // Try to list buckets to check if our bucket exists
    const { data: buckets, error: listError } = await storageClient.listBuckets();
    
    if (listError) {
      console.warn('Could not list buckets (may not have permission):', listError);
      // Assume bucket exists or will be created manually
      bucketInitialized = true;
      return;
    }
    
    const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);
    
    if (!bucketExists) {
      console.log(`Attempting to create bucket '${BUCKET_NAME}'...`);
      const { error } = await storageClient.createBucket(BUCKET_NAME, {
        public: true, // Public read access
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
      });
      
      if (error) {
        if (error.message?.includes('already exists')) {
          console.log(`Bucket '${BUCKET_NAME}' already exists`);
        } else {
          console.warn(`Could not create bucket (may need to be created manually in Supabase dashboard):`, error.message);
        }
      } else {
        console.log(`Bucket '${BUCKET_NAME}' created successfully`);
      }
    } else {
      console.log(`Bucket '${BUCKET_NAME}' already exists`);
    }
    
    bucketInitialized = true;
  } catch (error: any) {
    console.warn('Bucket initialization warning:', error.message || error);
    // Don't fail completely - bucket might exist even if we can't list/create
    bucketInitialized = true;
  }
}

export async function uploadLogo(file: Express.Multer.File, tenantId: string): Promise<{ url: string; path: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase not configured');
    return null;
  }

  try {
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${tenantId}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await storageClient
      .from(BUCKET_NAME)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
        cacheControl: '31536000' // Cache for 1 year
      });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    // Use getPublicUrl for reliable URL generation
    const { data: urlData } = storageClient
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);
    
    return {
      url: urlData.publicUrl,
      path: data.path
    };
  } catch (error) {
    console.error('Error uploading logo:', error);
    return null;
  }
}

export async function deleteLogo(logoPath: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  try {
    // If it's a full URL, extract the path
    let path = logoPath;
    if (logoPath.includes('/storage/v1/object/public/')) {
      const parts = logoPath.split('/storage/v1/object/public/' + BUCKET_NAME + '/');
      path = parts.length > 1 ? parts[1] : logoPath;
    }
    
    const { error } = await storageClient
      .from(BUCKET_NAME)
      .remove([path]);

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

// Initialize bucket on module load
if (process.env.SUPABASE_SKIP_INIT !== '1') {
  initializeBucket().catch(console.error);
}
