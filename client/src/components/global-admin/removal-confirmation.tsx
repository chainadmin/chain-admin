import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Database, Loader2, LockKeyhole, RefreshCw, ShieldAlert } from "lucide-react";
import { ApiError, apiRequest, isTransientGatewayError, queryClient } from "@/lib/queryClient";
import { matchesRemovalTargetName, normalizedRemovalTargetName } from "@/lib/removalConfirmation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Product = "CHAIN" | "CHIAMO";
type TargetKind = "tenant" | "lead";
type Preflight = {
  target: { type: string; id: string; name: string };
  selectedProduct: Product;
  products: { chain?: unknown; chiamo?: unknown };
  classification: "PERMANENT_DELETE" | "PRODUCT_DEACTIVATE" | "ARCHIVE";
  counts: Record<string, number>;
  providers: Record<string, unknown>;
  logos: Array<{ source: string; url: string; owned?: boolean; key?: string }>;
  blockers: Array<{ category: string; label: string; count: number }>;
  fingerprint: string;
  summary?: string;
  message?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { id: string; name: string; kind: TargetKind; product: Product };
  onSuccess?: () => void;
};

const countLabels: Record<string, string> = {
  users: "Users", consumers: "Consumers", accounts: "Accounts", invoices: "Invoices",
  payments: "Payments", signedLegalRecords: "Signed legal records", calls: "Calls", messages: "Messages",
};

function errorDetails(error: unknown) {
  const api = error instanceof ApiError ? error : null;
  const data = api?.data && typeof api.data === "object" ? api.data as Record<string, unknown> : {};
  const issues = data.issues && typeof data.issues === "object"
    ? Object.entries(data.issues as Record<string, unknown>).flatMap(([field, value]) =>
      (Array.isArray(value) ? value : [value]).filter(Boolean).map(item => `${field}: ${String(item)}`))
    : [];
  return { api, code: data.code ? String(data.code) : "", issues };
}

