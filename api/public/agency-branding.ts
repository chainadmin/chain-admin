import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';
import { tenants, tenantSettings } from '../_lib/schema.js';
import { eq } from 'drizzle-orm';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const db = await getDb();
    
    // Get agency slug from query parameter
    const { slug } = req.query;
    
    if (!slug || typeof slug !== 'string') {
      res.status(400).json({ error: 'Agency slug is required' });
      return;
    }

    // Get tenant information
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

    if (!tenant) {
      res.status(404).json({ error: 'Agency not found' });
      return;
    }

    if (!tenant.isActive) {
      res.status(403).json({ error: 'Agency is not active' });
      return;
    }

    // Get tenant settings for additional branding
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

    res.status(200).json(branding);
  } catch (error: any) {
    console.error('Agency branding API error:', error);
    res.status(500).json({ error: 'Failed to fetch agency branding' });
  }
}

export default handler;
