import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { storage } from "./storage";

// Combined authentication middleware that supports both JWT and Replit auth
export const authenticateUser: RequestHandler = async (req: any, res, next) => {
  // First check for JWT token in Authorization header
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
      
      // For impersonation sessions, use the role from the JWT token directly
      // For regular JWT auth, fetch from database but use JWT role as fallback
      let userRole = decoded.role || 'owner';
      let restrictedServices: string[] = [];
      
      // Only fetch credentials for non-impersonation sessions
      if (!decoded.isImpersonation) {
        const userCredentials = await storage.getAgencyCredentialsById(decoded.userId);
        if (userCredentials) {
          userRole = userCredentials.role || 'owner';
          restrictedServices = userCredentials.restrictedServices || [];
        }
      }
      
      // Attach user info from JWT
      req.user = {
        id: decoded.userId,
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        tenantSlug: decoded.tenantSlug,
        isJwtAuth: true,
        isImpersonation: decoded.isImpersonation || false,
        role: userRole,
        restrictedServices: restrictedServices,
        claims: {
          sub: decoded.userId
        }
      };
      
      return next();
    } catch (error) {
      // JWT verification failed, continue to check Replit auth
    }
  }
  
  // Check if user is authenticated via Replit (passport)
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    const user = req.user as any;
    
    // Check if Replit token is expired
    if (user.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      if (now > user.expires_at) {
        return res.status(401).json({ message: "Session expired" });
      }
    }
    
    // CRITICAL: Populate tenantId based on the current subdomain/agency
    // This ensures each agency gets their own isolated tenant data
    try {
      const authId = user.claims?.sub || user.id;
      
      // If agencySlug is set from subdomainMiddleware, use it to find the tenant
      if (req.agencySlug) {
        const tenant = await storage.getTenantBySlug(req.agencySlug);
        if (!tenant) {
          return res.status(404).json({ message: "Agency not found" });
        }
        
        // Verify this user has access to this tenant
        const platformUser = await storage.getPlatformUser(authId);
        if (!platformUser || platformUser.tenantId !== tenant.id) {
          // User is authenticated but trying to access a different agency's portal
          return res.status(403).json({ message: "You don't have access to this agency" });
        }
        
        // Attach tenant info to request
        req.user = {
          ...req.user,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          role: platformUser.role,
          id: platformUser.id
        };
        
        console.log('✅ [Auth] User authenticated for tenant:', {
          email: user.email,
          tenantSlug: tenant.slug,
          tenantId: tenant.id
        });
      } else {
        // No agencySlug - fall back to user's primary tenant
        const platformUser = await storage.getPlatformUser(authId);
        if (!platformUser) {
          return res.status(401).json({ message: "User not found" });
        }
        
        req.user = {
          ...req.user,
          tenantId: platformUser.tenantId,
          role: platformUser.role,
          id: platformUser.id
        };
      }
    } catch (error) {
      console.error('❌ [Auth] Error populating tenant context:', error);
      return res.status(500).json({ message: "Authentication error" });
    }
    
    return next();
  }
  
  // No authentication found
  return res.status(401).json({ message: "Unauthorized" });
};

// Consumer authentication middleware
export const authenticateConsumer: RequestHandler = async (req: any, res, next) => {
  const authHeader = req.headers.authorization;
  
  console.log('🔐 Consumer auth check:', {
    hasAuthHeader: !!authHeader,
    startsWithBearer: authHeader?.startsWith('Bearer '),
    path: req.path
  });
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ Consumer auth failed: No bearer token');
    return res.status(401).json({ message: "No consumer token provided" });
  }
  
  const token = authHeader.slice(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
    
    console.log('✅ Consumer token decoded:', {
      type: decoded.type,
      consumerId: decoded.consumerId,
      email: decoded.email,
      tenantSlug: decoded.tenantSlug
    });
    
    // Verify this is a consumer token
    if (decoded.type !== 'consumer') {
      console.log('❌ Consumer auth failed: Invalid token type:', decoded.type);
      return res.status(401).json({ message: "Invalid token type" });
    }
    
    // Attach consumer info to request
    req.consumer = {
      id: decoded.consumerId,
      email: decoded.email,
      tenantId: decoded.tenantId,
      tenantSlug: decoded.tenantSlug
    };
    
    return next();
  } catch (error: any) {
    console.log('❌ Consumer auth failed: Token verification error:', {
      error: error.message,
      name: error.name
    });
    return res.status(401).json({ message: "Invalid consumer token" });
  }
};

