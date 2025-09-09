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

// Get current user with tenant information
export const getCurrentUser = async (req: any) => {
  if (req.user.isJwtAuth) {
    // For JWT auth, fetch the tenant info
    const tenant = await storage.getTenant(req.user.tenantId);
    return {
      id: req.user.id,
      tenantId: req.user.tenantId,
      tenant: tenant,
      isJwtAuth: true
    };
  } else {
    // For Replit auth, get full user and platform user info
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    const platformUser = await storage.getPlatformUserWithTenant(userId);
    
    return {
      ...user,
      platformUser,
      isReplitAuth: true
    };
  }
};