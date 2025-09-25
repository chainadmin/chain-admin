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
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "No consumer token provided" });
  }
  
  const token = authHeader.slice(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
    
    // Verify this is a consumer token
    if (decoded.type !== 'consumer') {
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
  } catch (error) {
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