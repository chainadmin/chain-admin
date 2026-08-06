export const CAMPUS_DEPARTMENTS = [
  "Admissions", "Housing", "Parking", "Dining", "Athletics", "Bookstore",
  "Library", "Registrar", "Financial Aid", "Student Accounts",
] as const;

export const CAMPUS_INTEGRATIONS = [
  { id: "banner", name: "Ellucian Banner", category: "Student information system" },
  { id: "ethos", name: "Ellucian Ethos", category: "Integration platform" },
  { id: "sso", name: "Single Sign-On", category: "Identity provider" },
  { id: "stripe", name: "Stripe", category: "Payments" },
  { id: "bank", name: "Bank APIs", category: "Banking" },
  { id: "housing", name: "Housing Systems", category: "Campus systems" },
  { id: "parking", name: "Parking Systems", category: "Campus systems" },
  { id: "dining", name: "Dining Systems", category: "Campus systems" },
] as const;

export const CAMPUS_NOTIFICATION_TEMPLATES = [
  "Payment Due", "Payment Received", "Declined Payment", "Payment Plan Created",
  "Payment Plan Missed", "Refund Issued", "Statement Available",
] as const;

export type CampusIntegrationId = typeof CAMPUS_INTEGRATIONS[number]["id"];
export type CampusConfig = {
  universityName?: string;
  primaryColor?: string;
  departments?: string[];
  integrations?: Partial<Record<CampusIntegrationId, { enabled: boolean; endpoint?: string }>>;
};

export const DEFAULT_CAMPUS_CONFIG: Required<Pick<CampusConfig, "primaryColor" | "departments">> = {
  primaryColor: "#2563eb",
  departments: [...CAMPUS_DEPARTMENTS],
};
