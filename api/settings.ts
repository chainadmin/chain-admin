import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from './_lib/auth.js';
import { tenantSettings, tenants } from './_lib/schema.js';
import { eq, and } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Mask sensitive data before returning
  const maskSensitiveData = (settings: any) => {
    if (!settings) return settings;
    const masked = { ...settings };
    // Never return the actual API key to frontend
    if (masked.merchantApiKey) {
      masked.merchantApiKey = masked.merchantApiKey ? '****' + masked.merchantApiKey.slice(-4) : null;
    }
    return masked;
  };

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
      // Get tenant settings
      const [settings] = await db
        .select()
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId))
        .limit(1);

      // If no settings exist, create default settings
      if (!settings) {
        const [newSettings] = await db
          .insert(tenantSettings)
          .values({
            tenantId,
            showPaymentPlans: true,
            showDocuments: true,
            allowSettlementRequests: true,
            smsThrottleLimit: 10,
            customBranding: {},
            consumerPortalSettings: {},
          })
          .returning();

        res.status(200).json(maskSensitiveData(newSettings));
      } else {
        res.status(200).json(maskSensitiveData(settings));
      }
    } else if (req.method === 'PUT' || req.method === 'PATCH') {
      // Update tenant settings
      const updates = req.body;

      // Check if settings exist
      const [existingSettings] = await db
        .select()
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId))
        .limit(1);

      if (existingSettings) {
        // Build update object with only provided fields
        const updateData: any = {};
        
        // Update only fields that are provided
        if (updates.showPaymentPlans !== undefined) updateData.showPaymentPlans = updates.showPaymentPlans;
        if (updates.showDocuments !== undefined) updateData.showDocuments = updates.showDocuments;
        if (updates.allowSettlementRequests !== undefined) updateData.allowSettlementRequests = updates.allowSettlementRequests;
        if (updates.privacyPolicy !== undefined) updateData.privacyPolicy = updates.privacyPolicy;
        if (updates.termsOfService !== undefined) updateData.termsOfService = updates.termsOfService;
        if (updates.contactEmail !== undefined) updateData.contactEmail = updates.contactEmail;
        if (updates.contactPhone !== undefined) updateData.contactPhone = updates.contactPhone;
        if (updates.smsThrottleLimit !== undefined) updateData.smsThrottleLimit = updates.smsThrottleLimit;
        if (updates.customBranding !== undefined) updateData.customBranding = updates.customBranding;
        if (updates.consumerPortalSettings !== undefined) updateData.consumerPortalSettings = updates.consumerPortalSettings;
        // Payment processor fields
        if (updates.merchantProvider !== undefined) updateData.merchantProvider = updates.merchantProvider;
        if (updates.merchantAccountId !== undefined) updateData.merchantAccountId = updates.merchantAccountId;
        if (updates.merchantApiKey !== undefined) updateData.merchantApiKey = updates.merchantApiKey;
        if (updates.merchantName !== undefined) updateData.merchantName = updates.merchantName;
        if (updates.enableOnlinePayments !== undefined) updateData.enableOnlinePayments = updates.enableOnlinePayments;

        const [updatedSettings] = await db
          .update(tenantSettings)
          .set(updateData)
          .where(eq(tenantSettings.tenantId, tenantId))
          .returning();

        res.status(200).json(maskSensitiveData(updatedSettings));
      } else {
        // Create new settings
        const [newSettings] = await db
          .insert(tenantSettings)
          .values({
            tenantId,
            showPaymentPlans: updates.showPaymentPlans ?? true,
            showDocuments: updates.showDocuments ?? true,
            allowSettlementRequests: updates.allowSettlementRequests ?? true,
            privacyPolicy: updates.privacyPolicy || null,
            termsOfService: updates.termsOfService || null,
            contactEmail: updates.contactEmail || null,
            contactPhone: updates.contactPhone || null,
            smsThrottleLimit: updates.smsThrottleLimit || 10,
            customBranding: updates.customBranding || {},
            consumerPortalSettings: updates.consumerPortalSettings || {},
            // Payment processor fields
            merchantProvider: updates.merchantProvider || null,
            merchantAccountId: updates.merchantAccountId || null,
            merchantApiKey: updates.merchantApiKey || null,
            merchantName: updates.merchantName || null,
            enableOnlinePayments: updates.enableOnlinePayments || false,
          })
          .returning();

        res.status(200).json(maskSensitiveData(newSettings));
      }

      // If updating brand settings (logo), update tenant table
      if (updates.logoUrl) {
        await db
          .update(tenants)
          .set({
            brand: {
              logoUrl: updates.logoUrl,
            },
          })
          .where(eq(tenants.id, tenantId));
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Settings API error:', error);
    res.status(500).json({ 
      error: 'Failed to process settings request',
      message: error.message 
    });
  }
}

export default withAuth(handler);