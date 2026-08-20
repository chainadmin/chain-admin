import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, Megaphone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const adminHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${sessionStorage.getItem("admin_token")}`,
});

export function PlatformAnnouncementsPanel() {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const { data, refetch } = useQuery<any>({
    queryKey: ["/api/admin/platform-announcements"],
    queryFn: async () => {
      const response = await fetch("/api/admin/platform-announcements", { headers: adminHeaders() });
      if (!response.ok) throw new Error("Unable to load platform announcements");
      return response.json();
    },
  });
  const sendAnnouncement = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/platform-announcements", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ subject, message }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to send announcement");
      return body;
    },
    onSuccess: (result) => {
      toast({ title: "Platform announcement sent", description: `${result.sent} of ${result.recipients} customer emails sent.` });
      setSubject("");
      setMessage("");
      refetch();
    },
    onError: (error: Error) => toast({ title: "Announcement failed", description: error.message, variant: "destructive" }),
  });

  return (
    <section className="mb-8 rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-blue-900/20 backdrop-blur" data-testid="platform-announcements-panel">
      <div className="border-b border-white/10 p-6">
        <div className="flex items-center gap-3"><Megaphone className="h-5 w-5 text-blue-300" /><h2 className="text-xl font-semibold text-blue-50">Platform Announcements</h2></div>
        <p className="mt-1 text-sm text-blue-100/60">Global Admin messages all customers across active agencies. Replies stay in this Global Admin inbox.</p>
      </div>
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div><Label className="text-blue-100" htmlFor="announcement-subject">Subject</Label><Input id="announcement-subject" value={subject} onChange={event => setSubject(event.target.value)} placeholder="Important Chain platform update" data-testid="input-platform-announcement-subject" /></div>
          <div><Label className="text-blue-100" htmlFor="announcement-message">Message</Label><Textarea id="announcement-message" className="min-h-44" value={message} onChange={event => setMessage(event.target.value)} placeholder="Write the platform announcement..." data-testid="input-platform-announcement-message" /></div>
          <p className="text-xs text-blue-100/60">Personalization: {"{{firstName}}, {{lastName}}, {{agencyName}}, {{tenantSlug}}, {{consumerPortalLink}}, {{appDownloadLink}}"}</p>
          <Button onClick={() => window.confirm("Send this announcement immediately to every eligible customer across all active agencies?") && sendAnnouncement.mutate()} disabled={!subject.trim() || !message.trim() || sendAnnouncement.isPending} data-testid="button-send-platform-announcement"><Send className="mr-2 h-4 w-4" />{sendAnnouncement.isPending ? "Sending..." : "Send to All Customers"}</Button>
        </div>
        <div>
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-blue-50"><Mail className="h-4 w-4" />Global Admin Reply Inbox</h3>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {(data?.replies || []).map((reply: any) => <article key={reply.id} className="rounded-xl border border-white/10 bg-white/10 p-4 text-sm"><div className="flex justify-between gap-3"><strong className="text-blue-50">{reply.consumer_first_name || reply.from_email} {reply.consumer_last_name || ""}</strong>{!reply.is_read && <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">New</span>}</div><p className="text-xs text-blue-100/60">{reply.tenant_name} · {reply.tenant_slug}</p><p className="mt-2 font-medium text-blue-100">{reply.subject}</p><p className="mt-1 whitespace-pre-wrap text-blue-100/80">{reply.text_body}</p></article>)}
            {!data?.replies?.length && <p className="rounded-xl border border-dashed border-white/20 p-6 text-center text-sm text-blue-100/60">No platform announcement replies yet.</p>}
          </div>
          <h3 className="mb-3 mt-6 font-semibold text-blue-50">Recent sends</h3>
          {(data?.announcements || []).slice(0, 5).map((item: any) => <div key={item.id} className="mb-2 flex justify-between rounded-lg bg-white/5 p-3 text-xs text-blue-100/70"><span>{item.subject}</span><span>{item.sent_count}/{item.recipient_count} sent · {item.reply_count} replies</span></div>)}
        </div>
      </div>
    </section>
  );
}
