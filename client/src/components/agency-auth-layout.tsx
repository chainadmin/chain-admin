import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import chainLogo from "@/assets/chain-logo.png";
import { cn } from "@/lib/utils";

interface AgencyAuthLayoutProps {
  badgeText?: string;
  title: string;
  description?: string;
  supportingContent?: ReactNode;
  children?: ReactNode;
  headerActions?: ReactNode;
  showDefaultHeaderActions?: boolean;
  contentClassName?: string;
  mainContainerClassName?: string;
}

export function AgencyAuthLayout({
  badgeText,
  title,
  description,
  supportingContent,
  children,
  headerActions,
  showDefaultHeaderActions = true,
  contentClassName,
  mainContainerClassName,
}: AgencyAuthLayoutProps) {
  const defaultHeaderActions = (
    <>
      <Button
        variant="ghost"
        className="text-blue-50/80 hover:bg-white/10 hover:text-white"
        onClick={() => (window.location.href = "/")}
      >
        Back to home
      </Button>
      <Button
        className="border border-white/20 bg-white/10 text-blue-50 hover:bg-white/20"
        onClick={() => (window.location.href = "/agency-registration")}
      >
        Start a trial
      </Button>
    </>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#0f1a3c] via-[#15254c] to-[#1b2f63] text-blue-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-sky-500/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative">
        <header className="border-b border-white/10 bg-white/5 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <img src={chainLogo} alt="Chain Software Group" className="h-10 w-auto" />
              <div className="space-y-1">
                <p className="text-sm uppercase tracking-wide text-blue-100/80">Chain Agency Portal</p>
                <p className="text-xs text-blue-100/70">
                  Operate with clarity, automate outreach, and stay aligned with your consumers
                </p>
              </div>
            </div>
            <div className="hidden gap-3 sm:flex">
              {headerActions ?? (showDefaultHeaderActions ? defaultHeaderActions : null)}
            </div>
          </div>
        </header>

        <main className={cn("px-6 py-12 sm:py-20", mainContainerClassName)}>
          <section className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              {badgeText ? (
                <Badge variant="outline" className="border-white/20 bg-white/5 text-blue-50">
                  {badgeText}
                </Badge>
              ) : null}
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{title}</h1>
              {description ? (
                <p className="mt-6 max-w-xl text-lg text-blue-100/80">{description}</p>
              ) : null}
              {supportingContent ? (
                <div className="mt-10 space-y-6 text-blue-100/80">{supportingContent}</div>
              ) : null}
            </div>

            {children ? (
              <div className="relative">
                <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-sky-500/25 blur-3xl" />
                <div
                  className={cn(
                    "relative z-10 rounded-3xl border border-white/15 bg-white/10 shadow-xl shadow-blue-900/30 backdrop-blur",
                    contentClassName,
                  )}
                >
                  {children}
                </div>
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}

export default AgencyAuthLayout;
