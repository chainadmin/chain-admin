import { z } from "zod";

export const BUSINESS_MODULE_IDS = [
  "billing",
  "subscriptions",
  "work_orders",
  "client_crm",
  "messaging_center",
] as const;

export type BusinessModuleId = (typeof BUSINESS_MODULE_IDS)[number];

export const businessModuleIdSchema = z.enum(BUSINESS_MODULE_IDS);

export interface BusinessModuleConfig {
  displayName: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

export const BUSINESS_MODULE_DEFAULT_CONFIG: Record<BusinessModuleId, BusinessModuleConfig> = {
  billing: {
    displayName: "💳 Billing",
    description: "Send invoices and track payments",
  },
  subscriptions: {
    displayName: "🔁 Subscriptions",
    description: "Automate recurring billing",
  },
  work_orders: {
    displayName: "🧾 Work Orders",
    description: "Create and manage service jobs",
  },
  client_crm: {
    displayName: "🧍 Client CRM",
    description: "Track leads and manage customer relationships",
  },
  messaging_center: {
    displayName: "💬 Messaging Center",
    description: "Centralize SMS, email, and notes",
  },
};

export type BusinessModuleConfigMap = Record<BusinessModuleId, BusinessModuleConfig>;

export function mergeBusinessModuleConfigs(
  overrides?: Partial<Record<BusinessModuleId, BusinessModuleConfig>> | null,
): BusinessModuleConfigMap {
  const result = {} as BusinessModuleConfigMap;

  for (const moduleId of BUSINESS_MODULE_IDS) {
    const defaults = BUSINESS_MODULE_DEFAULT_CONFIG[moduleId];
    const override = overrides?.[moduleId];

    result[moduleId] = {
      ...defaults,
      ...(override ? normalizeBusinessModuleConfig(moduleId, override) : {}),
    };
  }

  return result;
}

export function sanitizeBusinessModuleConfigs(
  configs: Partial<Record<string, BusinessModuleConfig>>,
): BusinessModuleConfigMap {
  const normalizedEntries: Partial<Record<BusinessModuleId, BusinessModuleConfig>> = {};

  for (const [key, value] of Object.entries(configs)) {
    if (!BUSINESS_MODULE_IDS.includes(key as BusinessModuleId)) {
      continue;
    }

    const moduleId = key as BusinessModuleId;
    normalizedEntries[moduleId] = normalizeBusinessModuleConfig(moduleId, value);
  }

  return mergeBusinessModuleConfigs(normalizedEntries);
}

function normalizeBusinessModuleConfig(
  moduleId: BusinessModuleId,
  config?: BusinessModuleConfig | null,
): BusinessModuleConfig {
  const defaults = BUSINESS_MODULE_DEFAULT_CONFIG[moduleId];
  const displayName = (config?.displayName ?? defaults.displayName).trim();
  const description = config?.description?.trim() || defaults.description;
  const contactEmail = config?.contactEmail?.trim();
  const contactPhone = config?.contactPhone?.trim();
  const notes = config?.notes?.trim();

  const normalized: BusinessModuleConfig = {
    displayName: displayName || defaults.displayName,
  };

  if (description) {
    normalized.description = description;
  }

  if (contactEmail) {
    normalized.contactEmail = contactEmail;
  }

  if (contactPhone) {
    normalized.contactPhone = contactPhone;
  }

  if (notes) {
    normalized.notes = notes;
  }

  return normalized;
}