// Get current user with tenant information
export const getCurrentUser = async (req: any) => {
  // Check if req.user exists (set by authenticateUser middleware)
  if (!req.user || !req.user.id || !req.user.tenantId) {
    return null;
  }
  
  // JWT auth - fetch the full tenant info including slug
  const tenant = await storage.getTenant(req.user.tenantId);
  return {
    id: req.user.id,
    tenantId: req.user.tenantId,
    tenantSlug: req.user.tenantSlug || tenant?.slug, // Include slug from token or tenant
    tenant: tenant,
    isJwtAuth: true
  };
};

// Middleware to check if email service is enabled
export const requireEmailService: RequestHandler = async (req: any, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.consumer?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    if (tenant.isTrialAccount) {
      return res.status(403).json({ 
        message: "Email service is not available during trial period. Please upgrade to a paid plan to access this feature." 
      });
    }

    if (tenant.emailServiceEnabled === false) {
      return res.status(403).json({ 
        message: "Email service is disabled for your account. Please contact support." 
      });
    }

    next();
  } catch (error) {
    console.error("Error checking email service:", error);
    res.status(500).json({ message: "Error checking service availability" });
  }
};

// Middleware to check if SMS service is enabled
export const requireSmsService: RequestHandler = async (req: any, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.consumer?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    if (tenant.isTrialAccount) {
      return res.status(403).json({ 
        message: "SMS service is not available during trial period. Please upgrade to a paid plan to access this feature." 
      });
    }

    if (tenant.smsServiceEnabled === false) {
      return res.status(403).json({ 
        message: "SMS service is disabled for your account. Please contact support." 
      });
    }

    next();
  } catch (error) {
    console.error("Error checking SMS service:", error);
    res.status(500).json({ message: "Error checking service availability" });
  }
};

// Middleware to check if portal access is enabled
export const requirePortalAccess: RequestHandler = async (req: any, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.consumer?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    if (tenant.isTrialAccount) {
      return res.status(403).json({ 
        message: "Consumer portal access is not available during trial period. Please upgrade to a paid plan to access this feature." 
      });
    }

    if (tenant.portalAccessEnabled === false) {
      return res.status(403).json({ 
        message: "Portal access is disabled for your account. Please contact support." 
      });
    }

    next();
  } catch (error) {
    console.error("Error checking portal access:", error);
    res.status(500).json({ message: "Error checking service availability" });
  }
};

// Middleware to check if payment processing is enabled
export const requirePaymentProcessing: RequestHandler = async (req: any, res, next) => {
  try {
    const tenantId = req.user?.tenantId || req.consumer?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    if (tenant.isTrialAccount) {
      return res.status(403).json({ 
        message: "Payment processing is not available during trial period. Please upgrade to a paid plan to access this feature." 
      });
    }

    if (tenant.paymentProcessingEnabled === false) {
      return res.status(403).json({ 
        message: "Payment processing is disabled for your account. Please contact support." 
      });
    }

    next();
  } catch (error) {
    console.error("Error checking payment processing:", error);
    res.status(500).json({ message: "Error checking service availability" });
  }
};

// Middleware to check if user is an owner (required for billing access)
export const requireOwner: RequestHandler = async (req: any, res, next) => {
  try {
    const userRole = req.user?.role;
    
    // Platform admins and owners can access billing
    if (userRole === 'owner' || userRole === 'platform_admin') {
      return next();
    }
    
    return res.status(403).json({ 
      message: "Access denied. Only account owners can access billing features." 
    });
  } catch (error) {
    console.error("Error checking owner access:", error);
    res.status(500).json({ message: "Error checking access permissions" });
  }
};

// Middleware to check if user has access to a specific service (not in restrictedServices)
export const requireServiceAccess = (serviceName: string): RequestHandler => {
  return async (req: any, res, next) => {
    try {
      const userRole = req.user?.role;
      
      // Platform admins and owners have full access
      if (userRole === 'owner' || userRole === 'platform_admin') {
        return next();
      }
      
      // For non-owners, check if service is restricted
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Fetch the user's credentials to get restrictedServices
      const userCredentials = await storage.getAgencyCredentialsById(userId);
      const restrictedServices = userCredentials?.restrictedServices || [];
      
      if (Array.isArray(restrictedServices) && restrictedServices.includes(serviceName)) {
        return res.status(403).json({ 
          message: `Access denied. You don't have permission to access ${serviceName} features.` 
        });
      }
      
      next();
    } catch (error) {
      console.error(`Error checking service access for ${serviceName}:`, error);
      res.status(500).json({ message: "Error checking access permissions" });
    }
  };
};