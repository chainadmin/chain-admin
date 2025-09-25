import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Mail, Lock, ArrowRight, ShieldCheck, UserCheck } from "lucide-react";
import { getAgencySlugFromRequest } from "@shared/utils/subdomain";
import PublicHeroLayout from "@/components/public-hero-layout";

type AgencyContext = {
  slug: string;
  name: string;
  logoUrl: string | null;
};

interface LoginForm {
  email: string;
  dateOfBirth: string;
}

export default function ConsumerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<LoginForm>({
    email: "",
    dateOfBirth: "",
  });
  const [agencyContext, setAgencyContext] = useState<AgencyContext | null>(null);

  const currentSlug = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return getAgencySlugFromRequest(window.location.hostname, window.location.pathname);
  }, []);

  const persistAgencyContext = useCallback((context: AgencyContext) => {
    setAgencyContext(context);
    try {
      sessionStorage.setItem("agencyContext", JSON.stringify(context));
    } catch (error) {
      console.error("Failed to persist agency context", error);
    }
  }, []);

  const fetchAgencyContext = useCallback(async (slug: string) => {
    try {
      const response = await apiRequest(
        "GET",
        `/api/public/agency-branding?slug=${encodeURIComponent(slug)}`
      );
      const data = await response.json();
      persistAgencyContext({
        slug: data.agencySlug ?? slug,
        name: data.agencyName ?? slug,
        logoUrl: data.logoUrl ?? null,
      });
    } catch (error) {
      console.error("Failed to load agency branding", error);
      // Store a minimal context so the login page still reflects the agency
      persistAgencyContext({
        slug,
        name: slug,
        logoUrl: null,
      });
    }
  }, [persistAgencyContext]);

  useEffect(() => {
    // Attempt to hydrate from session storage first
    const storedContext = sessionStorage.getItem("agencyContext");
    let parsedContext: AgencyContext | null = null;

    if (storedContext) {
      try {
        parsedContext = JSON.parse(storedContext) as AgencyContext;
      } catch (error) {
        console.error("Error parsing stored agency context", error);
      }
    }

    if (parsedContext) {
      persistAgencyContext(parsedContext);
    }

    if (currentSlug) {
      const shouldFetch = !parsedContext || parsedContext.slug !== currentSlug;
      if (shouldFetch) {
        fetchAgencyContext(currentSlug);
      }
    }
  }, [currentSlug, fetchAgencyContext, persistAgencyContext]);

  const loginMutation = useMutation({
    mutationFn: async (loginData: LoginForm) => {
      // Get tenant slug from URL path (e.g., /waypoint-solutions/consumer)
      const slugFromUrl = currentSlug;
      const tenantSlug = slugFromUrl || agencyContext?.slug;

      // Send email and dateOfBirth for consumer verification
      const response = await apiRequest("POST", "/api/consumer/login", {
        email: loginData.email,
        dateOfBirth: loginData.dateOfBirth,
        tenantSlug
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      // Clear any old cached data first
      localStorage.removeItem("consumerToken");
      localStorage.removeItem("consumerSession");
      
      if (data.multipleAgencies) {
        // Consumer has accounts with multiple agencies
        toast({
          title: "Multiple Agencies Found",
          description: data.message,
        });
        // TODO: Show agency selection UI
        // For now, auto-select the first agency
        const firstAgency = data.agencies[0];
        toast({
          title: "Selecting Agency",
          description: `Logging into ${firstAgency.name}`,
        });
        // Re-submit with specific agency
        // This would need a separate endpoint or modification
      } else if (data.needsRegistration) {
        // User found but needs to complete registration
        toast({
          title: "Complete Registration",
          description: data.message,
        });
        setLocation(`/consumer-register?email=${form.email}&tenant=${data.tenant.slug}`);
      } else if (data.needsAgencyLink) {
        // User exists but not linked to an agency
        toast({
          title: "Agency Link Required",
          description: data.message,
        });
        // Redirect to registration with email pre-filled
        setLocation(`/consumer-register?email=${form.email}`);
      } else {
        // Successful login
        toast({
          title: "Login Successful", 
          description: "Welcome to your account portal!",
        });
        
        // Ensure we have required data
        if (!data.token || !data.tenant?.slug) {
          console.error("Missing token or tenant data:", data);
          toast({
            title: "Login Error",
            description: "Invalid response from server. Please try again.",
            variant: "destructive",
          });
          return;
        }
        
        // Store consumer session data and token
        localStorage.setItem("consumerSession", JSON.stringify({
          email: form.email,
          tenantSlug: data.tenant.slug,
          consumerData: data.consumer,
        }));
        
        // Store the token for authenticated requests
        localStorage.setItem("consumerToken", data.token);
        
        // Force a hard redirect to clear any cached state
        window.location.href = '/consumer-dashboard';
      }
    },
    onError: (error: any) => {
      if (error.status === 404) {
        // No account found
        toast({
          title: "No Account Found",
          description: error.data?.message || "No account found with this email. Please contact your agency for account details.",
          variant: "destructive",
        });
      } else if (error.status === 401) {
        // Invalid credentials
        toast({
          title: "Invalid Credentials",
          description: "Please check your email and date of birth.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Login Failed",
          description: error.message || "Unable to verify your information. Please check your details and try again.",
          variant: "destructive",
        });
      }
    },
  });

  const handleInputChange = (field: keyof LoginForm, value: string) => {
    setForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.email || !form.dateOfBirth) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    loginMutation.mutate(form);
  };

  return (
    <PublicHeroLayout
      badgeText="Secure consumer access"
      title={agencyContext ? `Welcome back to ${agencyContext.name}` : "Access your account"}
      description={
        agencyContext
          ? "Verify your information to review balances, download documents, and stay in touch with your agency."
          : "Log in to review balances, download documents, and stay ahead of every update in one connected hub."
      }
      supportingContent={(
        <>
          <div className="text-base text-blue-100/80">
            Enter the email address on file and your date of birth. We'll securely match you with the right agency and guide you to your information.
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
                <Lock className="h-5 w-5 text-blue-200" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">Protected verification</p>
                <p className="text-sm text-blue-100/70">Bank-level encryption and identity checks keep every login secure.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
                <ShieldCheck className="h-5 w-5 text-blue-200" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">Stay connected</p>
                <p className="text-sm text-blue-100/70">Get account alerts, request support, and collaborate with your agency.</p>
              </div>
            </div>
          </div>
        </>
      )}
      headerActions={(
        <>
          <Button
            variant="ghost"
            className="text-blue-100 hover:bg-white/10"
            onClick={() => (window.location.href = "/")}
          >
            Home
          </Button>
          <Button
            className="bg-blue-500 hover:bg-blue-400"
            onClick={() => setLocation("/consumer-register")}
          >
            Create account
          </Button>
        </>
      )}
      showDefaultHeaderActions={false}
      contentClassName="p-8 sm:p-10"
    >
      <div className="space-y-8 text-left">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-blue-200">Consumer portal</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Sign in to continue</h2>
            <p className="mt-3 text-sm text-blue-100/70">
              Provide your details below to access your dashboard and manage every account in one place.
            </p>
          </div>
          <div className="hidden h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 sm:flex">
            <UserCheck className="h-6 w-6 text-blue-200" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-blue-100">
              Email address
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200/70" />
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder="you@example.com"
                className="h-12 rounded-2xl border-white/20 bg-slate-900/60 pl-12 text-base text-white placeholder:text-blue-100/50 focus-visible:ring-blue-400"
                data-testid="input-consumer-email"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dob" className="text-sm font-medium text-blue-100">
              Date of birth
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200/70" />
              <Input
                id="dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                className="h-12 rounded-2xl border-white/20 bg-slate-900/60 pl-12 text-base text-white placeholder:text-blue-100/50 focus-visible:ring-blue-400"
                data-testid="input-date-of-birth"
                required
              />
            </div>
            <p className="text-xs text-blue-100/60">We use this information only to confirm your identity.</p>
          </div>

          <Button
            type="submit"
            className="h-12 w-full rounded-full bg-blue-500 text-base font-medium text-white transition hover:bg-blue-400"
            disabled={loginMutation.isPending}
            data-testid="button-consumer-login"
          >
            {loginMutation.isPending ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                Verifying
              </>
            ) : (
              <>
                Access your account
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-blue-100/70">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/20">
              <Building2 className="h-5 w-5 text-blue-200" />
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-white">Need to register instead?</p>
              <p>
                New to the portal? We’ll guide you through finding your accounts and verifying your information in just a minute.
              </p>
              <button
                onClick={() => setLocation("/consumer-register")}
                className="text-sm font-medium text-blue-200 transition hover:text-white"
                data-testid="link-register"
              >
                Start registration
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-blue-100/60">
          <div className="flex items-center gap-3">
            <a href="/terms-of-service" className="transition hover:text-white hover:underline">
              Terms of Service
            </a>
            <span>•</span>
            <a href="/privacy-policy" className="transition hover:text-white hover:underline">
              Privacy Policy
            </a>
          </div>
          <p>Secure access powered by Chain Software Group</p>
        </div>
      </div>
    </PublicHeroLayout>
  );
}