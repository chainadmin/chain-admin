import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { persistConsumerAuth, getStoredConsumerToken, getStoredConsumerSession, clearConsumerAuth } from "@/lib/consumer-auth";

export default function TestConsumerFlow() {
  const [email, setEmail] = useState("test@test.com");
  const [dateOfBirth, setDateOfBirth] = useState("1992-10-10");
  const [tenantSlug, setTenantSlug] = useState("waypoint-solutions");
  const [loginResult, setLoginResult] = useState<any>(null);
  const [accountData, setAccountData] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [storedToken, setStoredToken] = useState<string | null>(null);
  const [storedSession, setStoredSession] = useState<any>(null);

  const testLogin = async () => {
    setError("");
    try {
      const response = await apiRequest("POST", "/api/consumer/login", {
        email,
        dateOfBirth,
        tenantSlug
      });
      
      const data = await response.json();
      setLoginResult(data);
      
      if (data.token) {
        // Store the auth data
        persistConsumerAuth({
          token: data.token,
          session: {
            email: data.consumer.email,
            tenantSlug: data.tenantSlug,
            consumerData: data.consumer
          }
        });
        
        // Immediately check if it was stored
        const token = getStoredConsumerToken();
        const session = getStoredConsumerSession();
        setStoredToken(token);
        setStoredSession(session);
        
        console.log('Auth stored - token:', token?.substring(0, 20) + '...', 'session:', session);
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  };

  const testFetchAccounts = async () => {
    setError("");
    try {
      const token = getStoredConsumerToken();
      const session = getStoredConsumerSession();
      
      if (!token || !session) {
        setError("No token or session found");
        return;
      }
      
      const response = await fetch(`/api/consumer/accounts/${encodeURIComponent(session.email)}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to fetch: ${response.status} - ${errorData}`);
      }
      
      const data = await response.json();
      setAccountData(data);
    } catch (err: any) {
      setError(err.message || "Fetch failed");
    }
  };

  const clearAuth = () => {
    clearConsumerAuth();
    setLoginResult(null);
    setAccountData(null);
    setStoredToken(null);
    setStoredSession(null);
    setError("");
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Test Consumer Flow</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Login</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              placeholder="Date of Birth (YYYY-MM-DD)"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
            <Input
              placeholder="Tenant Slug"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
            />
            <Button onClick={testLogin} className="w-full">Test Login</Button>
            {loginResult && (
              <div className="text-sm">
                <p className="font-semibold">Login Result:</p>
                <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">
                  {JSON.stringify(loginResult, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Step 2: Storage Check</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <p><strong>Stored Token:</strong> {storedToken ? storedToken.substring(0, 30) + '...' : 'None'}</p>
              <p><strong>Stored Session:</strong></p>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">
                {JSON.stringify(storedSession, null, 2)}
              </pre>
            </div>
            <Button onClick={() => {
              setStoredToken(getStoredConsumerToken());
              setStoredSession(getStoredConsumerSession());
            }} variant="outline" className="w-full">
              Refresh Storage Check
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Step 3: Fetch Accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={testFetchAccounts} className="w-full">Test Fetch Accounts</Button>
            {accountData && (
              <div className="text-sm">
                <p className="font-semibold">Account Data:</p>
                <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">
                  {JSON.stringify(accountData, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={clearAuth} variant="destructive" className="w-full">
              Clear Auth & Reset
            </Button>
            {error && (
              <div className="text-red-600 text-sm">
                <p className="font-semibold">Error:</p>
                <p>{error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}