import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import chainLogo from "@/assets/chain-logo.png";
import {
  ArrowRight,
  Bot,
  Mail,
  MessageSquare,
  CreditCard,
  FileSignature,
  Smartphone,
  Users,
  Zap,
  Clock,
  Shield,
  BarChart3,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

export default function Info() {
  const modules = [
    {
      icon: Bot,
      title: "AI Auto-Response",
      description: "Intelligent responses to consumer inquiries 24/7. Your AI assistant never sleeps.",
      highlight: true,
    },
    {
      icon: Mail,
      title: "Email Automation",
      description: "Automated campaigns, sequences, and triggered communications at scale.",
    },
    {
      icon: MessageSquare,
      title: "SMS Automation",
      description: "Multi-number SMS sending with smart scheduling and delivery optimization.",
    },
    {
      icon: CreditCard,
      title: "Payment Processing",
      description: "Automated payment arrangements, recurring billing, and settlement processing.",
    },
    {
      icon: FileSignature,
      title: "Document Signing",
      description: "Digital e-signatures with full audit trails and compliance built-in.",
    },
    {
      icon: Smartphone,
      title: "Consumer Portal & Mobile App",
      description: "Self-service portal where consumers manage everything without calling.",
    },
  ];

  const automationFeatures = [
    {
      icon: Zap,
      title: "Automated Workflows",
      description: "Set it and forget it. Sequence-based and event-triggered actions run automatically.",
    },
    {
      icon: Clock,
      title: "Smart Scheduling",
      description: "Communications sent at optimal times. Payments processed on schedule.",
    },
    {
      icon: BarChart3,
      title: "Real-Time Analytics",
      description: "Track everything instantly. Campaign performance, payment status, and more.",
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Bank-level encryption. Multi-tenant isolation. Your data stays protected.",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute top-1/2 left-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
      </div>

      <div className="relative">
        <header className="border-b border-white/10 bg-slate-950/60 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div className="flex items-center gap-3">
              <img src={chainLogo} alt="Chain Software Group" className="h-10 w-auto" />
              <div>
                <p className="text-lg font-semibold text-white">Chain Software Group</p>
                <p className="text-xs text-blue-100/80">Automation-First Platform</p>
              </div>
            </div>
            <Button
              className="bg-blue-500 hover:bg-blue-400"
              onClick={() => window.location.href = '/agency-registration'}
              data-testid="button-register-header"
            >
              Register Your Company
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="px-6 py-12 sm:py-20">
          <section className="mx-auto max-w-6xl text-center">
            <Badge variant="outline" className="border-blue-400/50 bg-blue-500/10 text-blue-100">
              <Sparkles className="mr-1 h-3 w-3" />
              Powered by AI & Automation
            </Badge>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Automate Everything.
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-sky-400 bg-clip-text text-transparent">
                Focus on What Matters.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-blue-100/80">
              Chain is the all-in-one platform that puts your business operations on autopilot. 
              From AI-powered communications to automated payment processing, everything works together seamlessly.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                className="h-14 rounded-full bg-blue-500 px-10 text-lg font-medium hover:bg-blue-400"
                onClick={() => window.location.href = '/agency-registration'}
                data-testid="button-register-hero"
              >
                Register Your Company
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </section>

          <section className="mx-auto mt-24 max-w-6xl">
            <div className="text-center">
              <Badge variant="outline" className="border-sky-400/50 bg-sky-500/10 text-sky-100">
                <Bot className="mr-1 h-3 w-3" />
                AI-Powered Automation
              </Badge>
              <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
                Let AI Handle the Heavy Lifting
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-blue-100/70">
                Our intelligent automation handles routine tasks so your team can focus on high-value work. 
                From instant email responses to smart payment reminders, Chain works around the clock.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {automationFeatures.map((feature) => (
                <Card key={feature.title} className="border-white/10 bg-white/5 backdrop-blur">
                  <CardContent className="p-6">
                    <div className="mb-4 inline-flex rounded-xl bg-blue-500/20 p-3">
                      <feature.icon className="h-6 w-6 text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                    <p className="mt-2 text-sm text-blue-100/70">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="mx-auto mt-24 max-w-6xl">
            <div className="text-center">
              <Badge variant="outline" className="border-indigo-400/50 bg-indigo-500/10 text-indigo-100">
                Complete Platform
              </Badge>
              <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
                Everything You Need, Fully Integrated
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-blue-100/70">
                Six powerful modules that work together seamlessly. No more juggling multiple systems.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((module) => (
                <Card 
                  key={module.title} 
                  className={`border-white/10 backdrop-blur transition-all hover:border-blue-400/30 ${
                    module.highlight 
                      ? 'bg-gradient-to-br from-blue-500/20 to-indigo-500/20 ring-1 ring-blue-400/30' 
                      : 'bg-white/5'
                  }`}
                >
                  <CardContent className="p-6">
                    <div className={`mb-4 inline-flex rounded-xl p-3 ${
                      module.highlight ? 'bg-blue-400/30' : 'bg-white/10'
                    }`}>
                      <module.icon className={`h-6 w-6 ${module.highlight ? 'text-blue-300' : 'text-blue-400'}`} />
                    </div>
                    {module.highlight && (
                      <Badge className="mb-2 bg-blue-500/30 text-blue-200 border-0">
                        <Sparkles className="mr-1 h-3 w-3" />
                        AI-Powered
                      </Badge>
                    )}
                    <h3 className="text-lg font-semibold text-white">{module.title}</h3>
                    <p className="mt-2 text-sm text-blue-100/70">{module.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="mx-auto mt-24 max-w-4xl">
            <Card className="border-white/10 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 backdrop-blur">
              <CardContent className="p-8 sm:p-12 text-center">
                <div className="mx-auto mb-6 inline-flex rounded-full bg-blue-500/30 p-4">
                  <Zap className="h-8 w-8 text-blue-300" />
                </div>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  Ready to Automate?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-blue-100/80">
                  Join the companies that have transformed their operations with Chain. 
                  Set up takes minutes, and our team is here to help every step of the way.
                </p>
                <div className="mt-8 flex flex-col items-center gap-4">
                  <Button
                    size="lg"
                    className="h-14 rounded-full bg-white px-10 text-lg font-semibold text-slate-900 hover:bg-blue-50"
                    onClick={() => window.location.href = '/agency-registration'}
                    data-testid="button-register-cta"
                  >
                    Register Your Company
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-blue-100/70">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-400" />
                      No credit card required
                    </span>
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-400" />
                      Personalized onboarding
                    </span>
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-400" />
                      Dedicated support
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>

        <footer className="border-t border-white/10 bg-slate-950/60 backdrop-blur mt-20">
          <div className="mx-auto max-w-6xl px-6 py-8">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex items-center gap-3">
                <img src={chainLogo} alt="Chain Software Group" className="h-8 w-auto" />
                <p className="text-sm text-blue-100/70">© {new Date().getFullYear()} Chain Software Group</p>
              </div>
              <div className="flex gap-6 text-sm text-blue-100/70">
                <a href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</a>
                <a href="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
