import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Share, Plus, MoreVertical, Download, Smartphone, CheckCircle2, ExternalLink } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface IOSNavigator extends Navigator {
  standalone?: boolean;
}

export default function InstallPage() {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop" | "unknown">("unknown");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isMobile = isIOS || isAndroid;

    if (isIOS) setPlatform("ios");
    else if (isAndroid) setPlatform("android");
    else if (!isMobile) setPlatform("desktop");
    else setPlatform("unknown");

    // Check if already installed (standalone mode)
    const iosNav = navigator as IOSNavigator;
    const isStandalone =
      iosNav.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) setInstalled(true);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      setCanInstall(false);
    }
    setDeferredPrompt(null);
  };

  const softphoneUrl = `${window.location.origin}/softphone`;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "Agent Softphone",
        text: "Install the Agent Softphone app",
        url: softphoneUrl,
      }).catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          navigator.clipboard.writeText(softphoneUrl).catch((clipErr) => {
            console.warn("Clipboard copy failed:", clipErr);
          });
        }
      });
    } else {
      navigator.clipboard.writeText(softphoneUrl).catch((clipErr) => {
        console.warn("Clipboard copy failed:", clipErr);
      });
    }
  };

  if (installed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="mx-auto w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">App Installed!</h2>
            <p className="text-gray-600 dark:text-gray-400">
              The Softphone app has been added to your home screen. You can now open it directly from there.
            </p>
            <Button
              className="w-full"
              onClick={() => (window.location.href = "/softphone")}
            >
              <Phone className="h-4 w-4 mr-2" />
              Open Softphone
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center pt-6">
          <div className="mx-auto w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Phone className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Agent Softphone</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Install the softphone app on your phone for quick access from your home screen.
          </p>
        </div>

        {canInstall && (
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6 pb-6">
              <div className="text-center space-y-4">
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  Ready to Install
                </Badge>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Click below to add the softphone directly to your home screen.
                </p>
                <Button className="w-full" size="lg" onClick={handleInstallClick}>
                  <Download className="h-5 w-5 mr-2" />
                  Install App
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {platform === "ios" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Smartphone className="h-5 w-5 text-blue-600" />
                Install on iPhone / iPad
              </CardTitle>
              <CardDescription>Follow these steps in Safari</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Step number={1} icon={<ExternalLink className="h-4 w-4" />}>
                  Open this page in <strong>Safari</strong> (not Chrome or Firefox)
                </Step>
                <Step number={2} icon={<Share className="h-4 w-4" />}>
                  Tap the <strong>Share</strong> button at the bottom of the screen
                </Step>
                <Step number={3} icon={<Plus className="h-4 w-4" />}>
                  Scroll down and tap <strong>"Add to Home Screen"</strong>
                </Step>
                <Step number={4} icon={<CheckCircle2 className="h-4 w-4" />}>
                  Tap <strong>Add</strong> — the app icon will appear on your home screen
                </Step>
              </div>
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>Note:</strong> This only works in Safari on iOS. Make sure you are viewing this page in Safari.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {platform === "android" && !canInstall && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Smartphone className="h-5 w-5 text-blue-600" />
                Install on Android
              </CardTitle>
              <CardDescription>Follow these steps in Chrome</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Step number={1} icon={<ExternalLink className="h-4 w-4" />}>
                  Open this page in <strong>Chrome</strong> on your Android device
                </Step>
                <Step number={2} icon={<MoreVertical className="h-4 w-4" />}>
                  Tap the <strong>three-dot menu</strong> (⋮) in the top right corner
                </Step>
                <Step number={3} icon={<Plus className="h-4 w-4" />}>
                  Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>
                </Step>
                <Step number={4} icon={<CheckCircle2 className="h-4 w-4" />}>
                  Tap <strong>Add</strong> — the app will appear on your home screen
                </Step>
              </div>
            </CardContent>
          </Card>
        )}

        {platform === "desktop" && !canInstall && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Download className="h-5 w-5 text-blue-600" />
                Install on Desktop
              </CardTitle>
              <CardDescription>Install in Chrome or Edge</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Step number={1} icon={<ExternalLink className="h-4 w-4" />}>
                  Open this page in <strong>Chrome</strong> or <strong>Edge</strong>
                </Step>
                <Step number={2} icon={<MoreVertical className="h-4 w-4" />}>
                  Click the <strong>install icon</strong> (⊕) in the address bar, or open the menu and select <strong>"Install Agent Softphone"</strong>
                </Step>
                <Step number={3} icon={<CheckCircle2 className="h-4 w-4" />}>
                  Click <strong>Install</strong> to confirm
                </Step>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Share with Agents</CardTitle>
            <CardDescription>Share this link so agents can install the app</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
              <code className="text-sm flex-1 break-all text-blue-600 dark:text-blue-400">{softphoneUrl}</code>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleShare}
            >
              <Share className="h-4 w-4 mr-2" />
              Share Softphone Link
            </Button>
          </CardContent>
        </Card>

        <div className="text-center pb-6">
          <Button variant="link" onClick={() => (window.location.href = "/softphone")}>
            Go to Softphone
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  icon,
  children,
}: {
  number: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
        {number}
      </div>
      <div className="flex items-start gap-2 pt-0.5">
        <span className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5">{icon}</span>
        <p className="text-sm text-gray-700 dark:text-gray-300">{children}</p>
      </div>
    </div>
  );
}
