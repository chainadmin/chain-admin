import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

async function main() {
  // Register API routes FIRST (before static files)
  const server = await registerRoutes(app);
  
  // Serve static files from the built frontend
  const publicPath = path.join(__dirname, "../dist/public");
  
  // Only serve static files for non-API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      // Let API routes handle these
      return next();
    }
    express.static(publicPath)(req, res, next);
  });
  
  // Handle all other non-API routes with index.html (for SPA routing)
  app.get("*", (req, res) => {
    if (req.path.startsWith('/api')) {
      // API route not found
      return res.status(404).json({ error: "API endpoint not found" });
    }
    res.sendFile(path.join(publicPath, "index.html"));
  });
  
  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});