import { activeBrand, detectBrand } from "@/config/brands";

const chiamoTitles: Record<string, string> = {
  "/": "Chiamo Connect | Business Phone & Communications",
  "/features": "Features | Chiamo Connect",
  "/pricing": "Pricing | Chiamo Connect",
  "/get-started": "Get Started | Chiamo Connect",
  "/login": "Sign In | Chiamo Connect",
  "/agency-login": "Sign In | Chiamo Connect",
  "/dashboard": "Dashboard | Chiamo Connect",
  "/phone": "Phone | Chiamo Connect",
  "/messages": "Messages | Chiamo Connect",
  "/calls": "Call Logs | Chiamo Connect",
  "/call-logs": "Call Logs | Chiamo Connect",
  "/voicemail": "Voicemail | Chiamo Connect",
  "/auto-dialer": "Auto Dialer | Chain",
  "/help": "How to Use the Phone | Chiamo Connect",
  "/recordings": "Recordings | Chiamo Connect",
  "/numbers": "Numbers | Chiamo Connect",
  "/users": "Users | Chiamo Connect",
  "/settings": "Settings | Chiamo Connect",
  "/plan-billing": "Plan & Billing | Chiamo Connect",
  "/more-services": "More Services | Chiamo Connect",
};

function meta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function link(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

/** Applies hostname-aware metadata before React renders, without changing Chain defaults. */
export function applyProductMetadata(pathname = window.location.pathname) {
  if (detectBrand() !== "chiamo") return;
  const brand = activeBrand();
  const path = pathname !== "/" ? pathname.replace(/\/$/, "") : pathname;
  const title = chiamoTitles[path] || "Chiamo Connect";
  const description = "Managed business phone, calling, messaging, voicemail, and communications from Chiamo Connect.";
  const canonical = `${window.location.origin}${path}`;

  document.title = title;
  document.documentElement.lang = "en";
  meta("name", "application-name", brand.name);
  meta("name", "apple-mobile-web-app-title", brand.name);
  meta("name", "description", description);
  meta("name", "theme-color", brand.colors.secondary);
  meta("property", "og:site_name", brand.name);
  meta("property", "og:title", title);
  meta("property", "og:description", description);
  meta("property", "og:type", "website");
  meta("property", "og:url", canonical);
  meta("name", "twitter:card", "summary");
  meta("name", "twitter:title", title);
  meta("name", "twitter:description", description);
  link("icon", brand.favicon);
  link("apple-touch-icon", brand.favicon);
  link("manifest", "/chiamo-manifest.json");
  link("canonical", canonical);
}
