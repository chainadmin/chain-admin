import { Request, Response, NextFunction } from "express";
import { getAgencySlugFromRequest } from "@shared/utils/subdomain";
import { IStorage } from "../storage";

// Extend Express Request to include agency context
declare global {
  namespace Express {
    interface Request {
      agencySlug?: string;
      agencyContext?: {
        slug: string;
        tenantId: string;
        name: string;
      };
      storage?: IStorage;
    }
  }
}

export function subdomainMiddleware(req: Request, res: Response, next: NextFunction) {
  async function processRequest() {
    try {
      // Get hostname from request (remove port if present)
      const hostname = (req.get('host') || req.hostname).split(':')[0];
      const pathname = req.path;

      // First, try to extract agency slug from subdomain or path
      let agencySlug = getAgencySlugFromRequest(hostname, pathname);

      // If no slug found from subdomain/path, check if hostname is a custom domain
      if (!agencySlug && req.storage && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
        try {
          const tenant = await req.storage.getTenantByCustomDomain(hostname);
          if (tenant) {
            agencySlug = tenant.slug;
          }
        } catch (error) {
          console.error('Error looking up custom domain:', error);
        }
      }

      if (agencySlug) {
        // Store in request for use by routes
        req.agencySlug = agencySlug;
        
        // Note: We'll populate full agencyContext in auth middleware
        // after validating the agency exists in database
      }

      next();
    } catch (error) {
      console.error('Subdomain middleware error:', error);
      next();
    }
  }

  processRequest();
}