import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { getAgencySlugFromRequest } from "@shared/utils/subdomain";
import PublicHeroLayout from "@/components/public-hero-layout";
import {
  AgencyContext,
  ConsumerLoginResult,
  LoginForm,
  LoginMutationPayload,
  handleLoginResult,
  retryLoginWithAgencySelection,
  storeAgencyContext,
} from "./consumer-login-helpers";
import {
  clearConsumerAuth,
  persistConsumerAuth,
} from "@/lib/consumer-auth";

export default function ConsumerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<LoginForm>({
    email: "",
    dateOfBirth: "",
    agreeToSms: false,
  });
  const [agencyContext, setAgencyContext] = useState<AgencyContext | null>(null);
  const [pendingAgencies, setPendingAgencies] = useState<AgencyContext[]>([]);
  const [agencyDialogOpen, setAgencyDialogOpen] = useState(false);
  const [selectedAgencySlug, setSelectedAgencySlug] = useState<string | null>(null);

  const currentSlug = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return getAgencySlugFromRequest(window.location.hostname, window.location.pathname);
  }, []);

  const persistAgencyContext = useCallback((context: AgencyContext) => {
    setAgencyContext(context);
    if (typeof window === "undefined") {
      return;
    }

    storeAgencyContext(context, {
      session: window.sessionStorage,
      local: window.localStorage,
    });
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
    if (typeof window === "undefined") {
      return;
    }

    // Attempt to hydrate from storage first
    const readStoredContext = () => {
      const storageReaders: Array<() => Storage | null> = [
        () => {
          try {
            return window.sessionStorage;
          } catch (error) {
            console.warn("Unable to access sessionStorage while reading agency context", error);
            return null;
          }
        },
        () => {
          try {
            return window.localStorage;
          } catch (error) {
            console.warn("Unable to access localStorage while reading agency context", error);
            return null;
          }
        },
      ];

      for (const getStorage of storageReaders) {
        const storage = getStorage();
        if (!storage) continue;
        try {
          const value = storage.getItem("agencyContext");
          if (value) {
            return value;
          }
        } catch (error) {
          console.warn("Failed to read agency context from storage", error);
        }
      }

      return null;
    };

    const storedContext = readStoredContext();
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    const tenantParam = params.get("tenant");

    if (emailParam) {
      setForm(prev => ({
        ...prev,
        email: emailParam,
      }));
    }

    if (tenantParam && tenantParam !== agencyContext?.slug) {
      fetchAgencyContext(tenantParam);
    }
  }, [agencyContext?.slug, fetchAgencyContext]);

  const processLoginResult = useCallback(
    (payload: ConsumerLoginResult) =>
      handleLoginResult(payload, {
        email: form.email,
        showToast: toast,
        setPendingAgencies,
        setAgencyDialogOpen,
        setLocation,
      }),
    [form.email, setLocation, setAgencyDialogOpen, setPendingAgencies, toast],
  );

  const loginMutation = useMutation({
    mutationFn: async (loginData: LoginMutationPayload) => {
      // Get tenant slug from URL path (e.g., /waypoint-solutions/consumer)
      const slugFromUrl = currentSlug;
      const tenantSlug = loginData.tenantSlug || slugFromUrl || agencyContext?.slug;

      // Send email and dateOfBirth for consumer verification
      const response = await fetch("/api/consumer/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: loginData.email,
          dateOfBirth: loginData.dateOfBirth,
          tenantSlug
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new ApiError(
          response.status, 
          errorData.message || `Login failed: ${response.status}`,
          errorData
        );
      }
      
      return response.json();
    },
    onSuccess: (data: ConsumerLoginResult & {
      token?: string;
      tenant?: {
        slug: string;
        name?: string | null;
        logoUrl?: string | null;
      } | null;
      consumer?: unknown;
    }) => {
      // Clear any old cached data first
      clearConsumerAuth();

      if (processLoginResult(data)) {
        return;
      }

      {
        // Successful login
        toast({
          title: "Login Successful",
          description: "Welcome to your account portal!",
        });

        setPendingAgencies([]);
        setAgencyDialogOpen(false);
        setSelectedAgencySlug(null);
        
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
        
        const { sessionStored, tokenStored } = persistConsumerAuth({
          session: {
            email: form.email,
            tenantSlug: data.tenant.slug,
            consumerData: data.consumer,
          },
          token: data.token,
        });

        if (!sessionStored || !tokenStored) {
          toast({
            title: "Browser Storage Blocked",
            description: "We couldn't save your login details. Please enable cookies or storage access and try again.",
            variant: "destructive",
          });
          return;
        }

        persistAgencyContext({
          slug: data.tenant.slug,
          name: data.tenant.name ?? data.tenant.slug,
          logoUrl: data.tenant.logoUrl ?? null,
        });

        // Force a hard redirect to clear any cached state
        window.location.href = "/consumer-dashboard";
      }
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          const payload = error.data;
          if (payload && typeof payload === "object") {
            const handled = processLoginResult(payload as ConsumerLoginResult);
            if (handled) {
              return;
            }
          }
        }

        if (error.status === 404) {
          // No account found
          toast({
            title: "No Account Found",
            description:
              error.data && typeof error.data === "object" && "message" in error.data
                ? String((error.data as Record<string, unknown>).message)
                : "No account found with this email. Please contact your agency for account details.",
            variant: "destructive",
          });
          return;
        }

        if (error.status === 401) {
          // Invalid credentials
          toast({
            title: "Invalid Credentials",
            description: "Please check your email and date of birth.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Login Failed",
          description: error.message || "Unable to verify your information. Please check your details and try again.",
          variant: "destructive",
        });
        return;
      }

      const fallbackMessage =
        error && typeof error === "object" && "message" in error
          ? String((error as Record<string, unknown>).message)
          : "Unable to verify your information. Please check your details and try again.";

      toast({
        title: "Login Failed",
        description: fallbackMessage,
        variant: "destructive",
      });
    },
  });

  const handleInputChange = <K extends keyof LoginForm>(field: K, value: LoginForm[K]) => {
    setForm(prev => ({
      ...prev,
      [field]: value,
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

    if (!form.agreeToSms) {
      toast({
        title: "SMS Consent Required",
        description: "Please confirm you agree to receive text messages before signing in.",
        variant: "destructive",
      });
      return;
    }

    loginMutation.mutate(form);
  };

  const handleAgencySelection = useCallback(
    async (agency: AgencyContext) => {
      setSelectedAgencySlug(agency.slug);
      try {
        await retryLoginWithAgencySelection(
          agency,
          form,
          payload => loginMutation.mutateAsync(payload),
          persistAgencyContext
        );
      } finally {
        setSelectedAgencySlug(null);
      }
    },
    [form, loginMutation, persistAgencyContext]
  );

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

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="agreeToSms"
                data-testid="checkbox-agreeToSms"
                checked={form.agreeToSms}
                onCheckedChange={checked => handleInputChange("agreeToSms", checked === true)}
                className="mt-1 h-5 w-5 rounded-md border-white/40"
              />
              <div className="space-y-2 text-xs text-blue-100/80">
                <Label htmlFor="agreeToSms" className="text-sm font-semibold text-white">
                  I agree to receive SMS account updates *
                </Label>
                <p>
                  By continuing, I confirm that I am the authorized user of this phone number and consent to receive
                  account-related text messages. Message and data rates may apply. Reply STOP to opt out at any time.
                </p>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="h-12 w-full rounded-full bg-blue-500 text-base font-medium text-white transition hover:bg-blue-400"
            disabled={loginMutation.isPending || !form.agreeToSms}
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

        <Dialog open={agencyDialogOpen} onOpenChange={setAgencyDialogOpen}>
          <DialogContent className="bg-slate-900 text-white">
            <DialogHeader>
              <DialogTitle>Select an agency</DialogTitle>
              <DialogDescription className="text-blue-100/80">
                We found multiple agencies associated with {form.email}. Pick the one you want to open.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-3" data-testid="agency-selection-list">
              {pendingAgencies.map(agency => (
                <button
                  key={agency.slug}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
                  onClick={() => handleAgencySelection(agency)}
                  disabled={loginMutation.isPending && selectedAgencySlug === agency.slug}
                  data-testid={`agency-option-${agency.slug}`}
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{agency.name}</p>
                    <p className="text-xs text-blue-100/60">{agency.slug}</p>
                  </div>
                  <span className="text-xs font-medium text-blue-200">
                    {selectedAgencySlug === agency.slug && loginMutation.isPending
                      ? "Connecting..."
                      : "Choose"}
                  </span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

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