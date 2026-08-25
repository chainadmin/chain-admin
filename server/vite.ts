import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

const chiamoTitles: Record<string, string> = {
  "/": "Chiamo Connect | Business Phone & Communications", "/features": "Features | Chiamo Connect", "/pricing": "Pricing | Chiamo Connect",
  "/get-started": "Get Started | Chiamo Connect", "/login": "Sign In | Chiamo Connect", "/agency-login": "Sign In | Chiamo Connect",
  "/dashboard": "Dashboard | Chiamo Connect", "/phone": "Phone | Chiamo Connect", "/messages": "Messages | Chiamo Connect",
  "/calls": "Call Logs | Chiamo Connect", "/call-logs": "Call Logs | Chiamo Connect", "/voicemail": "Voicemail | Chiamo Connect",
  "/recordings": "Recordings | Chiamo Connect", "/numbers": "Numbers | Chiamo Connect", "/users": "Users | Chiamo Connect",
  "/settings": "Settings | Chiamo Connect", "/plan-billing": "Plan & Billing | Chiamo Connect", "/more-services": "More Services | Chiamo Connect",
};

function applyHostnameMetadata(template: string, hostname: string, pathname: string) {
  const domain = (process.env.CHIAMO_DOMAIN || "chiamoconnect.com").toLowerCase();
  const appDomain = (process.env.CHIAMO_APP_DOMAIN || domain).toLowerCase();
  const host = hostname.split(":")[0].toLowerCase();
  if (host !== domain && host !== appDomain && !host.endsWith(`.${domain}`)) return template;
  const path = pathname !== "/" ? pathname.replace(/\/$/, "") : pathname;
  const title = chiamoTitles[path] || "Chiamo Connect";
  const description = "Managed business phone, calling, messaging, voicemail, and communications from Chiamo Connect.";
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace('<link rel="manifest" href="/manifest.json" />', '<link rel="manifest" href="/chiamo-manifest.json" />')
    .replace('<meta name="theme-color" content="#2563eb" />', '<meta name="theme-color" content="#062d31" />')
    .replace('<meta name="apple-mobile-web-app-title" content="Softphone" />', '<meta name="apple-mobile-web-app-title" content="Chiamo Connect" />')
    .replace('<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />', `<link rel="icon" type="image/svg+xml" href="/chiamo-favicon.svg" />\n    <meta name="description" content="${description}" />\n    <meta property="og:site_name" content="Chiamo Connect" />\n    <meta property="og:title" content="${title}" />\n    <meta property="og:description" content="${description}" />`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = applyHostnameMetadata(template, req.hostname, req.path);
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, { index: false }));

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      res.status(200).type("html").send(applyHostnameMetadata(template, req.hostname, req.path));
    } catch (error) {
      next(error);
    }
  });
}
