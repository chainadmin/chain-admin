import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { tenants, tenantSettings } from '../../shared/schema';
import { eq } from 'drizzle-orm';

async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('[agency-branding] Starting request for slug:', req.query.slug);
    
    // Get agency slug from query parameter
    const { slug } = req.query;
    
    if (!slug || typeof slug !== 'string') {
      console.log('[agency-branding] Invalid or missing slug');
      res.status(400).json({ error: 'Agency slug is required' });
      return;
    }
    
    console.log('[agency-branding] Getting database connection...');
    const db = await getDb();
    console.log('[agency-branding] Database connection obtained');

    // Get tenant information
    console.log('[agency-branding] Querying tenant with slug:', slug);
    const [tenant] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        brand: tenants.brand,
        isActive: tenants.isActive,
      })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    console.log('[agency-branding] Tenant query completed:', tenant ? 'found' : 'not found');

    if (!tenant) {
      res.status(404).json({ error: 'Agency not found' });
      return;
    }

    if (!tenant.isActive) {
      res.status(403).json({ error: 'Agency is not active' });
      return;
    }

    // Get tenant settings for additional branding
    console.log('[agency-branding] Querying tenant settings for tenant ID:', tenant.id);
    const [settings] = await db
      .select({
        customBranding: tenantSettings.customBranding,
        contactEmail: tenantSettings.contactEmail,
        contactPhone: tenantSettings.contactPhone,
        privacyPolicy: tenantSettings.privacyPolicy,
        termsOfService: tenantSettings.termsOfService,
      })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenant.id))
      .limit(1);
    console.log('[agency-branding] Tenant settings query completed');

    // Combine branding information
    const customBranding = settings?.customBranding as any;
    const branding = {
      agencyName: tenant.name,
      agencySlug: tenant.slug,
      logoUrl: customBranding?.logoUrl || (tenant.brand as any)?.logoUrl || null,
      primaryColor: customBranding?.primaryColor || '#3B82F6',
      secondaryColor: customBranding?.secondaryColor || '#1E40AF',
      contactEmail: settings?.contactEmail || null,
      contactPhone: settings?.contactPhone || null,
      hasPrivacyPolicy: !!settings?.privacyPolicy,
      hasTermsOfService: !!settings?.termsOfService,
      privacyPolicy: settings?.privacyPolicy || null,
      termsOfService: settings?.termsOfService || null,
    };

    console.log('[agency-branding] Sending successful response');
    res.status(200).json(branding);
  } catch (error: any) {
    console.error('[agency-branding] API error:', error);
    console.error('[agency-branding] Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to fetch agency branding',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
}

export default handler;
