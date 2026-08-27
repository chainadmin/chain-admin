import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Voicemail } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

export interface CustomerPhoneNumber {
  id: string;
  phoneNumber: string;
  areaCode: string;
  numberType?: "PRIMARY" | "LOCAL_PRESENCE" | "PORTED" | "TOLL_FREE";
  state?: string | null;
  isPrimary?: boolean | null;
  isActive?: boolean | null;
  routingConfiguration?: { inboundBehavior?: "RING" | "VOICEMAIL" } | null;
}

interface VoicemailMessage {
  id: string;
  fromNumber: string;
  createdAt: string;
  recordingDuration?: number | null;
  transcription?: string | null;
  recordingSid: string;
}

function SecureRecording({ sid }: { sid: string }) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState(false);
  async function play() {
    setError(false);
    try {
      const response = await apiRequest("GET", `/api/voip/recording/${sid}`);
      const data = await response.json();
      setUrl(data.url);
    } catch {
      setError(true);
    }
  }
  return <div className="min-w-44">{url ? <audio className="h-9 max-w-52" controls autoPlay src={url} /> : <Button size="sm" variant="outline" onClick={play}><Play className="mr-2 h-4 w-4" />Listen</Button>}{error && <p className="mt-1 text-xs text-red-600">Playback unavailable</p>}</div>;
}

export function VoipNumberRouting({ numbers }: { numbers: CustomerPhoneNumber[] }) {
  const queryClient = useQueryClient();
  const settings = useQuery<{ localPresenceEnabled: boolean; localPresenceInboundBehavior: "RING" | "VOICEMAIL" }>({ queryKey: ["/api/voip/settings"] });
  const update = useMutation({
    mutationFn: (changes: { localPresenceEnabled?: boolean; localPresenceInboundBehavior?: "RING" | "VOICEMAIL" }) => apiRequest("PATCH", "/api/voip/settings", changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/voip/settings"] }),
  });
  const localNumbers = numbers.filter(number => number.numberType === "LOCAL_PRESENCE");
  return <section className="rounded-2xl border bg-white p-6 text-slate-900"><h2 className="text-xl font-bold">Local DID outbound bucket</h2><p className="mt-1 text-sm text-slate-600">This bucket contains the local numbers available for state and area-code matching. Agents explicitly select Local DID before a call; the system uses an exact area-code match first, then another number in the same state, then private caller ID when that state has no number. Regular calls continue to use the primary company number.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="flex items-center justify-between rounded-xl border p-4"><span><span className="block font-semibold">Allow Local DID caller ID</span><span className="text-sm text-slate-500">Show the Local DID toggle in the calling workflow.</span></span><input type="checkbox" className="h-5 w-5" checked={settings.data?.localPresenceEnabled || false} disabled={update.isPending} onChange={event => update.mutate({ localPresenceEnabled: event.target.checked })} /></label><label className="rounded-xl border p-4 font-semibold">Inbound calls to this bucket<select className="mt-2 h-10 w-full rounded-md border bg-white px-3" value={settings.data?.localPresenceInboundBehavior || "VOICEMAIL"} disabled={update.isPending} onChange={event => update.mutate({ localPresenceInboundBehavior: event.target.value as "RING" | "VOICEMAIL" })}><option value="RING">Ring the team</option><option value="VOICEMAIL">Do not ring — voicemail</option></select></label></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b text-slate-500">{["Phone number", "State / area code", "Outbound use", "Status"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{localNumbers.map(number => <tr key={number.id} className="border-b"><td className="p-3 font-semibold">{number.phoneNumber}</td><td className="p-3">{number.state || "—"} · {number.areaCode}</td><td className="p-3">Matches calls to {number.areaCode}</td><td className="p-3">{number.isActive ? "Active" : "Inactive"}</td></tr>)}</tbody></table>{!localNumbers.length && <p className="py-10 text-center text-slate-500">No local DID numbers are assigned.</p>}</div></section>;
}

export function CustomerVoicemailInbox() {
  const query = useQuery<VoicemailMessage[]>({ queryKey: ["/api/voip/voicemails"] });
  const messages = query.data || [];
  return <section className="rounded-2xl border bg-white p-6 text-slate-900"><h2 className="text-xl font-bold">Office voicemail</h2><p className="mt-1 text-sm text-slate-600">Organization administrators can securely review messages left for the team.</p>{query.isLoading ? <p className="py-8">Loading voicemail…</p> : <div className="mt-5 space-y-3">{messages.map(message => <article key={message.id} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_auto] md:items-center"><div><p className="font-bold">{message.fromNumber}</p><p className="text-sm text-slate-500">{new Date(message.createdAt).toLocaleString()} · {message.recordingDuration || 0} seconds</p>{message.transcription && <p className="mt-2 text-sm">{message.transcription}</p>}</div><SecureRecording sid={message.recordingSid} /></article>)}{!messages.length && <div className="py-10 text-center"><Voicemail className="mx-auto h-10 w-10 text-sky-600" /><p className="mt-3 font-semibold">No voicemail messages</p><p className="text-sm text-slate-500">New messages will appear after a caller leaves one.</p></div>}</div>}</section>;
}
