import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Shield,
  Sparkles,
} from "lucide-react";
import chainLogo from "@/assets/chain-logo.png";
import { getAgencySlugFromRequest } from "@shared/utils/subdomain";
import { resolvePolicyContent } from "./agency-policy-utils";

interface AgencyBranding {
  agencyName: string;
  agencySlug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  contactEmail: string | null;
  contactPhone: string | null;
  hasPrivacyPolicy: boolean;
  hasTermsOfService: boolean;
  privacyPolicy?: string | null;
  termsOfService?: string | null;
}

export default function AgencyLanding() {
  const { agencySlug: pathSlug } = useParams();
  const [, setLocation] = useLocation();

  let agencySlug = pathSlug;

  if (!agencySlug) {
    const hostname = window.location.hostname;
    if (hostname.includes("chainsoftwaregroup.com")) {
      const extractedSlug = getAgencySlugFromRequest(hostname, window.location.pathname);
      agencySlug = extractedSlug || undefined;
    }
  }

  if (!agencySlug) {
    agencySlug = "waypoint-solutions";
  }

  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);

  const fallbackBranding = useMemo<AgencyBranding>(() => {
    const resolvedSlug = agencySlug || "waypoint-solutions";
    const fallbackName = resolvedSlug === "waypoint-solutions" ? "Waypoint Solutions" : "Chain Partner";

    return {
      agencyName: fallbackName,
      agencySlug: resolvedSlug,
      logoUrl: null,
      primaryColor: "#2563eb",
      secondaryColor: "#4f46e5",
      contactEmail: "support@chainsoftwaregroup.com",
      contactPhone: null,
      hasPrivacyPolicy: false,
      hasTermsOfService: false,
      privacyPolicy: "",
      termsOfService: "",
    };
  }, [agencySlug]);

  const { data: agencyData, isLoading: agencyLoading, error } = useQuery<AgencyBranding>({
    queryKey: [`/api/public/agency-branding?slug=${agencySlug}`],
    enabled: !!agencySlug,
    retry: 1,
  });

  const resolvedBranding = agencyData ?? fallbackBranding;

  useEffect(() => {
    if (agencyData) {
      sessionStorage.setItem(
        "agencyContext",
        JSON.stringify({
          slug: agencyData.agencySlug,
          name: agencyData.agencyName,
          logoUrl: agencyData.logoUrl,
        }),
      );
    } else if (!agencyLoading && fallbackBranding) {
      sessionStorage.setItem(
        "agencyContext",
        JSON.stringify({
          slug: fallbackBranding.agencySlug,
          name: fallbackBranding.agencyName,
          logoUrl: fallbackBranding.logoUrl,
        }),
      );
    }
  }, [agencyData, agencyLoading, fallbackBranding]);

  const { termsContent, privacyContent, hasTermsContent, hasPrivacyContent } = resolvePolicyContent({
    primary: agencyData
      ? {
          termsOfService: agencyData.termsOfService,
          privacyPolicy: agencyData.privacyPolicy,
        }
      : undefined,
    fallback: fallbackBranding,
  });

  useEffect(() => {
    if (!hasTermsContent && showTermsDialog) {
      setShowTermsDialog(false);
    }

    if (!hasPrivacyContent && showPrivacyDialog) {
      setShowPrivacyDialog(false);
    }
  }, [hasTermsContent, hasPrivacyContent, showTermsDialog, showPrivacyDialog]);

  const handleFindBalance = () => {
    // Check if we're on a path-based agency route (e.g., /waypoint-solutions/)
    const currentPath = window.location.pathname;
    if (agencySlug && currentPath.startsWith(`/${agencySlug}/`)) {
      // We're on a path-based agency route, navigate within that context
      setLocation(`/${agencySlug}/consumer-login`);
    } else {
      // Standard navigation
      setLocation("/consumer-login");
    }
  };

  if (agencyLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full border-2 border-blue-500 border-b-transparent animate-spin" />
          <p className="text-sm text-blue-100/80">Loading your branded portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    console.warn("Agency branding failed to load, using fallback", error);
  }

  const accentColor = resolvedBranding.primaryColor || "#2563eb";
  const accentSecondary = resolvedBranding.secondaryColor || "#4f46e5";
  const accentGradient = {
    background: `linear-gradient(135deg, ${accentColor}, ${accentSecondary})`,
  };

  const featureCards = [
    {
      icon: CreditCard,
      title: "Frictionless payments",
      description:
        "Make secure one-time payments or set up convenient plans with just a few taps—day or night.",
    },
    {
      icon: MessageSquare,
      title: "Stay informed",
      description:
        "Track balances, download documents, and receive updates instantly so there are no surprises.",
    },
    {
      icon: Shield,
      title: "Built to protect",
      description:
        "Bank-level encryption, verified access, and security protocols that keep your information private.",
    },
  ];

  const steps = [
    {
      title: "Verify your details",
      description: "Use your account information to securely locate your records in seconds.",
    },
    {
      title: "Review everything",
      description: `See balances, statements, and payment options from ${resolvedBranding.agencyName} in one place.`,
    },
    {
      title: "Take the next step",
      description: "Submit a payment, explore plans, or reach out for help without waiting on hold.",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-80 w-80 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[26rem] w-[26rem] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <div className="relative">
        <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <img
                  src={resolvedBranding.logoUrl || chainLogo}
                  alt={resolvedBranding.agencyName}
                  className="h-8 w-auto"
                />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-blue-200/80">Secure portal</p>
                <p className="text-lg font-semibold text-white">{resolvedBranding.agencyName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                className="text-blue-100 hover:bg-white/10"
                onClick={handleFindBalance}
                data-testid="link-sign-in"
              >
                Sign in
              </Button>
              <Button
                className="rounded-full bg-blue-500 px-6 text-white hover:bg-blue-400"
                onClick={() => setLocation(`/consumer-register/${resolvedBranding.agencySlug}`)}
                data-testid="button-register"
              >
                Create account
              </Button>
            </div>
          </div>
        </header>

        <main className="px-6 py-12 sm:py-20">
          <section className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <Badge
                variant="outline"
                className="border-blue-400/50 bg-blue-500/10 text-blue-100"
              >
                Powered by Chain Software Group
              </Badge>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {resolvedBranding.agencyName} gives you a smarter way to stay current
              </h1>
              <p className="mt-6 max-w-xl text-lg text-blue-100/80">
                Access your secure portal to review balances, explore payment plans, and stay in control every step of the way.
                Available 24/7 from any device.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Button
                  size="lg"
                  className="h-12 rounded-full bg-blue-500 px-8 text-base font-medium hover:bg-blue-400"
                  onClick={handleFindBalance}
                  data-testid="button-find-balance"
                >
                  Find my balance
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-white/30 bg-white/5 px-8 text-base text-white hover:bg-white/10"
                  onClick={() => setLocation(`/consumer-register/${resolvedBranding.agencySlug}`)}
                  data-testid="button-consumer-register"
                >
                  Create an account
                </Button>
              </div>

              <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card className="border-white/10 bg-white/5 backdrop-blur">
                  <CardContent className="flex h-full flex-col justify-between gap-2 p-5">
                    <p className="text-sm uppercase tracking-wide text-blue-200/80">Fast access</p>
                    <p className="text-3xl font-semibold text-white">60 seconds</p>
                    <p className="text-xs text-blue-100/70">Average time to locate your account</p>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/5 backdrop-blur">
                  <CardContent className="flex h-full flex-col justify-between gap-2 p-5">
                    <p className="text-sm uppercase tracking-wide text-blue-200/80">Always available</p>
                    <p className="text-3xl font-semibold text-white">24/7</p>
                    <p className="text-xs text-blue-100/70">Manage balances from any device</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-6 -right-6 h-32 w-32 rounded-full bg-blue-500/20 blur-3xl" />
              <Card className="border-white/10 bg-white/10 backdrop-blur">
                <CardContent className="space-y-6 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-100/70">Enterprise-grade protection</p>
                      <p className="text-2xl font-semibold text-white">Secure by design</p>
                    </div>
                    <Shield className="h-10 w-10 text-blue-200" />
                  </div>
                  <div className="space-y-4 text-sm text-blue-100/80">
                    <p className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-blue-300" />
                      Bank-level encryption safeguards every payment and update.
                    </p>
                    <p className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-blue-300" />
                      Two-factor verification keeps your profile and balances private.
                    </p>
                    <p className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-blue-300" />
                      Real people ready to help when you need a hand.
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                    <p className="text-sm text-blue-100/80">
                      {`"The ${resolvedBranding.agencyName} portal powered by Chain makes it simple. I can review everything and confirm my payments without waiting on hold."`}
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-wide text-blue-200">Verified consumer feedback</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mx-auto mt-20 max-w-6xl">
            <div className="grid gap-6 md:grid-cols-3">
              {featureCards.map((feature) => (
                <Card key={feature.title} className="border-white/10 bg-slate-900/60 backdrop-blur">
                  <CardContent className="space-y-3 p-6">
                    <feature.icon className="h-10 w-10 text-blue-300" />
                    <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                    <p className="text-sm text-blue-100/80">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="mx-auto mt-20 max-w-5xl rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <h2 className="text-3xl font-semibold text-white">Know exactly what to expect</h2>
                <p className="mt-3 text-base text-blue-100/80">
                  The portal guides you through every step so you can get answers fast and stay confident about what comes next.
                </p>
              </div>
              <Sparkles className="hidden h-20 w-20 text-blue-200 lg:block" />
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.title} className="rounded-2xl border border-white/10 bg-slate-950/60 p-6">
                  <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-3 text-sm text-blue-100/80">{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto mt-20 grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-white/10 bg-slate-900/60 backdrop-blur">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-500/20 p-2" style={accentGradient}>
                    <Lock className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-blue-100/70">Private &amp; protected</p>
                    <p className="text-xl font-semibold text-white">Security that matches your expectations</p>
                  </div>
                </div>
                <p className="text-sm text-blue-100/80">
                  Every interaction is encrypted end-to-end. Only verified consumers can access account details, and every payment is tokenized to keep your data secure.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-blue-100/80">
                    <p className="font-medium text-white">Instant notifications</p>
                    <p className="mt-1 text-xs text-blue-100/70">Get updates the moment something changes.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-blue-100/80">
                    <p className="font-medium text-white">Flexible options</p>
                    <p className="mt-1 text-xs text-blue-100/70">Explore plans tailored to your situation.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardContent className="space-y-5 p-6">
                <div className="flex items-center gap-3">
                  <Clock className="h-6 w-6 text-blue-200" />
                  <div>
                    <p className="text-sm text-blue-100/70">Need assistance?</p>
                    <p className="text-xl font-semibold text-white">We're here for you</p>
                  </div>
                </div>
                <p className="text-sm text-blue-100/80">
                  Whether you have a question about your balance or want to talk through options, we're only a tap away.
                </p>
                <div className="space-y-3 text-sm text-blue-100/80">
                  {resolvedBranding.contactEmail && (
                    <button
                      onClick={() => (window.location.href = `mailto:${resolvedBranding.contactEmail}`)}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-left transition hover:bg-slate-900"
                      data-testid="link-contact-email"
                    >
                      <span className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-blue-200" />
                        {resolvedBranding.contactEmail}
                      </span>
                      <ArrowRight className="h-4 w-4 text-blue-200" />
                    </button>
                  )}
                  {resolvedBranding.contactPhone && (
                    <button
                      onClick={() => (window.location.href = `tel:${resolvedBranding.contactPhone}`)}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-left transition hover:bg-slate-900"
                      data-testid="link-contact-phone"
                    >
                      <span className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-blue-200" />
                        {resolvedBranding.contactPhone}
                      </span>
                      <ArrowRight className="h-4 w-4 text-blue-200" />
                    </button>
                  )}
                  {!resolvedBranding.contactEmail && !resolvedBranding.contactPhone && (
                    <p className="rounded-xl border border-dashed border-white/20 bg-slate-950/60 p-4 text-center text-xs text-blue-100/70">
                      {`Contact information will appear here once provided by ${resolvedBranding.agencyName}.`}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        </main>

        <footer className="border-t border-white/10 bg-slate-950/70 py-10">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 text-sm text-blue-100/70 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-blue-100/80">© {new Date().getFullYear()} {resolvedBranding.agencyName}. All rights reserved.</p>
              <p className="text-xs text-blue-100/60">Powered by Chain Software Group</p>
            </div>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleFindBalance}
                className="transition-colors hover:text-blue-200"
                data-testid="link-account-summary"
              >
                Account summary
              </button>
              {hasTermsContent && (
                <button
                  onClick={() => setShowTermsDialog(true)}
                  className="transition-colors hover:text-blue-200"
                  data-testid="link-terms"
                >
                  Terms of Service
                </button>
              )}
              {hasPrivacyContent && (
                <button
                  onClick={() => setShowPrivacyDialog(true)}
                  className="transition-colors hover:text-blue-200"
                  data-testid="link-privacy"
                >
                  Privacy Policy
                </button>
              )}
              {(resolvedBranding.contactEmail || resolvedBranding.contactPhone) && (
                <button
                  onClick={() => {
                    if (resolvedBranding.contactEmail) {
                      window.location.href = `mailto:${resolvedBranding.contactEmail}`;
                    } else if (resolvedBranding.contactPhone) {
                      window.location.href = `tel:${resolvedBranding.contactPhone}`;
                    }
                  }}
                  className="transition-colors hover:text-blue-200"
                  data-testid="link-contact"
                >
                  Contact us
                </button>
              )}
              <button
                onClick={() => setLocation("/agency-login")}
                className="transition-colors hover:text-blue-200"
                data-testid="link-agency-login"
              >
                Agency sign in
              </button>
            </div>
          </div>
        </footer>
      </div>

      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-slate-950 text-blue-100">
          <DialogHeader>
            <DialogTitle>Terms of Service</DialogTitle>
            <DialogDescription className="mt-4 whitespace-pre-wrap text-blue-100/80">
              {termsContent}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={showPrivacyDialog} onOpenChange={setShowPrivacyDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-slate-950 text-blue-100">
          <DialogHeader>
            <DialogTitle>Privacy Policy</DialogTitle>
            <DialogDescription className="mt-4 whitespace-pre-wrap text-blue-100/80">
              {privacyContent}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
