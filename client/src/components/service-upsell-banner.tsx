import { useServiceAccess } from "@/hooks/useServiceAccess";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, X } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ServiceUpsellBannerProps {
  service: "email" | "sms" | "payment" | "portal";
  title?: string;
  description?: string;
}

export function ServiceUpsellBanner({ 
  service, 
  title,
  description 
}: ServiceUpsellBannerProps) {
  const {
    emailServiceEnabled,
    smsServiceEnabled,
    paymentProcessingEnabled,
    portalAccessEnabled,
    isLoading,
  } = useServiceAccess();
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const serviceMap = {
    email: emailServiceEnabled,
    sms: smsServiceEnabled,
    payment: paymentProcessingEnabled,
    portal: portalAccessEnabled,
  };

  const defaultTitles = {
    email: "Email Service Not Active",
    sms: "SMS Service Not Active",
    payment: "Payment Processing Not Active",
    portal: "Consumer Portal Not Active",
  };

  const defaultDescriptions = {
    email: "Unlock professional email communications with templates and campaigns for $125/month, or get it bundled with all services for $350/month.",
    sms: "Unlock SMS messaging with multi-number sending and analytics for $125/month, or get it bundled with all services for $350/month.",
    payment: "Unlock secure payment processing with multiple providers for $125/month, or get it bundled with all services for $350/month.",
    portal: "Unlock the branded consumer portal with self-service tools for $125/month, or get it bundled with all services for $350/month.",
  };

  const isEnabled = serviceMap[service];

  if (isLoading || isEnabled || dismissed) {
    return null;
  }

  return (
    <Alert 
      className="relative border-2 border-amber-400/40 bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-white mb-6"
      data-testid={`upsell-banner-${service}`}
    >
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-amber-500/20 p-2 mt-0.5">
          <Lock className="h-5 w-5 text-amber-300" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1">
            {title || defaultTitles[service]}
          </h3>
          <AlertDescription className="text-sm text-blue-100/90">
            {description || defaultDescriptions[service]}
          </AlertDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setLocation("/admin/billing")}
            className="rounded-lg border border-amber-400/60 bg-gradient-to-br from-amber-500/80 to-orange-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:from-amber-400 hover:to-orange-400"
            data-testid={`button-upgrade-banner-${service}`}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            View pricing
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDismissed(true)}
            className="h-8 w-8 text-blue-100/70 hover:bg-white/10 hover:text-white"
            data-testid={`button-dismiss-banner-${service}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Alert>
  );
}
