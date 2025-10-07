import express from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runMigrations } from "./migrations";

const app = express();

async function createServer() {
  const server = await registerRoutes(app);

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    serveStatic(app);
  } else {
    await setupVite(app, server);
  }

  return server;
}

// Main function to start the server
async function main() {
  // Validate required environment variables at startup
  const requiredEnvVars = [
    'POSTMARK_SERVER_TOKEN',
    'DATABASE_URL',
    'JWT_SECRET'
  ];
  
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ STARTUP FAILED - Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nThe application cannot start without these variables.');
    process.exit(1);
  }
  
  // Optional but recommended
  if (!process.env.POSTMARK_ACCOUNT_TOKEN) {
    console.warn('⚠️  POSTMARK_ACCOUNT_TOKEN not set - Admin features for creating Postmark servers will be disabled');
  }
  
  console.log('✅ All required environment variables are present');
  
  // Run database migrations automatically on startup (Railway deployments)
  await runMigrations();
  
  const server = await createServer();
  const PORT = Number(process.env.PORT) || 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
}

// Start the server in both development and production
main();