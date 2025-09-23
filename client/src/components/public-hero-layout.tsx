import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import chainLogo from "@/assets/chain-logo.png";
import { cn } from "@/lib/utils";

interface PublicHeroLayoutProps {
  badgeText?: string;
  title: string;
  description?: string;
  supportingContent?: ReactNode;
  children?: ReactNode;
  headerActions?: ReactNode;
  showDefaultHeaderActions?: boolean;
  contentClassName?: string;
  mainContainerClassName?: string;
  disableSurface?: boolean;
}

export function PublicHeroLayout({
  badgeText,
  title,
  description,
  supportingContent,
  children,
  headerActions,
  showDefaultHeaderActions = true,
  contentClassName,
  mainContainerClassName,
  disableSurface = false,
}: PublicHeroLayoutProps) {
  const defaultHeaderActions = (
    <>
      <Button
        variant="ghost"
        className="text-blue-100 hover:bg-white/10"
        onClick={() => (window.location.href = "/consumer-login")}
      >
        Sign in
      </Button>
      <Button
        className="bg-blue-500 hover:bg-blue-400"
        onClick={() => (window.location.href = "/consumer-register")}
      >
        Create account
      </Button>
    </>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400/10 blur-3xl" />
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
              {headerActions ?? (showDefaultHeaderActions ? defaultHeaderActions : null)}
            </div>
          </div>
        </header>

        <main className={cn("px-6 py-12 sm:py-20", mainContainerClassName)}>
          <section className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div>
              {badgeText ? (
                <Badge variant="outline" className="border-blue-400/50 bg-blue-500/10 text-blue-100">
                  {badgeText}
                </Badge>
              ) : null}
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {title}
              </h1>
              {description ? (
                <p className="mt-6 max-w-xl text-lg text-blue-100/80">{description}</p>
              ) : null}
              {supportingContent ? (
                <div className="mt-10 space-y-6 text-blue-100/80">{supportingContent}</div>
              ) : null}
            </div>

            {children ? (
              <div className="relative">
                <div className="absolute -top-6 -right-6 h-32 w-32 rounded-full bg-blue-500/20 blur-3xl" />
                <div
                  className={cn(
                    "relative z-10",
                    disableSurface
                      ? undefined
                      : "rounded-3xl border border-white/10 bg-white/5 shadow-xl shadow-blue-900/20 backdrop-blur",
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

export default PublicHeroLayout;
