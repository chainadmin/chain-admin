import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { GreetingAudioInput } from "./GreetingAudioInput";
import {
  privacyGreeting,
  privacyLineChoices,
  privacyLineNumber,
  privacyLinePayload,
  type PrivacyLineResponse,
} from "./privacy-line";

export function PrivacyLineSettings({ dark, accent }: { dark: boolean; accent: string }) {
  const queryClient = useQueryClient();
  const query = useQuery<PrivacyLineResponse>({ queryKey: ["/api/voip/privacy-line"] });
  const selected = privacyLineNumber(query.data);
  const greeting = privacyGreeting(query.data);
  const [phoneNumberId, setPhoneNumberId] = useState<string>("");
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [greetingType, setGreetingType] = useState<"TEXT" | "AUDIO">("TEXT");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setPhoneNumberId(query.data?.phoneNumberId || selected?.id || "");
    setEnabled(greeting.type != null);
    setText(greeting.text || "");
    setGreetingType(greeting.type || "TEXT");
    setAudioUrl(greeting.audioUrl || null);
    setPreviewUrl(greeting.previewUrl || null);
  }, [query.data, selected?.id, greeting.type, greeting.text, greeting.audioUrl, greeting.previewUrl]);

  const save = useMutation({
    mutationFn: () => apiRequest(
      "PATCH",
      "/api/voip/privacy-line",
      privacyLinePayload(phoneNumberId || null, { enabled, type: greetingType, text, audioUrl }),
    ),
    onSuccess: async () => {
      // The softphone query is scoped by session, so prefix invalidation refreshes
      // both the manager view and any already-authenticated deskphone tab.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/voip/privacy-line"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/voip/voicemail"] }),
      ]);
    },
  });
  const panel = dark ? "border-white/10 bg-white/5 text-white" : "border-slate-200 bg-white";
  const muted = dark ? "text-blue-100/60" : "text-slate-500";
  const choices = privacyLineChoices(query.data);

  if (query.isLoading) return <section className={`h-52 animate-pulse rounded-2xl border p-5 ${panel}`} />;
  if (query.isError) return <section className={`rounded-2xl border p-5 ${panel}`}><h3 className="font-bold">Privacy Line</h3><p className={`mt-2 text-sm ${muted}`}>Privacy Line settings could not load. <button type="button" className="font-semibold underline" onClick={() => query.refetch()}>Try again</button></p></section>;

  return <section className={`rounded-2xl border p-5 ${panel}`}>
    <div className="flex gap-3">
      <ShieldCheck className={dark ? "mt-0.5 h-5 w-5 text-sky-300" : "mt-0.5 h-5 w-5 text-emerald-700"} />
      <div><h3 className="font-bold">Privacy Line</h3><p className={`mt-1 max-w-2xl text-sm ${muted}`}>Private calls display this dedicated company number. Callbacks go to this line’s separate voicemail; callers never see an anonymous or withheld caller ID.</p></div>
    </div>
    <Label className="mt-5 block">Dedicated active company number
      <select aria-label="Privacy Line number" value={phoneNumberId} onChange={(event) => setPhoneNumberId(event.target.value)} className={`mt-2 h-10 w-full rounded-md border px-3 text-sm ${dark ? "border-white/20 bg-slate-900 text-white" : "bg-white"}`}>
        <option value="">No Privacy Line assigned</option>
        {choices.map((number) => <option key={number.id} value={number.id}>{number.phoneNumber}{number.friendlyName ? ` — ${number.friendlyName}` : ""}</option>)}
      </select>
    </Label>
    {!choices.length && <p className={`mt-2 text-xs ${muted}`}>No active company DIDs are available to assign.</p>}
    <div className="mt-5 flex items-center justify-between gap-4"><div><p className="text-sm font-semibold">Separate voicemail greeting</p><p className={`mt-1 text-xs ${muted}`}>Used only when a caller reaches the Privacy Line.</p></div><Switch checked={enabled} onCheckedChange={(value) => { setEnabled(value); if (value && greetingType !== "AUDIO") setGreetingType("TEXT"); }} /></div>
    {enabled && <div className="mt-4 flex gap-2"><Button type="button" size="sm" variant={greetingType === "TEXT" ? "default" : "outline"} onClick={() => setGreetingType("TEXT")}>Typed greeting</Button><Button type="button" size="sm" variant={greetingType === "AUDIO" ? "default" : "outline"} onClick={() => setGreetingType("AUDIO")}>Recorded or uploaded audio</Button></div>}
    {enabled && greetingType === "TEXT" && <Label className="mt-4 block">Greeting text<textarea value={text} onChange={(event) => setText(event.target.value)} className="mt-2 min-h-24 w-full rounded-md border bg-transparent p-3" placeholder="Please leave a message after the tone." /></Label>}
    {enabled && greetingType === "AUDIO" && <GreetingAudioInput dark={dark} audioUrl={audioUrl} previewUrl={previewUrl} onUploaded={(upload) => { setAudioUrl(upload.audioUrl); setPreviewUrl(upload.previewUrl); }} />}
    {save.isError && <p role="alert" className="mt-3 text-sm text-rose-600">Privacy Line settings could not be saved. Please try again.</p>}
    <Button className={`mt-5 ${accent}`} disabled={save.isPending} onClick={() => save.mutate()}><Save className="mr-2 h-4 w-4" />{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Privacy Line"}</Button>
  </section>;
}