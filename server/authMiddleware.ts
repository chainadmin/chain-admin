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
      
      // Attach user info from JWT
      req.user = {
        id: decoded.userId,
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        tenantSlug: decoded.tenantSlug,
        isJwtAuth: true,
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