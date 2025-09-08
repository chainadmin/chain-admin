import { Request, Response, NextFunction } from "express";
import { getAgencySlugFromRequest } from "@shared/utils/subdomain";

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
    }
  }
}

export function subdomainMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Get hostname from request
    const hostname = req.get('host') || req.hostname;
    const pathname = req.path;

    // Extract agency slug from subdomain or path
    const agencySlug = getAgencySlugFromRequest(hostname, pathname);

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