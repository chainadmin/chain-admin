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

// For Vercel serverless deployment
export default async function handler(req: any, res: any) {
  try {
    await registerRoutes(app);
    
    // For serverless, we need to handle the request directly through the Express app
    return app(req, res);
  } catch (error) {
    console.error('Serverless handler error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// For local development
async function main() {
  const server = await createServer();
  const PORT = Number(process.env.PORT) || 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
}

// Only run main() in development
if (process.env.NODE_ENV !== "production") {
  main();
}