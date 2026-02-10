import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import chainLogo from "@/assets/chain-logo.png";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FileSignature,
  Mail,
  MessageSquare,
  Phone,
  Receipt,
  Shield,
  Smartphone,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export default function Landing() {
  const platformFeatures = [
    {
      icon: MessageSquare,
      title: "SMS Campaigns",
      description:
        "Reach your customers instantly with targeted SMS campaigns, smart audience segmentation, multi-number delivery, and real-time tracking.",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
    },
    {
      icon: Mail,
      title: "Email Communications",
      description:
        "Send professional branded emails with a visual template editor, campaign analytics, automated sequences, and delivery tracking.",
      color: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
    },
    {
      icon: CreditCard,
      title: "Payment Processing",
      description:
        "Accept payments through USAePay, Authorize.net, and NMI with recurring billing, flexible payment plans, and automated scheduling.",
      color: "text-violet-400",
      bg: "bg-violet-500/10 border-violet-500/20",
    },
    {
      icon: Phone,
      title: "VoIP Phone System",
      description:
        "Built-in cloud phone system with local and toll-free numbers, call tracking, softphone capabilities, and team management.",
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
    },
    {
      icon: Receipt,
      title: "Invoicing & Billing",
      description:
        "Automated invoicing with subscription tiers, usage-based billing for SMS and email, and integrated payment tracking.",
      color: "text-rose-400",
      bg: "bg-rose-500/10 border-rose-500/20",
    },
    {
      icon: FileSignature,
      title: "Document Signing",
      description:
        "Built-in e-signature with ESIGN Act compliance, professional signing experience, full audit trails, and reusable templates.",
      color: "text-cyan-400",
      bg: "bg-cyan-500/10 border-cyan-500/20",
    },
  ];

  const whyChain = [
    {
      icon: Users,
      title: "Multi-Tenant Platform",
      description: "Every business gets their own branded portal with a custom subdomain, logos, colors, and a personalized customer experience.",
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Bank-level encryption, role-based access controls, compliance tools, and secure customer authentication built in.",
    },
    {
      icon: TrendingUp,
      title: "Third-Party Integrations",
      description: "Connect with industry software like SMAX, Debt Manager Pro, and Collection Max for bidirectional data sync and workflow automation.",
    },
    {
      icon: Zap,
      title: "AI-Powered Responses",
      description: "Automatically generate intelligent replies to customer emails with customizable tone, business-type adaptation, and usage tracking.",
    },
  ];

  const steps = [
    {
      number: "01",
      title: "Onboard in minutes",
      description: "Register your business, configure your branding, and set up your custom portal with a dedicated subdomain.",
    },
    {
      number: "02",
      title: "Import & configure",
      description: "Upload your customer data via CSV, connect your payment processor, and customize your communication templates.",
    },
    {
      number: "03",
      title: "Communicate & manage",
      description: "Launch SMS and email campaigns, process payments, send invoices, and manage all customer interactions from one dashboard.",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative">
        <header className="border-b border-white/10 bg-slate-950/60 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div className="flex items-center gap-3">
              <img src={chainLogo} alt="Chain Software Group" className="h-10 w-auto" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-white">Chain Software Group</p>
                <p className="text-xs text-blue-100/70">All-in-one business communications platform</p>
              </div>
            </div>
            <div className="hidden gap-3 sm:flex">
              <Button
                variant="ghost"
                className="text-blue-100 hover:bg-white/10"
                onClick={() => window.location.href = '/consumer-login'}
              >
                Consumer Portal
              </Button>
              <Button
                variant="ghost"
                className="text-blue-100 hover:bg-white/10"
                onClick={() => window.location.href = '/agency-login'}
                data-testid="button-agency-login"
              >
                Agency Login
              </Button>
              <Button
                className="bg-blue-500 hover:bg-blue-400"
                onClick={() => window.location.href = '/agency-register'}
                data-testid="button-agency-register"
              >
                Get Started
              </Button>
            </div>
          </div>
        </header>

        <main className="px-6 py-16 sm:py-24">
          <section className="mx-auto max-w-6xl text-center">
            <Badge variant="outline" className="border-blue-400/50 bg-blue-500/10 text-blue-200">
              Built for agencies & businesses
            </Badge>
            <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              One platform for payments, communications & customer management
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-blue-100/70">
              Chain gives your business branded portals, SMS & email campaigns, VoIP phones, payment processing, document signing, and automated invoicing — all from a single dashboard.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                className="h-12 rounded-full bg-blue-500 px-10 text-base font-semibold hover:bg-blue-400"
                onClick={() => window.location.href = '/agency-register'}
              >
                Start your free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-white/25 bg-white/5 px-10 text-base text-white hover:bg-white/10"
                onClick={() => {
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                See what's included
              </Button>
            </div>

            <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-2xl font-bold text-white">6+</p>
                <p className="mt-1 text-xs text-blue-100/60">Business types supported</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-2xl font-bold text-white">3</p>
                <p className="mt-1 text-xs text-blue-100/60">Payment processors</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-2xl font-bold text-white">24/7</p>
                <p className="mt-1 text-xs text-blue-100/60">Consumer portal access</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-2xl font-bold text-emerald-400">99.9%</p>
                <p className="mt-1 text-xs text-blue-100/60">Uptime guarantee</p>
              </div>
            </div>
          </section>

          <section id="features" className="mx-auto mt-28 max-w-6xl">
            <div className="text-center">
              <Badge variant="outline" className="border-white/20 bg-white/5 text-blue-200">
                Platform Features
              </Badge>
              <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
                Everything your business needs in one place
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-base text-blue-100/60">
                From first contact to final payment, Chain handles every step of the customer journey with powerful, integrated tools.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {platformFeatures.map((feature) => (
                <Card key={feature.title} className={`border ${feature.bg} bg-slate-900/50 backdrop-blur transition hover:-translate-y-1 hover:shadow-xl`}>
                  <CardContent className="space-y-4 p-6">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${feature.bg}`}>
                      <feature.icon className={`h-6 w-6 ${feature.color}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-blue-100/70">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="mx-auto mt-28 max-w-6xl">
            <div className="text-center">
              <Badge variant="outline" className="border-white/20 bg-white/5 text-blue-200">
                Why Chain
              </Badge>
              <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
                Built for scale, designed for simplicity
              </h2>
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-2">
              {whyChain.map((item) => (
                <div key={item.title} className="flex gap-5 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/15">
                    <item.icon className="h-6 w-6 text-blue-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-blue-100/70">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto mt-28 max-w-5xl">
            <div className="text-center">
              <Badge variant="outline" className="border-white/20 bg-white/5 text-blue-200">
                How It Works
              </Badge>
              <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
                Up and running in three steps
              </h2>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur">
                  <span className="text-3xl font-bold text-blue-500/50">{step.number}</span>
                  <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-blue-100/70">{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto mt-28 max-w-5xl rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur sm:p-12">
            <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:text-left">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20">
                <Smartphone className="h-8 w-8 text-blue-300" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white sm:text-3xl">Branded customer mobile app</h2>
                <p className="mt-2 text-base text-blue-100/70">
                  Give your customers a native mobile experience. Your branded portal works as a downloadable app with biometric login, push notifications, and secure payments — all under your company name.
                </p>
              </div>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <span className="text-sm text-blue-100/80">Face ID & Touch ID</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <span className="text-sm text-blue-100/80">Publish to App Store</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <span className="text-sm text-blue-100/80">Your branding, your app</span>
              </div>
            </div>
          </section>

          <section className="mx-auto mt-28 max-w-6xl rounded-3xl border border-blue-500/30 bg-gradient-to-r from-blue-600/80 to-indigo-600/80 p-8 text-white shadow-2xl shadow-blue-900/40 sm:p-12">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-3xl font-bold sm:text-4xl">Ready to transform your business?</h2>
                <p className="mt-3 max-w-xl text-base text-blue-50/80">
                  Join businesses already using Chain to streamline communications, automate billing, and deliver exceptional customer experiences.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="h-12 rounded-full bg-white px-8 text-base font-semibold text-blue-700 hover:bg-blue-50"
                  onClick={() => window.location.href = '/agency-register'}
                >
                  Get started free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-white/50 bg-white/10 px-8 text-base text-white hover:bg-white/20"
                  onClick={() => window.location.href = '/agency-login'}
                >
                  Agency login
                </Button>
              </div>
            </div>
          </section>

          <footer className="mx-auto mt-20 max-w-6xl border-t border-white/10 pt-10 text-sm text-blue-100/50">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <img src={chainLogo} alt="Chain" className="h-7 w-auto opacity-60" />
                <span className="text-blue-100/40">&copy; {new Date().getFullYear()} Chain Software Group</span>
              </div>
              <div className="flex flex-wrap gap-4">
                <a href="/consumer-login" className="hover:text-blue-100 transition">
                  Consumer Portal
                </a>
                <a href="/terms-of-service" className="hover:text-blue-100 transition">
                  Terms of Service
                </a>
                <a href="/privacy-policy" className="hover:text-blue-100 transition">
                  Privacy Policy
                </a>
                <button
                  className="hover:text-blue-100 transition"
                  onClick={() => window.location.href = '/agency-login'}
                  data-testid="button-agency-login-footer"
                >
                  Agency Login
                </button>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
