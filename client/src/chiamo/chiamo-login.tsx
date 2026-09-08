import { useState } from "react";
import { brands } from "@/config/brands";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiRequest, parseErrorResponse, queryClient } from "@/lib/queryClient";
import { persistTenantMetadata, setCookie } from "@/lib/cookies";

export function ChiamoLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  // A password-change-only token is not an application session; never persist it.
  const [changeToken, setChangeToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(secret: string) {
    const response = await apiRequest("POST", "/api/agency/login", { username, password: secret, product: "chiamo" });
    const result = await response.json();
    if (result.requiresPasswordChange) {
      setChangeToken(result.token);
      return;
    }
    if (!result.token) throw new Error("Sign-in did not return a valid session.");
    setPassword("");
    setNewPassword("");
    setConfirmation("");
    setChangeToken(null);
    queryClient.clear();
    localStorage.setItem("authToken", result.token);
    setCookie("authToken", result.token);
    persistTenantMetadata({ slug: result.tenant?.slug, name: result.tenant?.name });
    const previewBrand = new URLSearchParams(window.location.search).get("brand") === "chiamo";
    window.location.assign(previewBrand ? "/dashboard?brand=chiamo" : "/dashboard");
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
        const response = await fetch("/api/chiamo/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${changeToken}` },
          credentials: "include",
          body: JSON.stringify({ currentPassword: password, newPassword }),
        });
        if (!response.ok) {
          const data = await parseErrorResponse(response);
          throw new ApiError(response.status, data && typeof data === "object" && "message" in data
            ? String(data.message) : "Your password could not be changed.", data);
        }
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
            <p className="text-center text-sm text-slate-600">Need a password? Ask Global Admin to generate a temporary password for your username. No email is required.</p>}
        </form>
      </div>
    </main>
    <footer className="px-5 py-6 text-center text-sm text-slate-300">Chiamo Connect · Business VoIP phones</footer>
  </div>;
}