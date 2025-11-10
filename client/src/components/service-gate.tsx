import { ReactNode } from "react";
import { useServiceAccess } from "@/hooks/useServiceAccess";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ServiceGateProps {
  service: "email" | "sms" | "payment" | "portal";
  children: ReactNode;
  mode?: "hide" | "disable";
  className?: string;
}

export function ServiceGate({ service, children, mode = "disable", className = "" }: ServiceGateProps) {
  const {
    emailServiceEnabled,
    smsServiceEnabled,
    paymentProcessingEnabled,
    portalAccessEnabled,
    isLoading,
  } = useServiceAccess();
  const [, setLocation] = useLocation();

  const serviceMap = {
    email: emailServiceEnabled,
    sms: smsServiceEnabled,
    payment: paymentProcessingEnabled,
    portal: portalAccessEnabled,
  };

  const serviceNames = {
    email: "Email Service",
    sms: "SMS Service",
    payment: "Portal + Processing",
    portal: "Portal + Processing",
  };

  const isEnabled = serviceMap[service];

  // DEBUG LOGGING
  console.log(`[ServiceGate] service=${service}, isEnabled=${isEnabled}, flags=`, {
    emailServiceEnabled,
    smsServiceEnabled,
    paymentProcessingEnabled,
    portalAccessEnabled,
    isLoading
  });

  if (isLoading) {
    return null;
  }

  if (!isEnabled && mode === "hide") {
    return null;
  }

  if (!isEnabled && mode === "disable") {
    return (
      <div className={`relative ${className}`} data-testid={`service-gate-${service}`}>
        <div className="opacity-50 grayscale">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setLocation("/admin/billing?tab=services")}
                className="pointer-events-auto rounded-xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/90 to-orange-500/90 px-6 py-3 text-sm font-semibold text-white shadow-2xl shadow-amber-900/50 transition hover:scale-105 hover:from-amber-400 hover:to-orange-400"
                data-testid={`button-upgrade-${service}`}
              >
                <Lock className="mr-2 h-4 w-4" />
                Upgrade to unlock
                <Sparkles className="ml-2 h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-900 text-white border-white/20">
              <p className="font-semibold">{serviceNames[service]} is disabled</p>
              <p className="text-xs text-slate-300 mt-1">
                Purchase this service for $125/month or bundle all services for $350/month
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div 
          className="absolute inset-0 bg-transparent cursor-default" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      </div>
    );
  }

  return <>{children}</>;
}
