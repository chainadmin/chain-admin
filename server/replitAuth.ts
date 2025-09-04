import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  try {
    app.set("trust proxy", 1);
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());

    const config = await getOidcConfig();

    const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    try {
      // In development mode, bypass authentication and show helpful message
      if (req.hostname === 'localhost' || req.hostname.includes('replit.dev')) {
        return res.status(200).json({
          message: "Development mode: Agency login will be available once deployed to chainsoftwaregroup.com",
          adminAccess: "Access admin panel directly at /admin",
          deploymentReady: true
        });
      }
      
      // Check if this is the production domain
      if (req.hostname === 'chainsoftwaregroup.com' || req.hostname === 'www.chainsoftwaregroup.com') {
        // Production domain - proceed with authentication
      }
      
      // Get available domains from environment
      const domainsEnv = process.env.REPLIT_DOMAINS;
      if (!domainsEnv) {
        console.error("REPLIT_DOMAINS environment variable not set");
        return res.status(500).json({ 
          message: "Authentication configuration error",
          debug: "REPLIT_DOMAINS not configured"
        });
      }
      
      const domains = domainsEnv.split(",");
      const strategyDomain = domains[0]; // Use the first available domain
      
      console.log(`Login attempt from ${req.hostname}, using strategy: replitauth:${strategyDomain}`);
      
      passport.authenticate(`replitauth:${strategyDomain}`, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    } catch (error) {
      console.error("Login endpoint error:", error);
      res.status(500).json({ 
        message: "Authentication setup failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/callback", (req, res, next) => {
    try {
      // For custom domains, use the available replit.dev strategy
      const domainsEnv = process.env.REPLIT_DOMAINS;
      if (!domainsEnv) {
        console.error("REPLIT_DOMAINS environment variable not set");
        return res.status(500).json({ message: "Authentication configuration error" });
      }
      
      const domains = domainsEnv.split(",");
      const strategyDomain = domains[0]; // Use the first available domain
      
      console.log(`Callback from ${req.hostname}, using strategy: replitauth:${strategyDomain}`);
      
      passport.authenticate(`replitauth:${strategyDomain}`, {
        successReturnToOrRedirect: "/",
        failureRedirect: "/api/login",
      })(req, res, next);
    } catch (error) {
      console.error("Callback endpoint error:", error);
      res.status(500).json({ 
        message: "Authentication callback failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
  
  } catch (error) {
    console.error("Authentication setup failed:", error);
    throw error;
  }
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
