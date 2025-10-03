import express from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { execSync } from "child_process";

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

// Run database migration in production
async function ensureDatabaseSchema() {
  const isProduction = process.env.NODE_ENV === "production";
  
  if (isProduction && process.env.DATABASE_URL) {
    try {
      log("Checking database schema...");
      execSync("npx drizzle-kit push --force", { 
        stdio: "inherit",
        env: { ...process.env }
      });
      log("Database schema synchronized successfully");
    } catch (error) {
      console.error("Database migration warning:", error);
    }
  }
}

// Main function to start the server
async function main() {
  await ensureDatabaseSchema();
  const server = await createServer();
  const PORT = Number(process.env.PORT) || 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
}

// Start the server in both development and production
main();