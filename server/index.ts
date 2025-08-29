// index.ts (Express + Supabase, TypeScript)
import express, { Request, Response } from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Server-side Supabase client (SERVICE ROLE key -> server only)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// READ: GET /api/db/health -> list a few tenants
app.get("/api/db/health", async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("tenants")
    .select("id,name,slug,created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, tenants: data ?? [] });
});

// WRITE: POST /api/db/health -> insert a sample tenant
app.post("/api/db/health", async (_req: Request, res: Response) => {
  const slug = "test-" + Math.random().toString(36).slice(2, 7);
  const { data, error } = await supabase
    .from("tenants")
    .insert({ name: "Test Agency", slug })
    .select("id,slug")
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, inserted: data });
});
const PORT = Number(process.env.PORT) || 8080; // use Replit's port
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on port ${PORT}`);
});