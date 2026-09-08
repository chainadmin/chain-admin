import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Hash, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { confirmedNumberPurchase, retryPendingNumberPurchase, type ChiamoConfirmedNumberPurchase } from "./chiamo-number-purchase";

type NumberRow = { id: string; phoneNumber: string; friendlyName?: string | null; numberType: string; status: string; voiceEnabled: boolean };
type Readiness = { allowed: boolean; reason?: string; priceCents?: number; includedNumbers?: number; currentCount?: number };
type Available = { phoneNumber: string; friendlyName: string; locality: string; region: string };

const money = (cents = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Chiamo Build-mode panel; the host page owns navigation and only renders this panel. */
export function ChiamoNumbersPanel() {
  const [type, setType] = useState<"local" | "toll_free">("local");
  const [areaCode, setAreaCode] = useState("");
  const [results, setResults] = useState<Available[]>([]);
  const [selected, setSelected] = useState<Available | null>(null);
  const [purchaseKey, setPurchaseKey] = useState("");
  const [pendingOperation, setPendingOperation] = useState<ChiamoConfirmedNumberPurchase | null>(null);
  const retryTimer = useRef<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => () => {
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
  }, []);
  const inventory = useQuery<{ numbers: NumberRow[]; readiness: Readiness }>({ queryKey: ["/api/chiamo/numbers"] });
  const readiness = inventory.data?.readiness;
  const search = useMutation({
    mutationFn: async () => (await apiRequest("GET", `/api/chiamo/numbers/search?type=${type}${type === "local" ? `&areaCode=${encodeURIComponent(areaCode)}` : ""}`)).json() as Promise<{ numbers: Available[] }>,
    onSuccess: data => { setResults(data.numbers); setSelected(null); setError(""); },
    onError: (e: Error) => setError(e.message),
  });
  const purchase = useMutation({
    mutationFn: async (operation: ChiamoConfirmedNumberPurchase) => {
      const response = await apiRequest("POST", "/api/chiamo/numbers/purchase", operation);
      return { status: response.status, body: await response.json() as { pending?: boolean; message?: string } };
    },
    onSuccess: (result, operation) => {
      if (result.status === 202 || result.body.pending) {
        setError(result.body.message || "Purchase is still processing. Inventory will refresh automatically.");
        queryClient.invalidateQueries({ queryKey: ["/api/chiamo/numbers"] });
        setPendingOperation(operation);
        // Retry only the immutable confirmed operation, never current form state.
        retryTimer.current = window.setTimeout(() => purchase.mutate(retryPendingNumberPurchase(operation)), 1500);
        return;
      }
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
      setPendingOperation(null);
      setSelected(null); setPurchaseKey(""); setResults([]); setError("");
      queryClient.invalidateQueries({ queryKey: ["/api/chiamo/numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chiamo/account"] });
    },
    onError: (e: Error) => {
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
      setPendingOperation(null);
      setError(e.message);
    },
  });
  const purchaseLocked = purchase.isPending || pendingOperation !== null;
  const canSearch = !!readiness?.allowed && (type === "toll_free" || /^\d{3}$/.test(areaCode));
  return <section className="space-y-6">
    <div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><Hash className="h-5 w-5" /></span><div><h2 className="text-2xl font-black">Business numbers</h2><p className="text-sm text-slate-500">Voice-only numbers owned by your Chiamo Connect account.</p></div></div>
    {inventory.isLoading ? <p className="text-sm text-slate-500">Loading numbers…</p> : <div className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Your inventory</h3><div className="mt-3 space-y-2">{inventory.data?.numbers.map(number => <div key={number.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-semibold">{number.phoneNumber}</p><p className="text-xs text-slate-500">{number.friendlyName || number.numberType} · Voice enabled</p></div><span className="text-xs font-bold text-emerald-700">{number.status}</span></div>)}{!inventory.data?.numbers.length && <p className="py-4 text-sm text-slate-500">No phone numbers have been assigned yet.</p>}</div></div>}
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">Buy Number</h3><p className="mt-1 text-sm text-slate-500">{readiness?.allowed ? `${readiness.currentCount || 0} active; ${readiness.includedNumbers || 0} included with your plan. Additional numbers: ${money(readiness.priceCents)}/month.` : readiness?.reason || "Checking account setup…"}</p></div></div>
      {!readiness?.allowed ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Purchasing is disabled: {readiness?.reason || "account setup is still loading"}.</p> : <><div className="mt-4 flex flex-wrap gap-3"><select aria-label="Number type" disabled={purchaseLocked} className="rounded-md border px-3 py-2" value={type} onChange={e => { setType(e.target.value as "local" | "toll_free"); setResults([]); setSelected(null); }}><option value="local">Local area code</option><option value="toll_free">Toll-free</option></select>{type === "local" && <Input disabled={purchaseLocked} className="w-36" value={areaCode} maxLength={3} inputMode="numeric" placeholder="Area code" onChange={e => setAreaCode(e.target.value.replace(/\D/g, ""))} />}<Button disabled={!canSearch || search.isPending || purchaseLocked} onClick={() => search.mutate()}><Search className="mr-2 h-4 w-4" />{search.isPending ? "Searching…" : "Search"}</Button></div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 space-y-2">{results.map(number => <button type="button" disabled={purchaseLocked} key={number.phoneNumber} onClick={() => { setSelected(number); setPurchaseKey(crypto.randomUUID()); }} className={`flex w-full items-center justify-between rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-60 ${selected?.phoneNumber === number.phoneNumber ? "border-emerald-600 bg-emerald-50" : ""}`}><span><b>{number.phoneNumber}</b><small className="ml-2 text-slate-500">{[number.locality, number.region].filter(Boolean).join(", ")}</small></span>{selected?.phoneNumber === number.phoneNumber && <Check className="h-4 w-4 text-emerald-700" />}</button>)}{!search.isPending && results.length === 0 && search.isSuccess && <p className="py-4 text-sm text-slate-500">No voice numbers are currently available. Try another search.</p>}</div>
      {selected && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold">Confirm purchase of {selected.phoneNumber}</p><p className="mt-1 text-sm text-slate-600">This is a voice-only Chiamo number. It changes your future Chiamo invoice by {money(readiness.priceCents)} per month when your included number allowance is exceeded.</p><Button className="mt-3 bg-emerald-600 hover:bg-emerald-700" disabled={purchaseLocked || !purchaseKey} onClick={() => { const operation = confirmedNumberPurchase(selected.phoneNumber, type, purchaseKey); setPendingOperation(operation); purchase.mutate(operation); }}>{purchaseLocked ? "Purchasing…" : "Confirm & buy number"}</Button></div>}</>}</div>
  </section>;
}