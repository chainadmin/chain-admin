export type ProductBrand = "chain" | "chiamo";

export interface BrandConfiguration {
  id: ProductBrand;
  name: string;
  legalCompany: string;
  domain: string;
  appDomain: string;
  supportEmail: string;
  logo: string;
  favicon: string;
  colors: { primary: string; secondary: string; accent: string };
  typography: { heading: string; body: string };
}

const env = import.meta.env;

export const brands: Record<ProductBrand, BrandConfiguration> = {
  chain: {
    id: "chain", name: "Chain Software Group", legalCompany: "Chain Software Group LLC",
    domain: "chainsoftwaregroup.com", appDomain: "chainsoftwaregroup.com",
    supportEmail: env.VITE_CHAIN_SUPPORT_EMAIL || "support@chainsoftwaregroup.com",
    logo: "/assets/chain-logo.png", favicon: "/favicon.ico",
    colors: { primary: "#2563eb", secondary: "#0f1f3f", accent: "#38bdf8" },
    typography: { heading: "Inter, sans-serif", body: "Inter, sans-serif" },
  },
  chiamo: {
    id: "chiamo", name: env.VITE_CHIAMO_BRAND_NAME || "Chiamo Connect",
    legalCompany: "Chain Software Group LLC",
    domain: env.VITE_CHIAMO_DOMAIN || "chiamoconnect.com",
    appDomain: env.VITE_CHIAMO_APP_DOMAIN || "chiamoconnect.com",
    supportEmail: env.VITE_CHIAMO_SUPPORT_EMAIL || "support@chainsoftwaregroup.com",
    logo: "/chiamo-logo.svg", favicon: "/chiamo-favicon.svg",
    colors: { primary: "#10b981", secondary: "#082f49", accent: "#67e8f9" },
    typography: { heading: "Inter, sans-serif", body: "Inter, sans-serif" },
  },
};

export function detectBrand(location: Pick<Location, "hostname" | "search"> = window.location): ProductBrand {
  const queryOverride = new URLSearchParams(location.search).get("brand");
  const devOverride = env.VITE_APP_BRAND || env.APP_BRAND;
  if (queryOverride === "chiamo" || devOverride === "chiamo") return "chiamo";
  return location.hostname === brands.chiamo.domain || location.hostname === brands.chiamo.appDomain ||
    location.hostname.endsWith(`.${brands.chiamo.domain}`) ? "chiamo" : "chain";
}

export const activeBrand = () => brands[detectBrand()];
