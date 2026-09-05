import crypto from "node:crypto";

export type RemovalProduct = "CHAIN" | "CHIAMO";
export type RemovalClassification = "PERMANENT_DELETE" | "PRODUCT_DEACTIVATE" | "ARCHIVE";
export type CleanupStatus = "PENDING" | "RUNNING" | "FAILED" | "SUCCEEDED" | "SKIPPED";

export type RemovalCounts = Record<
  "users" | "consumers" | "accounts" | "invoices" | "payments" | "signedLegalRecords" |
  "calls" | "messages", number
>;

export interface RemovalTarget {
  id: string;
  name: string;
  chainCoreEnabled: boolean;
  chiamoConnectEnabled: boolean;
  /** A Chiamo lead with this set is a customer and is never hard deleted. */
  convertedTenantId?: string | null;
  /** Only unconverted sales leads may bypass tenant-retention rules. */
  unconvertedLead?: boolean;
}

export interface RemovalPreflight {
  target: RemovalTarget;
  product: RemovalProduct;
  products: RemovalProduct[];
  classification: RemovalClassification;
  counts: RemovalCounts;
  providerResources: Record<string, unknown>;
  logoReferences: string[];
  blockers: string[];
  fingerprint: string;
}

export interface PublicRemovalPreflight {
  target: { type: "TENANT" | "CHIAMO_LEAD"; id: string; name: string };
  selectedProduct: RemovalProduct;
  products: { chain: boolean; chiamo: boolean };
  classification: RemovalClassification;
  counts: RemovalCounts;
  providers: Record<string, unknown>;
  logos: Array<{ source: string; url: string; owned: boolean; key?: string }>;
  blockers: Array<{ category: string; label: string; count: number }>;
  fingerprint: string;
  summary: string;
  message: string;
}

const retainedKeys = [
  "consumers", "accounts", "invoices", "payments", "paymentSchedules", "arrangements",
  "processing", "approvals", "walletLedger", "documents", "signatureRequests",
  "signedLegalRecords", "signedDocuments", "signatureAudit", "audit", "agreements",
  "emailLogs", "emailReplies", "smsLogs", "smsReplies", "replies", "tracking",
  "messagingUsage", "calls", "callLogs", "voicemails", "campaignHistory",
  "automationHistory", "sequenceHistory", "convertedLeads", "billingHistory",
  "communicationHistory", "voiceProvisioning",
] as const;

/** Do not use provider response bodies in an admin-visible error or audit. */
export function sanitizeProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "Provider cleanup failed");
  const withoutUrls = raw.replace(/https?:\/\/\S+/gi, "[url]");
  const withoutSecrets = withoutUrls
    .replace(/\b(?:AC|SK)[A-Za-z0-9]{20,}\b/g, "[redacted]")
    .replace(/(token|secret|authorization|password)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return withoutSecrets.replace(/[\r\n]+/g, " ").slice(0, 500);
}

export function activeProducts(target: RemovalTarget): RemovalProduct[] {
  return (["CHAIN", "CHIAMO"] as const).filter(product =>
    product === "CHAIN" ? target.chainCoreEnabled : target.chiamoConnectEnabled,
  );
}

export function retainedHistoryBlockers(counts: Record<string, number>): string[] {
  return retainedKeys
    .filter(key => Number(counts[key] || 0) > 0)
    .map(key => `${key}:${counts[key]}`);
}

export function classifyRemoval(target: RemovalTarget, product: RemovalProduct, counts: Record<string, number>): RemovalClassification {
  const products = activeProducts(target);
  if (target.unconvertedLead && !target.convertedTenantId) return "PERMANENT_DELETE";
  if (products.length > 1) return "PRODUCT_DEACTIVATE";
  if (product === "CHIAMO") return "ARCHIVE";
  return retainedHistoryBlockers(counts).length ? "ARCHIVE" : "PERMANENT_DELETE";
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Stable, tamper-evident snapshot used between preflight and execution. */
export function removalFingerprint(snapshot: Omit<RemovalPreflight, "fingerprint">): string {
  return crypto.createHash("sha256").update(canonical(snapshot)).digest("hex");
}

export function makePreflight(input: Omit<RemovalPreflight, "classification" | "products" | "blockers" | "fingerprint">): RemovalPreflight {
  const products = activeProducts(input.target);
  const classification = classifyRemoval(input.target, input.product, input.counts);
  const blockers = classification === "PERMANENT_DELETE" ? retainedHistoryBlockers(input.counts) : [];
  const base = { ...input, products, classification, blockers };
  return { ...base, fingerprint: removalFingerprint(base) };
}

export function normalizePreflight(
  preflight: RemovalPreflight,
  type: "TENANT" | "CHIAMO_LEAD",
  logos: PublicRemovalPreflight["logos"],
): PublicRemovalPreflight {
  const blockers = retainedHistoryBlockers(preflight.counts).map(item => {
    const [category, count] = item.split(":");
    return { category, label: category.replace(/([A-Z])/g, " $1"), count: Number(count) };
  });
  const summary = preflight.classification === "PERMANENT_DELETE"
    ? "No retained business history was found. Permanent deletion is allowed."
    : preflight.classification === "PRODUCT_DEACTIVATE"
      ? "The selected product will be deactivated while shared records are retained."
      : "This target will be archived because retained history must be preserved.";
  return {
    target: { type, id: preflight.target.id, name: preflight.target.name },
    selectedProduct: preflight.product,
    products: { chain: preflight.target.chainCoreEnabled, chiamo: preflight.target.chiamoConnectEnabled },
    classification: preflight.classification, counts: preflight.counts, providers: preflight.providerResources,
    logos, blockers, fingerprint: preflight.fingerprint, summary, message: summary,
  };
}

export function validateRemovalConfirmation(targetName: string, typedName: unknown, reason: unknown): string | null {
  if (
    typeof typedName !== "string"
    || !targetName.trim()
    || typedName.trim() !== targetName.trim()
  ) return "The target name must match exactly.";
  if (typeof reason !== "string" || reason.trim().length < 10) return "A reason of at least 10 characters is required.";
  return null;
}

export interface CleanupTask {
  id: string;
  taskType: string;
  payload: Record<string, unknown>;
  status: CleanupStatus;
  attempts: number;
}

export interface CleanupStore {
  /** Must atomically claim PENDING/FAILED stale work, returning null if unavailable. */
  claim(taskId: string): Promise<CleanupTask | null>;
  finish(taskId: string, result: { status: "SUCCEEDED" | "FAILED" | "SKIPPED"; error?: string }): Promise<void>;
}

export type CleanupExecutor = (task: CleanupTask) => Promise<"SUCCEEDED" | "SKIPPED">;

/** Provider work is intentionally outside the removal DB transaction. */
export async function retryCleanupTask(store: CleanupStore, taskId: string, execute: CleanupExecutor): Promise<CleanupTask | null> {
  const task = await store.claim(taskId);
  if (!task) return null;
  try {
    const status = await execute(task);
    await store.finish(task.id, { status });
  } catch (error) {
    await store.finish(task.id, { status: "FAILED", error: sanitizeProviderError(error) });
  }
  return task;
}