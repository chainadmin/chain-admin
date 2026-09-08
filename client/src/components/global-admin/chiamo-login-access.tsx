import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, KeyRound } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type LoginUser = {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: string | null;
};
type TemporaryAccess = { username: string; temporaryPassword: string; expiresAt: string };

export function ChiamoLoginAccess({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}>
      <KeyRound className="mr-2 h-4 w-4" />Username & password
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <ChiamoAccessDialog tenantId={tenantId} tenantName={tenantName} />}
    </Dialog>
  </>;
}

function ChiamoAccessDialog({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const access = useQuery<{
    users: LoginUser[];
    status: { tenantActive: boolean; loginExplicitlyDisabled: boolean; accountActive?: boolean; explicitLoginDisabled?: boolean };
  }>({
    queryKey: [`/api/admin/chiamo/customers/${tenantId}/login-access`],
    staleTime: 0,
  });
  const [credentialId, setCredentialId] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Passwords deliberately stay outside React Query and browser persistence.
  const [temporary, setTemporary] = useState<TemporaryAccess | null>(null);
  const [copied, setCopied] = useState(false);
  const [enableLoginConfirmed, setEnableLoginConfirmed] = useState(false);
  const users = access.data?.users ?? [];
  const activeUsers = users.filter(user => user.isActive);
  const selected = users.find(user => user.id === credentialId);

  useEffect(() => {
    if (!credentialId && activeUsers.length) {
      setCredentialId((activeUsers.find(user => user.role === "owner") ?? activeUsers[0]).id);
    }
  }, [users, credentialId]);
  useEffect(() => {
    if (!temporary) return;
    const delay = Math.max(0, new Date(temporary.expiresAt).getTime() - Date.now());
    const timer = setTimeout(() => setTemporary(null), Math.min(delay, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [temporary]);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !selected?.isActive || !confirmed) return;
    setBusy(true);
    setError("");
    setTemporary(null);
    setCopied(false);
    try {
      const response = await apiRequest("POST", `/api/admin/chiamo/customers/${tenantId}/temporary-password`, {
        credentialId, adminPassword, confirmReplace: true,
      });
      setTemporary(await response.json());
      setConfirmed(false);
      void access.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The password could not be generated.");
    } finally {
      setAdminPassword("");
      setBusy(false);
    }
  }
  async function copyPassword() {
    if (!temporary) return;
    try {
      await navigator.clipboard.writeText(temporary.temporaryPassword);
      setCopied(true);
    } catch {
      setError("Clipboard access is unavailable. Select and copy the password shown below.");
    }
  }

  async function enableLogin() {
    if (busy || !enableLoginConfirmed) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("PUT", `/api/admin/chiamo/customers/${tenantId}/services`, { customerLoginEnabled: true });
      setEnableLoginConfirmed(false);
      await access.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Login access could not be enabled.");
    } finally {
      setBusy(false);
    }
  }

  return <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>Chiamo login access</DialogTitle>
      <DialogDescription>{tenantName} · Direct access without email delivery</DialogDescription>
    </DialogHeader>
    {access.data?.status && (!access.data.status.tenantActive || access.data.status.loginExplicitlyDisabled) &&
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This company’s login access is disabled. Generating a password does not remove that restriction.</p>}
    {access.data?.status.tenantActive && access.data.status.accountActive && access.data.status.explicitLoginDisabled &&
      <div className="space-y-3 rounded-lg border border-amber-200 p-3">
        <p className="text-sm text-slate-600">This may be an earlier administrator restriction or an unfinished legacy setup. Review the account before enabling login. Calling still requires active billing and configured Voice service.</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={enableLoginConfirmed} disabled={busy}
            onChange={event => setEnableLoginConfirmed(event.target.checked)} />
          <span>I confirm this customer should be allowed to sign in.</span>
        </label>
        <Button variant="outline" disabled={busy || !enableLoginConfirmed} onClick={() => void enableLogin()}>
          {busy ? "Please wait…" : "Enable login access"}
        </Button>
      </div>}
    {access.isLoading ? <p role="status">Loading usernames…</p> : access.isError ?
      <div role="alert"><p className="text-sm text-red-700">{(access.error as Error).message}</p>
        <Button className="mt-3" variant="outline" onClick={() => void access.refetch()}>Retry</Button></div> :
      !users.length ? <p className="text-sm text-amber-800">No login credentials exist for this company. Customer setup must create and verify the owner before a password can be generated.</p> :
        temporary ? <div className="space-y-4" aria-live="polite">
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Password replaced. Copy it now—it cannot be retrieved after closing this window.</p>
          <label className="block text-sm font-medium">Username
            <Input className="mt-1" readOnly value={temporary.username} onFocus={event => event.target.select()} />
          </label>
          <label className="block text-sm font-medium">Temporary password
            <Input className="mt-1 font-mono" readOnly autoComplete="off" value={temporary.temporaryPassword} onFocus={event => event.target.select()} />
          </label>
          <Button onClick={() => void copyPassword()}><Copy className="mr-2 h-4 w-4" />{copied ? "Copied" : "Copy password"}</Button>
          <p className="text-sm text-slate-600">Expires {new Date(temporary.expiresAt).toLocaleString()}. Use the Chiamo sign-in screen. A new password is required before using the account.</p>
          <p className="text-xs text-slate-500">This changes login credentials only. It does not override account suspension or activate unconfigured phone service.</p>
          <Button variant="outline" onClick={() => setTemporary(null)}>Hide password</Button>
        </div> : <form className="space-y-4" onSubmit={generate}>
          <label className="block text-sm font-medium">Username
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={credentialId}
              onChange={event => { setCredentialId(event.target.value); setConfirmed(false); setError(""); }} disabled={busy}>
              {users.map(user => <option key={user.id} value={user.id} disabled={!user.isActive}>
                {user.username} · {user.role}{!user.isActive ? " (inactive)" : ""}
              </option>)}
            </select>
          </label>
          {selected?.mustChangePassword && <p className="text-sm text-amber-800">This user already needs to change their password. Generating another replaces their previous temporary password.</p>}
          {!activeUsers.length && <p role="alert" className="text-sm text-amber-800">There are no active users. Restore the intended account access before issuing credentials.</p>}
          <p className="text-sm text-slate-600">Existing passwords are not retrievable. Generate a new temporary password to sign in without waiting for email.</p>
          <label className="block text-sm font-medium">Your Global Admin password
            <Input className="mt-1" type="password" autoComplete="current-password" required value={adminPassword}
              onChange={event => setAdminPassword(event.target.value)} disabled={busy} />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required />
            <span>I understand this replaces the selected user’s password and ends their existing access sessions.</span>
          </label>
          <Button type="submit" disabled={busy || !confirmed || !adminPassword || !selected?.isActive}>
            {busy ? "Generating…" : "Generate temporary password"}
          </Button>
        </form>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </DialogContent>;
}