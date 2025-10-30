import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Fingerprint } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiCall, getApiBase } from "@/lib/api";
import { persistConsumerAuth } from "@/lib/consumer-auth";
import { biometricAuth } from "@/lib/biometric-auth";
import { pushNotificationService } from "@/lib/push-notifications";
import { Capacitor } from "@capacitor/core";

interface AgencyContext {
  slug: string;
  name: string;
  logoUrl: string | null;
}

export default function MobileAppLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [loading, setLoading] = useState(false);
  const [agencyContext, setAgencyContext] = useState<AgencyContext | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>("");
  const [debugInfo, setDebugInfo] = useState<string>("");

  // Check for deep link agency parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const agencySlug = params.get("agency");
    
    if (agencySlug) {
      // Fetch agency branding for pre-selected agency
      apiCall("GET", `/api/public/agency-branding?slug=${encodeURIComponent(agencySlug)}`)
        .then(res => res.json())
        .then(data => {
          setAgencyContext({
            slug: data.agencySlug || agencySlug,
            name: data.agencyName || agencySlug,
            logoUrl: data.logoUrl || null,
          });
        })
        .catch(() => {
          // Silent fail - just don't show agency branding
        });
    }
  }, []);

  // Check for biometric availability and saved credentials
  useEffect(() => {
    const checkBiometric = async () => {
      const result = await biometricAuth.isAvailable();
      
      if (result.isAvailable) {
        setBiometricAvailable(true);
        setBiometricType(biometricAuth.getBiometryTypeName(result.biometryType));
        
        // Check if we have saved credentials
        const savedEmail = localStorage.getItem('biometric_email');
        const savedDOB = localStorage.getItem('biometric_dob');
        
        if (savedEmail && savedDOB) {
          // Auto-fill the form
          setEmail(savedEmail);
          setDateOfBirth(savedDOB);
        }
      }
    };

    checkBiometric();

    // Initialize push notifications
    pushNotificationService.initialize().catch(err => {
      console.error('Failed to initialize push notifications:', err);
    });
  }, []);

  // Handle biometric login
  const handleBiometricLogin = async () => {
    const savedEmail = localStorage.getItem('biometric_email');
    const savedDOB = localStorage.getItem('biometric_dob');
    
    if (!savedEmail || !savedDOB) {
      toast({
        title: "No Saved Credentials",
        description: "Please sign in with email and date of birth first",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    // Debug: Capture API info
    const apiBase = getApiBase();
    const fullUrl = `${apiBase}/api/mobile/auth/verify`;
    setDebugInfo(`🔐 BIOMETRIC LOGIN\n🔍 CALLING: ${fullUrl}\n📱 Platform: ${Capacitor.getPlatform()}\n🌐 Protocol: ${window.location.protocol}\n📍 Hostname: ${window.location.hostname}`);

    try {
      // Perform biometric authentication
      const authResult = await biometricAuth.authenticate("Authenticate to sign in");
      
      if (!authResult.success) {
        setDebugInfo(prev => `${prev}\n❌ Biometric auth failed: ${authResult.error}`);
        throw new Error(authResult.error || "Biometric authentication failed");
      }
      
      setDebugInfo(prev => `${prev}\n✅ Biometric auth successful`);

      // If biometric succeeds, log in with saved credentials
      const response = await apiCall("POST", "/api/mobile/auth/verify", {
        email: savedEmail,
        dateOfBirth: savedDOB,
      });
      
      setDebugInfo(prev => `${prev}\n✅ Response received: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        // Safely parse error - check if response is JSON
        let errorMessage = "Login failed";
        const contentType = response.headers.get("content-type");
        
        setDebugInfo(prev => `${prev}\n📄 Content-Type: ${contentType}`);
        
        if (contentType && contentType.includes("application/json")) {
          try {
            const error = await response.json();
            errorMessage = error.message || errorMessage;
            setDebugInfo(prev => `${prev}\n❌ Error: ${errorMessage}`);
          } catch (e) {
            // JSON parse failed, use default message
            setDebugInfo(prev => `${prev}\n⚠️ JSON parse failed`);
          }
        } else {
          // Non-JSON response (likely HTML error page)
          const textError = await response.text();
          const preview = textError.substring(0, 200);
          setDebugInfo(prev => `${prev}\n❌ Non-JSON response:\n${preview}...`);
          console.error("Non-JSON error response:", textError);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.token && data.tenant) {
        persistConsumerAuth({
          session: {
            email: savedEmail,
            tenantSlug: data.tenant.slug,
            consumerData: data.consumer,
          },
          token: data.token,
        });

        // Register any pending push notification token
        await pushNotificationService.registerPendingToken();

        toast({
          title: "Welcome Back!",
          description: `Signed in with ${biometricType}`,
        });

        setLocation("/consumer-dashboard");
      }
    } catch (error: any) {
      setDebugInfo(prev => `${prev}\n💥 CATCH ERROR: ${error.message}\n📚 Stack: ${error.stack?.substring(0, 100)}`);
      toast({
        title: "Authentication Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !dateOfBirth) {
      toast({
        title: "Required Fields",
        description: "Please enter your email and date of birth",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    // Debug: Capture API info
    const apiBase = getApiBase();
    const fullUrl = `${apiBase}/api/mobile/auth/verify`;
    setDebugInfo(`🔍 CALLING: ${fullUrl}\n📱 Platform: ${Capacitor.getPlatform()}\n🌐 Protocol: ${window.location.protocol}\n📍 Hostname: ${window.location.hostname}`);

    try {
      const response = await apiCall("POST", "/api/mobile/auth/verify", {
        email,
        dateOfBirth,
      });
      
      setDebugInfo(prev => `${prev}\n✅ Response received: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        // Safely parse error - check if response is JSON
        let errorMessage = "Login failed";
        const contentType = response.headers.get("content-type");
        
        setDebugInfo(prev => `${prev}\n📄 Content-Type: ${contentType}`);
        
        if (contentType && contentType.includes("application/json")) {
          try {
            const error = await response.json();
            errorMessage = error.message || errorMessage;
            setDebugInfo(prev => `${prev}\n❌ Error: ${errorMessage}`);
          } catch (e) {
            // JSON parse failed, use default message
            setDebugInfo(prev => `${prev}\n⚠️ JSON parse failed`);
          }
        } else {
          // Non-JSON response (likely HTML error page)
          const textError = await response.text();
          const preview = textError.substring(0, 200);
          setDebugInfo(prev => `${prev}\n❌ Non-JSON response:\n${preview}...`);
          console.error("Non-JSON error response:", textError);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.multipleAgencies && data.agencies?.length > 0) {
        // Show agency selection
        toast({
          title: "Select Your Agency",
          description: "Your account is linked to multiple agencies",
        });
        // TODO: Show agency picker
        return;
      }

      if (data.token && data.tenant) {
        // Store auth and redirect
        persistConsumerAuth({
          session: {
            email,
            tenantSlug: data.tenant.slug,
            consumerData: data.consumer,
          },
          token: data.token,
        });

        // Save credentials for biometric authentication
        if (biometricAvailable) {
          localStorage.setItem('biometric_email', email);
          localStorage.setItem('biometric_dob', dateOfBirth);
        }

        // Register any pending push notification token
        await pushNotificationService.registerPendingToken();

        setLocation("/consumer-dashboard");
      }
    } catch (error: any) {
      setDebugInfo(prev => `${prev}\n💥 CATCH ERROR: ${error.message}\n📚 Stack: ${error.stack?.substring(0, 100)}`);
      toast({
        title: "Login Failed",
        description: error.message || "Please check your credentials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white p-4">
      {/* Debug Panel */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/90 text-green-400 p-4 text-xs font-mono border-b border-green-500/50 max-h-64 overflow-y-auto">
        <div className="font-bold mb-2">🔧 DEBUG MODE</div>
        <div className="whitespace-pre-wrap">
          API Base: {getApiBase()}
          {'\n'}Platform: {Capacitor.getPlatform()}
          {'\n'}Protocol: {typeof window !== 'undefined' ? window.location.protocol : 'N/A'}
          {'\n'}isNative: {Capacitor.isNativePlatform() ? 'YES' : 'NO'}
          {debugInfo && `\n\n${debugInfo}`}
        </div>
      </div>
      
      {/* Background gradients */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-8 mt-72">
        {/* Agency Logo */}
        {agencyContext?.logoUrl ? (
          <div className="flex justify-center">
            <img
              src={agencyContext.logoUrl}
              alt={agencyContext.name}
              className="h-20 w-auto object-contain"
              data-testid="img-agency-logo"
            />
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
              <span className="text-3xl font-bold text-white">C</span>
            </div>
          </div>
        )}

        {/* Welcome Text */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white" data-testid="text-welcome-title">
            {agencyContext ? `Welcome to ${agencyContext.name}` : "Welcome"}
          </h1>
          <p className="text-blue-100/70" data-testid="text-welcome-subtitle">
            {agencyContext ? "Sign in to access your account" : "Find your agency and sign in"}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-8 shadow-2xl shadow-blue-900/30">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="h-12 text-base bg-white/5 border-white/10 text-white placeholder:text-white/50"
                data-testid="input-email"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dob" className="text-white">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                disabled={loading}
                className="h-12 text-base bg-white/5 border-white/10 text-white"
                data-testid="input-dateofbirth"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full text-base font-semibold bg-emerald-500 hover:bg-emerald-400 text-white"
            data-testid="button-signin"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Signing In...
              </>
            ) : (
              "Sign In"
            )}
          </Button>

          {/* Biometric Login Button */}
          {biometricAvailable && localStorage.getItem('biometric_email') && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white/5 px-2 text-blue-100/70">Or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleBiometricLogin}
                disabled={loading}
                className="h-12 w-full text-base font-semibold border-2 border-white/20 text-white hover:bg-white/10"
                data-testid="button-biometric-login"
              >
                <Fingerprint className="mr-2 h-5 w-5" />
                Sign in with {biometricType}
              </Button>
            </>
          )}
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-blue-100/70">
          Need help? Contact your agency
        </p>
      </div>
    </div>
  );
}
