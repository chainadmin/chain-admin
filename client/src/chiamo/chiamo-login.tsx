import { useState } from "react";
import { brands } from "@/config/brands";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queryClient } from "@/lib/queryClient";
import { persistTenantMetadata, setCookie } from "@/lib/cookies";
import {
  isMatchingVoipSession,
  requestSoftphoneLogin,
  requestTemporaryPasswordChange,
  requestVoipSession,
} from "@/lib/softphone-session";

export function ChiamoLogin({ returnTo, initialError = "" }: { returnTo?: string; initialError?: string } = {}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  // A password-change-only token is not an application session; never persist it.
  const [changeToken, setChangeToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  async function signIn(secret: string) {
    const result = await requestSoftphoneLogin(username, secret, "chiamo");
    if (result.requiresPasswordChange) {
      setChangeToken(result.token);
      return;
    }
    if (returnTo === "/softphone") {
      const session = await requestVoipSession(result.token);
      if (!isMatchingVoipSession(session, "chiamo")) {
        throw new Error("This account belongs to a different product.");
      }
      if (!session.callingAllowed) {
        throw new Error("You don't have calling access. Please contact your administrator.");
      }
    }
    setPassword("");
    setNewPassword("");
    setConfirmation("");
    setChangeToken(null);
    queryClient.clear();
    localStorage.setItem("authToken", result.token);
    setCookie("authToken", result.token);
    persistTenantMetadata({ slug: result.tenant?.slug, name: result.tenant?.name });
    const previewBrand = new URLSearchParams(window.location.search).get("brand") === "chiamo";
    const safeReturnTo = returnTo === "/softphone" ? returnTo : "/dashboard";
    window.location.assign(previewBrand ? `${safeReturnTo}?brand=chiamo` : safeReturnTo);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (changeToken && newPassword !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (changeToken) {
        await requestTemporaryPasswordChange(changeToken, password, newPassword);
        const updatedPassword = newPassword;
        setChangeToken(null);
        setNewPassword("");
        setConfirmation("");
        setPassword(updatedPassword);
        await signIn(updatedPassword);
      } else {
        await signIn(password);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sign-in could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex min-h-screen flex-col bg-[#062d31]">
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-slate-900 shadow-2xl">
        <img src={brands.chiamo.logo} alt="Chiamo Connect" className="mx-auto h-14" />
        <h1 className="mt-8 text-center text-2xl font-bold">{changeToken ? "Choose your password" : "Welcome back"}</h1>
        <p className="mt-2 text-center text-sm text-slate-600">{changeToken
          ? "Replace your temporary password to continue to your phone system."
          : "Sign in to your Chiamo business phone."}</p>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <label className="block text-sm font-semibold">Username
            <Input className="mt-2 h-12" autoComplete="username" value={username}
              onChange={event => setUsername(event.target.value)} required disabled={busy || !!changeToken} />
          </label>
          {!changeToken ? <label className="block text-sm font-semibold">Password
            <Input className="mt-2 h-12" type="password" autoComplete="current-password" value={password}
              onChange={event => setPassword(event.target.value)} required disabled={busy} />
          </label> : <>
            <label className="block text-sm font-semibold">New password
              <Input className="mt-2 h-12" type="password" autoComplete="new-password" value={newPassword}
                onChange={event => setNewPassword(event.target.value)} required minLength={12} maxLength={72} disabled={busy} />
            </label>
            <p className="text-xs text-slate-500">Use at least 12 characters with uppercase, lowercase, a number and a symbol.</p>
            <label className="block text-sm font-semibold">Confirm new password
              <Input className="mt-2 h-12" type="password" autoComplete="new-password" value={confirmation}
                onChange={event => setConfirmation(event.target.value)} required disabled={busy} />
            </label>
          </>}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button className="h-12 w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy}>
            {busy ? "Please wait…" : changeToken ? "Set password & sign in" : "Sign in"}
          </Button>
          {changeToken ? <Button className="w-full" type="button" variant="ghost" disabled={busy}
            onClick={() => { setChangeToken(null); setPassword(""); setNewPassword(""); setConfirmation(""); setError(""); }}>Back to sign in</Button> :
            <p className="text-center text-sm text-slate-600">Your company provides your password. Global Admin can generate a temporary password for your username when needed. No email is required.</p>}
        </form>
      </div>
    </main>
    <footer className="px-5 py-6 text-center text-sm text-slate-300">Chiamo Connect · Business VoIP phones</footer>
  </div>;
}