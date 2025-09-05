import express from "express";
import path from "path";
import { registerRoutes } from "./routes.js";

const app = express();

async function main() {
  // Register API routes FIRST
  const server = await registerRoutes(app);
  
  // For production on Railway, serve the built frontend
  // The dist folder structure after build should be dist/public
  const publicPath = path.join(process.cwd(), "dist", "public");
  
  // Only serve static files for non-API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    express.static(publicPath)(req, res, next);
  });
  
  // Handle all other non-API routes with index.html
  app.get("*", (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: "API endpoint not found" });
    }
    res.sendFile(path.join(publicPath, "index.html"));
  });
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});