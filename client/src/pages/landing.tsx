import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import chainLogo from "@/assets/chain-logo.png";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

export default function Landing() {
  const featureCards = [
    {
      icon: CreditCard,
      title: "Make secure payments",
      description:
        "Schedule or submit payments in just a few taps with banking-grade encryption keeping every transaction safe.",
    },
    {
      icon: MessageSquare,
      title: "Stay in control",
      description:
        "Track balances, review statements, and receive real-time updates so you always know where things stand.",
    },
    {
      icon: ShieldCheck,
      title: "Built for your privacy",
      description:
        "Two-factor security, private messaging, and verified agencies ensure your information remains protected.",
    },
  ];

  const steps = [
    {
      title: "Access your account",
      description: "Sign in or register in minutes using the secure portal.",
    },
    {
      title: "Review what matters",
      description: "See balances, documents, and payment plans in one organized view.",
    },
    {
      title: "Take action instantly",
      description: "Set up payments, request callbacks, or message your agency without leaving the dashboard.",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <div className="relative">
        <header className="border-b border-white/10 bg-slate-950/60 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div className="flex items-center gap-3">
              <img src={chainLogo} alt="Chain Software Group" className="h-10 w-auto" />
              <div>
                <p className="text-sm uppercase tracking-wide text-blue-200">Chain Consumer Portal</p>
                <p className="text-xs text-blue-100/80">Modern tools for managing your obligations with confidence</p>
              </div>
            </div>
            <div className="hidden gap-3 sm:flex">
              <Button
                variant="ghost"
                className="text-blue-100 hover:bg-white/10"
                onClick={() => window.location.href = '/consumer-login'}
              >
                Sign in
              </Button>
              <Button
                className="bg-blue-500 hover:bg-blue-400"
                onClick={() => window.location.href = '/consumer-register'}
              >
                Create account
              </Button>
            </div>
          </div>
        </header>

        <main className="px-6 py-12 sm:py-20">
          <section className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <Badge variant="outline" className="border-blue-400/50 bg-blue-500/10 text-blue-100">
                Consumer experience redesigned
              </Badge>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Everything you need to manage your account in one beautiful, secure place
              </h1>
              <p className="mt-6 max-w-xl text-lg text-blue-100/80">
                Log in to review balances, download documents, connect with your agency, and stay ahead of every update.
                Built for transparency, speed, and peace of mind.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Button
                  size="lg"
                  className="h-12 rounded-full bg-blue-500 px-8 text-base font-medium hover:bg-blue-400"
                  onClick={() => window.location.href = '/consumer-login'}
                  data-testid="button-consumer-login"
                >
                  Access your account
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-white/30 bg-white/5 px-8 text-base text-white hover:bg-white/10"
                  onClick={() => window.location.href = '/consumer-register'}
                  data-testid="button-consumer-register"
                >
                  Create an account
                </Button>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-4 sm:max-w-lg">
                <Card className="border-white/10 bg-white/5">
                  <CardContent className="flex h-full flex-col justify-between gap-1 p-5">
                    <p className="text-3xl font-semibold text-white">60s</p>
                    <p className="text-xs text-blue-100/70">Average time to find your account</p>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/5">
                  <CardContent className="flex h-full flex-col justify-between gap-1 p-5">
                    <p className="text-3xl font-semibold text-white">24/7</p>
                    <p className="text-xs text-blue-100/70">Access from any device</p>
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
                      <p className="text-sm text-blue-100/70">You're protected</p>
                      <p className="text-2xl font-semibold text-white">Enterprise-grade security</p>
                    </div>
                    <ShieldCheck className="h-10 w-10 text-blue-200" />
                  </div>
                  <div className="space-y-4 text-sm text-blue-100/80">
                    <p className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-blue-300" />
                      Bank-level encryption safeguards every action
                    </p>
                    <p className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-blue-300" />
                      Two-factor authentication keeps your account private
                    </p>
                    <p className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-blue-300" />
                      Dedicated support specialists ready to help
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                    <p className="text-sm text-blue-100/80">
                      "The new portal is effortless. I can see every account detail and confirm my payments without
                      having to call."
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
                  The consumer portal guides you through every step so you can get answers fast and stay confident about
                  what comes next.
                </p>
              </div>
              <Smartphone className="hidden h-20 w-20 text-blue-200 lg:block" />
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {steps.map((step, index) => (
                <div key={step.title} className="rounded-2xl border border-white/10 bg-slate-950/60 p-6">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-lg font-semibold text-blue-100">
                    {index + 1}
                  </div>
                  <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm text-blue-100/80">{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto mt-20 max-w-6xl">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-white/10 bg-slate-900/70 backdrop-blur">
                <CardContent className="flex flex-col gap-4 p-6">
                  <Clock className="h-8 w-8 text-blue-300" />
                  <h3 className="text-2xl font-semibold text-white">Anytime, anywhere access</h3>
                  <p className="text-sm text-blue-100/80">
                    Manage your account from your desktop or mobile device. The responsive experience adapts to every
                    screen so you can take action from wherever you are.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-slate-900/70 backdrop-blur">
                <CardContent className="flex flex-col gap-4 p-6">
                  <MessageSquare className="h-8 w-8 text-blue-300" />
                  <h3 className="text-2xl font-semibold text-white">Direct line to your agency</h3>
                  <p className="text-sm text-blue-100/80">
                    Need help or clarification? Send a secure message, request a call, or download supporting documents
                    without waiting on hold.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mx-auto mt-24 max-w-6xl rounded-3xl border border-white/10 bg-gradient-to-r from-blue-600/80 to-indigo-500/80 p-8 text-white shadow-2xl">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-3xl font-semibold">Ready to take control?</h2>
                <p className="mt-2 max-w-2xl text-base text-blue-50/80">
                  Sign in to review your accounts or create a new login in seconds. The Chain Consumer Portal gives you a
                  modern experience backed by real people when you need them.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="h-12 rounded-full bg-white px-8 text-base font-semibold text-blue-700 hover:bg-blue-100"
                  onClick={() => window.location.href = '/consumer-login'}
                >
                  Sign in now
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-white/70 bg-white/10 px-8 text-base text-white hover:bg-white/20"
                  onClick={() => window.location.href = '/consumer-register'}
                >
                  Create account
                </Button>
              </div>
            </div>
          </section>

          <section className="mx-auto mt-20 max-w-6xl border-t border-white/10 pt-10 text-sm text-blue-100/60">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p>Agencies looking for software? <button className="text-blue-200 hover:text-blue-100" onClick={() => window.location.href = '/agency-register'} data-testid="button-agency-register">Start a free trial</button></p>
              <div className="flex gap-4">
                <a href="/terms-of-service" className="hover:text-blue-100 hover:underline">
                  Terms of Service
                </a>
                <a href="/privacy-policy" className="hover:text-blue-100 hover:underline">
                  Privacy Policy
                </a>
                <button
                  className="hover:text-blue-100 hover:underline"
                  onClick={() => {
                    if (window.location.hostname === 'localhost' || window.location.hostname.includes('replit.dev')) {
                      window.location.href = '/admin';
                    } else {
                      window.location.href = '/agency-login';
                    }
                  }}
                  data-testid="button-agency-login"
                >
                  Agency Login
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