export function RemovalConfirmation({ open, onOpenChange, target, onSuccess }: Props) {
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [typedName, setTypedName] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [cleanupResult, setCleanupResult] = useState<any>(null);
  const preflightUrl = target.kind === "lead"
    ? `/api/admin/chiamo/leads/${target.id}/removal-preflight`
    : `/api/admin/removals/tenants/${target.id}/preflight?product=${target.product}`;
  const query = useQuery<Preflight>({
    queryKey: ["global-admin-removal-preflight", target.kind, target.id, target.product],
    queryFn: async () => {
      const response = await apiRequest("GET", preflightUrl);
      return await response.json() as Preflight;
    },
    enabled: open,
    retry: (failureCount, error) => failureCount < 2 && isTransientGatewayError(error),
    retryDelay: attempt => Math.min(750 * 2 ** attempt, 3000),
  });
  const current = preflight || query.data;
  const execute = useMutation({
    mutationFn: async () => {
      const url = target.kind === "lead"
        ? `/api/admin/chiamo/leads/${target.id}/remove`
        : `/api/admin/removals/tenants/${target.id}`;
      const response = await apiRequest("POST", url, {
        ...(target.kind === "tenant" ? { product: target.product } : {}),
        typedName, reason, password, preflightFingerprint: current?.fingerprint,
      });
      return await response.json();
    },
    onSuccess: (result: any) => {
      setCleanupResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chiamo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chiamo/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chiamo/customers"] });
      onSuccess?.();
    },
    onError: (error) => {
      const { code } = errorDetails(error);
      if (code === "PREFLIGHT_CHANGED" || code === "DATABASE_CONFLICT") {
        setPreflight(null);
        void query.refetch();
      }
    },
  });
  const retryCleanup = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/removals/${cleanupResult.auditId}/retry-cleanup`);
      return await response.json();
    },
    onSuccess: setCleanupResult,
  });
  const confirmationName = normalizedRemovalTargetName(current?.target.name || target.name);
  const exact = matchesRemovalTargetName(typedName, confirmationName);
  const canExecute = Boolean(current && exact && reason.trim().length >= 10 && password && !execute.isPending);
  const classificationLabel = current?.classification === "PERMANENT_DELETE" ? "Permanent deletion"
    : current?.classification === "PRODUCT_DEACTIVATE" ? "Product deactivation"
      : "Archive";
  const failure = execute.error || retryCleanup.error || query.error;
  const failureInfo = errorDetails(failure);
  const reset = (next: boolean) => {
    if (!next) {
      setTypedName(""); setReason(""); setPassword(""); setCleanupResult(null); setPreflight(null);
      execute.reset(); retryCleanup.reset();
    }
    onOpenChange(next);
  };
  const countEntries = useMemo(() => Object.entries(current?.counts || {}).filter(([, value]) => value > 0), [current]);

  return <Dialog open={open} onOpenChange={reset}>
    <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-rose-700"><ShieldAlert className="h-5 w-5" />Review {target.product} removal</DialogTitle>
        <DialogDescription>Nothing is changed until the final action is submitted. The server preflight is the source of truth.</DialogDescription>
      </DialogHeader>
      {query.isLoading && <div className="flex items-center gap-2 rounded-lg border bg-slate-50 p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Preparing a server-side impact review…</div>}
      {query.error && !current && <div className="space-y-3"><InlineFailure error={query.error} /><Button variant="outline" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" />Run preflight again</Button></div>}
      {current && !cleanupResult && <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" /><div><p className="font-bold text-amber-900">{classificationLabel}</p><p className="mt-1 text-sm text-amber-900">{current.summary || current.message || "Review the impact below before continuing."}</p></div></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Info title="Target" value={`${current.target.name} · ${current.target.id}`} />
          <Info title="Product isolation" value={`Only ${current.selectedProduct} data is addressed`} />
        </div>
        <section className="rounded-lg border p-3"><h4 className="flex items-center gap-2 text-sm font-bold"><Database className="h-4 w-4" />Dependencies in scope</h4><div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{countEntries.map(([key, value]) => <div key={key} className="rounded bg-slate-50 px-2 py-2"><span className="block text-slate-500">{countLabels[key] || key}</span><b>{value}</b></div>)}{!countEntries.length && <p className="col-span-full text-slate-500">No dependent records reported.</p>}</div></section>
        <div className="grid gap-3 sm:grid-cols-2">
          <Info title="Providers" value={Object.entries(current.providers || {}).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "None reported"} />
          <Info title="Logo ownership" value={current.logos?.length ? current.logos.map(logo => `${logo.source}: ${logo.owned ? "owned" : "external URL"}`).join(" · ") : "No logos reported"} />
        </div>
        {current.logos?.length > 0 && <p className="text-xs text-slate-500">A logo URL is an external reference and is not a database blocker. Only owned assets are considered for cleanup.</p>}
        {current.blockers?.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-bold">Retained history that prevents permanent deletion</p><p className="mb-2 text-xs">These records will be preserved by the archive or product-deactivation action shown above.</p>{current.blockers.map(blocker => <p key={`${blocker.category}-${blocker.label}`}>{blocker.label} · {blocker.count}</p>)}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label><Label>Type the target name exactly</Label><Input className="mt-1" value={typedName} onChange={event => setTypedName(event.target.value)} placeholder={confirmationName} /></label>
          <label><Label>Reason required (at least 10 characters)</Label><Input className="mt-1" value={reason} onChange={event => setReason(event.target.value)} placeholder="Document the authorization" /></label>
          <label className="sm:col-span-2"><Label>Current Global Admin password</Label><div className="relative mt-1"><LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></div></label>
        </div>
        {failure && <InlineFailure error={failure} />}
      </div>}
      {cleanupResult && <div className="space-y-4"><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5" />{cleanupResult.success ? "Removal request completed" : "Database change completed"}</div><p className="mt-2 text-sm">{cleanupResult.message || "The record change was committed."}</p></div>{cleanupResult.cleanup?.status && cleanupResult.cleanup.status !== "COMPLETE" && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="font-bold text-amber-900">Provider cleanup still needs attention</p><p className="mt-1 text-sm text-amber-800">The database action succeeded. Cleanup can be retried safely from audit record {cleanupResult.auditId}.</p><Button className="mt-3" variant="outline" onClick={() => retryCleanup.mutate()} disabled={retryCleanup.isPending}><RefreshCw className="h-4 w-4" />{retryCleanup.isPending ? "Retrying…" : "Retry cleanup"}</Button></div>}</div>}
      <DialogFooter>{!cleanupResult && <><Button variant="outline" onClick={() => reset(false)}>Cancel</Button><Button variant="destructive" disabled={!canExecute} onClick={() => execute.mutate()}>{execute.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying and executing…</> : `Confirm ${classificationLabel}`}</Button></>}{cleanupResult && <Button onClick={() => reset(false)}>Close</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Info({ title, value }: { title: string; value: string }) {
  return <div className="rounded-lg border bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-1 text-sm">{value}</p></div>;
}

function InlineFailure({ error }: { error: unknown }) {
  const { api, code, issues } = errorDetails(error);
  const special = code === "PASSWORD_CHANGE_REQUIRED" ? "Password change required before destructive actions."
    : code === "STALE_SESSION" || api?.status === 401 ? "Your Global Admin session is stale. Sign in again and retry."
      : code === "RETENTION_BLOCK" ? "Retention policy prevents this action."
        : code === "PROVIDER_CLEANUP_FAILED" ? "The record change may have succeeded; provider cleanup failed and can be retried from the audit record."
          : code === "DATABASE_CONFLICT" || api?.status === 409 ? "The record changed while this review was open. Run preflight again."
            : null;
  return <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><p className="font-bold">Request failed{api ? ` · HTTP ${api.status}` : ""}{code ? ` · ${code}` : ""}</p><p className="mt-1">{special || api?.message || "The request could not be completed."}</p>{issues.length > 0 && <ul className="mt-2 list-disc pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</div>;
}