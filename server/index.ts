import express from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

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
  const server = await createServer();
  const PORT = Number(process.env.PORT) || 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
}

// Start the server in both development and production
main();