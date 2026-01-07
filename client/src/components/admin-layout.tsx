import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import chainLogo from "@/assets/chain-logo.png";
import { useAgencyContext } from "@/hooks/useAgencyContext";
import { cn } from "@/lib/utils";
import { clearAuth } from "@/lib/cookies";
import { useServiceAccess } from "@/hooks/useServiceAccess";
import { MessageSquare, Mail } from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface SearchResults {
  consumers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  }>;
  accounts: Array<{
    id: string;
    accountNumber: string | null;
    creditor: string;
    firstName: string;
    lastName: string;
    balanceCents: number;
  }>;
}

interface QuickSendTarget {
  consumerId: string;
  name: string;
  email: string;
  phone: string | null;
  type: 'sms' | 'email';
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, isJwtAuth } = useAuth();
  const [location, navigate] = useLocation();
  const { agencySlug, buildAgencyUrl } = useAgencyContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Quick send modal state
  const [quickSendTarget, setQuickSendTarget] = useState<QuickSendTarget | null>(null);
  const [quickSendMessage, setQuickSendMessage] = useState("");
  const [quickSendSubject, setQuickSendSubject] = useState("");
  
  const { data: userData } = useQuery({
    queryKey: ["/api/auth/user"],
    enabled: !isJwtAuth, // Only fetch if not JWT auth
  });

  // Fetch tenant settings to check trial status
  const { data: tenantSettings } = useQuery({
    queryKey: ["/api/settings"],
  });

  // Get tenant information from either JWT or Replit auth
  const tenantName = isJwtAuth 
    ? (user as any)?.tenantName || 'Chain'
    : (userData as any)?.platformUser?.tenant?.name || 'Chain';
  
  const tenantSlug = isJwtAuth
    ? (user as any)?.tenantSlug || 'agency-pro'
    : (userData as any)?.platformUser?.tenant?.slug || 'agency-pro';

  // Only show company section for platform owners
  const isOwner = isJwtAuth 
    ? (user as any)?.role === 'owner'
    : (userData as any)?.platformUser?.role === 'owner';
  
  // Get user's restricted services (only applies to non-owners)
  const restrictedServices: string[] = isJwtAuth
    ? (user as any)?.restrictedServices || []
    : (userData as any)?.platformUser?.restrictedServices || [];
  
  // Build agency-specific navigation URLs
  const buildNavHref = (path: string) => {
    if (agencySlug) {
      return buildAgencyUrl(path);
    }
    return path;
  };
  
  // Map navigation items to their service restriction keys
  const serviceRestrictionMap: Record<string, string> = {
    "Communications": "email",
    "Payments": "payments",
    "Inbox": "email",
  };
  
  // Check if a navigation item should be hidden based on service restrictions
  const isServiceRestricted = (itemName: string): boolean => {
    const serviceKey = serviceRestrictionMap[itemName];
    if (!serviceKey) return false;
    return restrictedServices.includes(serviceKey);
  };
  
  const navigationItems = [
    { name: "Dashboard", href: buildNavHref("/dashboard"), icon: "fas fa-chart-bar" },
    { name: "Accounts", href: buildNavHref("/accounts"), icon: "fas fa-file-invoice-dollar" },
    { name: "Communications", href: buildNavHref("/communications"), icon: "fas fa-comments" },
    { name: "Inbox", href: buildNavHref("/email-inbox"), icon: "fas fa-inbox" },
    { name: "Requests", href: buildNavHref("/requests"), icon: "fas fa-phone" },
    { name: "Payments", href: buildNavHref("/payments"), icon: "fas fa-credit-card" },
    ...(isOwner ? [{ name: "Billing", href: buildNavHref("/billing"), icon: "fas fa-receipt" }] : []),
    { name: "Settings", href: buildNavHref("/settings"), icon: "fas fa-cog" },
  ].filter(item => !isServiceRestricted(item.name));

  const isActiveRoute = (href: string) => {
    return location === href;
  };

  // Search functionality
  const { data: searchResults } = useQuery<SearchResults>({
    queryKey: [`/api/search?q=${searchQuery}`],
    enabled: searchQuery.length >= 2,
  });

  // Close search results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowSearchResults(value.length >= 2);
  };

  const handleResultClick = (type: string, id: string) => {
    setSearchQuery("");
    setShowSearchResults(false);
    
    // Build the base path first, then append query parameters
    const basePath = buildNavHref('/accounts');
    const queryParam = type === 'consumer' ? `?consumerId=${id}` : `?accountId=${id}`;
    
    // Navigate using the complete path
    navigate(`${basePath}${queryParam}`);
  };

  // Quick send mutations
  const sendQuickSmsMutation = useMutation({
    mutationFn: (data: { consumerId: string; message: string }) =>
      apiRequest("POST", "/api/sms/quick", data),
    onSuccess: () => {
      toast({ title: "Success", description: "SMS sent successfully" });
      setQuickSendTarget(null);
      setQuickSendMessage("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to send SMS",
        variant: "destructive"
      });
    },
  });

  const sendQuickEmailMutation = useMutation({
    mutationFn: (data: { to: string; subject: string; message: string }) =>
      apiRequest("POST", "/api/send-email", data),
    onSuccess: () => {
      toast({ title: "Success", description: "Email sent successfully" });
      setQuickSendTarget(null);
      setQuickSendMessage("");
      setQuickSendSubject("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to send email",
        variant: "destructive"
      });
    },
  });

  const openQuickSend = (consumer: SearchResults['consumers'][0], type: 'sms' | 'email') => {
    setQuickSendTarget({
      consumerId: consumer.id,
      name: `${consumer.firstName} ${consumer.lastName}`,
      email: consumer.email,
      phone: consumer.phone,
      type
    });
    setQuickSendMessage("");
    setQuickSendSubject("");
    setShowSearchResults(false);
    setSearchQuery("");
  };

  const handleQuickSend = () => {
    if (!quickSendTarget || !quickSendMessage.trim()) return;
    
    if (quickSendTarget.type === 'sms') {
      sendQuickSmsMutation.mutate({
        consumerId: quickSendTarget.consumerId,
        message: quickSendMessage
      });
    } else {
      if (!quickSendSubject.trim()) {
        toast({ title: "Error", description: "Subject is required", variant: "destructive" });
        return;
      }
      sendQuickEmailMutation.mutate({
        to: quickSendTarget.email,
        subject: quickSendSubject,
        message: quickSendMessage
      });
    }
  };

  // Close mobile nav on route change
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#111f3b] to-[#152a54] text-blue-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 right-0 h-96 w-96 rounded-full bg-sky-500/25 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[32rem] w-[32rem] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen overflow-hidden">
        {/* Sidebar */}
        <div className="hidden md:flex md:flex-shrink-0">
          <div className="flex w-72 flex-col">
            <div className="flex flex-col flex-grow overflow-y-auto border-r border-white/10 bg-white/10 pt-8 pb-6 backdrop-blur">
              {/* Logo and Company */}
              <div className="px-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
                    <img src={chainLogo} alt="Chain Logo" className="h-8 w-8 object-contain" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">{tenantName}</p>
                    <p className="text-xs uppercase tracking-wide text-blue-100/70">{tenantSlug}</p>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <nav className="mt-10 flex-1 px-4">
                <ul className="space-y-1">
                  {navigationItems.map((item) => {
                    const isActive = isActiveRoute(item.href);

                    return (
                      <li key={item.name}>
                        <Link href={item.href}>
                          <a
                            data-testid={`nav-${item.name.toLowerCase()}`}
                            className={cn(
                              "group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                              isActive
                                ? "bg-white/15 text-white shadow-lg shadow-blue-900/20"
                                : "text-blue-100/80 hover:bg-white/10 hover:text-white",
                            )}
                            aria-current={isActive ? "page" : undefined}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-sm transition",
                                isActive
                                  ? "border-white/30 bg-gradient-to-br from-sky-400/30 to-indigo-500/30 text-white"
                                  : "text-blue-100/70 group-hover:border-white/20 group-hover:bg-white/10",
                              )}
                            >
                              <i aria-hidden="true" className={`${item.icon} text-base`}></i>
                            </span>
                            <span>{item.name}</span>
                          </a>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              {/* User Profile */}
              <div className="mt-8 px-4">
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-4">
                  <img
                    className="h-10 w-10 rounded-full border border-white/20 object-cover"
                    src={(user as any)?.profileImageUrl || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}
                    alt="User avatar"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">
                      {(user as any)?.firstName || (user as any)?.lastName
                        ? `${(user as any).firstName} ${(user as any).lastName}`
                        : (user as any)?.email}
                    </p>
                    <p className="text-xs text-blue-100/70">
                      {isJwtAuth
                        ? ((user as any)?.role?.replace('_', ' ') || "User")
                        : ((userData as any)?.platformUser?.role?.replace('_', ' ') || "User")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="relative z-10 flex h-20 flex-shrink-0 items-center border-b border-white/10 bg-white/5 px-4 backdrop-blur">
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={isMobileNavOpen}
              className="mr-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-blue-100/70 transition hover:bg-white/10 md:hidden"
              data-testid="button-mobile-menu"
            >
              <i aria-hidden="true" className="fas fa-bars text-lg"></i>
              <span className="sr-only">Open navigation menu</span>
            </button>
            <div className="flex flex-1 items-center justify-between gap-4">
              <div className="relative hidden w-full max-w-md md:block" ref={searchRef}>
                <i aria-hidden="true" className="fas fa-search pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-100/60"></i>
                <input
                  className="w-full rounded-2xl border border-white/20 bg-[#0b1733] py-2.5 pl-11 pr-4 text-sm text-blue-50 placeholder:text-blue-100/60 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                  placeholder="Search consumers, accounts..."
                  type="search"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => {
                    if (searchQuery.length >= 2) setShowSearchResults(true);
                  }}
                  data-testid="input-global-search"
                />
                
                {/* Search Results Dropdown */}
                {showSearchResults && searchResults && (
                  <div className="absolute top-full mt-2 w-full rounded-2xl border border-white/15 bg-slate-900/95 backdrop-blur shadow-2xl shadow-black/50 max-h-96 overflow-y-auto z-50">
                    {searchResults.consumers?.length > 0 && (
                      <div className="p-2">
                        <div className="px-3 py-2 text-xs font-semibold text-blue-100/70 uppercase tracking-wide">
                          Consumers
                        </div>
                        {searchResults.consumers.map((consumer) => (
                          <div
                            key={consumer.id}
                            className="w-full px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-white"
                            data-testid={`search-result-consumer-${consumer.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => handleResultClick('consumer', consumer.id)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-400/30 hover:bg-blue-500/30 transition-colors"
                                title="View Account"
                              >
                                <i className="fas fa-user text-sm text-blue-300"></i>
                              </button>
                              <button 
                                onClick={() => handleResultClick('consumer', consumer.id)}
                                className="flex-1 min-w-0 text-left"
                              >
                                <p className="text-sm font-medium text-white truncate">
                                  {consumer.firstName} {consumer.lastName}
                                </p>
                                <p className="text-xs text-blue-100/60 truncate">{consumer.email}</p>
                              </button>
                              <div className="flex items-center gap-1">
                                {consumer.phone && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openQuickSend(consumer, 'sms');
                                    }}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-400/30 hover:bg-emerald-500/40 transition-colors"
                                    title="Send Text"
                                    data-testid={`search-sms-${consumer.id}`}
                                  >
                                    <MessageSquare className="h-4 w-4 text-emerald-300" />
                                  </button>
                                )}
                                {consumer.email && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openQuickSend(consumer, 'email');
                                    }}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 border border-sky-400/30 hover:bg-sky-500/40 transition-colors"
                                    title="Send Email"
                                    data-testid={`search-email-${consumer.id}`}
                                  >
                                    <Mail className="h-4 w-4 text-sky-300" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {searchResults.accounts?.length > 0 && (
                      <div className="p-2 border-t border-white/10">
                        <div className="px-3 py-2 text-xs font-semibold text-blue-100/70 uppercase tracking-wide">
                          Accounts
                        </div>
                        {searchResults.accounts.map((account) => (
                          <button
                            key={account.id}
                            onClick={() => handleResultClick('account', account.id)}
                            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-white"
                            data-testid={`search-result-account-${account.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-400/30">
                                <i className="fas fa-file-invoice-dollar text-sm text-emerald-300"></i>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">
                                  {account.accountNumber || account.creditor}
                                </p>
                                <p className="text-xs text-blue-100/60 truncate">
                                  {account.firstName} {account.lastName} • ${((account.balanceCents || 0) / 100).toFixed(2)}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchResults.consumers?.length === 0 && searchResults.accounts?.length === 0 && (
                      <div className="p-8 text-center">
                        <i className="fas fa-search text-3xl text-blue-100/30 mb-3"></i>
                        <p className="text-sm text-blue-100/60">No results found for "{searchQuery}"</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="View notifications"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-blue-100/70 transition hover:bg-white/15"
                >
                  <i aria-hidden="true" className="fas fa-bell text-base"></i>
                  <span className="sr-only">View notifications</span>
                </button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (isJwtAuth) {
                      clearAuth();
                      window.location.href = '/agency-login';
                    } else {
                      localStorage.removeItem('authToken');
                      window.location.href = '/api/logout';
                    }
                  }}
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-blue-50 hover:bg-white/20"
                  data-testid="button-logout"
                >
                  <i aria-hidden="true" className="fas fa-sign-out-alt mr-2 text-base"></i>
                  Logout
                </Button>
              </div>
            </div>
          </div>

          {/* Trial Mode Banner */}
          {(tenantSettings as any)?.isTrialAccount && (
            <div className="relative z-10 border-b border-amber-400/40 bg-amber-500/20 px-6 py-3">
              <div className="flex items-center justify-center gap-3">
                <i className="fas fa-exclamation-triangle text-amber-300"></i>
                <p className="text-sm font-medium text-amber-100">
                  <strong>Trial Account</strong> - This is a view-only trial. Email sending, SMS, and payment processing are disabled. Upgrade to unlock all features.
                </p>
              </div>
            </div>
          )}

          <main className="relative flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile Navigation Sheet */}
      <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
        <SheetContent side="left" className="w-80 bg-gradient-to-br from-[#0f172a] via-[#111f3b] to-[#152a54] border-white/10 p-0">
          <div className="flex h-full flex-col">
            {/* Logo and Company */}
            <SheetHeader className="border-b border-white/10 px-6 py-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
                  <img src={chainLogo} alt="Chain Logo" className="h-8 w-8 object-contain" />
                </div>
                <div>
                  <SheetTitle className="text-left text-base font-semibold text-white">{tenantName}</SheetTitle>
                  <p className="text-left text-xs uppercase tracking-wide text-blue-100/70">{tenantSlug}</p>
                </div>
              </div>
            </SheetHeader>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-4 py-6">
              <ul className="space-y-1">
                {navigationItems.map((item) => {
                  const isActive = isActiveRoute(item.href);

                  return (
                    <li key={item.name}>
                      <Link href={item.href}>
                        <a
                          onClick={() => setIsMobileNavOpen(false)}
                          data-testid={`mobile-nav-${item.name.toLowerCase()}`}
                          className={cn(
                            "group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                            isActive
                              ? "bg-white/15 text-white shadow-lg shadow-blue-900/20"
                              : "text-blue-100/80 hover:bg-white/10 hover:text-white",
                          )}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-sm transition",
                              isActive
                                ? "border-white/30 bg-gradient-to-br from-sky-400/30 to-indigo-500/30 text-white"
                                : "text-blue-100/70 group-hover:border-white/20 group-hover:bg-white/10",
                            )}
                          >
                            <i aria-hidden="true" className={`${item.icon} text-base`}></i>
                          </span>
                          <span>{item.name}</span>
                        </a>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* User Profile */}
            <div className="border-t border-white/10 px-4 py-6">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-4">
                <img
                  className="h-10 w-10 rounded-full border border-white/20 object-cover"
                  src={(user as any)?.profileImageUrl || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}
                  alt="User avatar"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">
                    {(user as any)?.firstName || (user as any)?.lastName
                      ? `${(user as any).firstName} ${(user as any).lastName}`
                      : (user as any)?.email}
                  </p>
                  <p className="text-xs text-blue-100/70">
                    {isJwtAuth
                      ? ((user as any)?.role?.replace('_', ' ') || "User")
                      : ((userData as any)?.platformUser?.role?.replace('_', ' ') || "User")}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  if (isJwtAuth) {
                    clearAuth();
                    window.location.href = '/agency-login';
                  } else {
                    localStorage.removeItem('authToken');
                    window.location.href = '/api/logout';
                  }
                }}
                className="mt-4 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-blue-50 hover:bg-white/20"
                data-testid="button-mobile-logout"
              >
                <i aria-hidden="true" className="fas fa-sign-out-alt mr-2 text-base"></i>
                Logout
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Quick Send Dialog */}
      <Dialog open={!!quickSendTarget} onOpenChange={(open) => !open && setQuickSendTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {quickSendTarget?.type === 'sms' ? (
                <>
                  <MessageSquare className="h-5 w-5 text-emerald-500" />
                  Send Text to {quickSendTarget?.name}
                </>
              ) : (
                <>
                  <Mail className="h-5 w-5 text-sky-500" />
                  Send Email to {quickSendTarget?.name}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {quickSendTarget?.type === 'sms' ? (
              <div className="text-sm text-gray-600">
                Sending to: {quickSendTarget?.phone}
              </div>
            ) : (
              <>
                <div className="text-sm text-gray-600">
                  Sending to: {quickSendTarget?.email}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-subject">Subject</Label>
                  <Input
                    id="quick-subject"
                    value={quickSendSubject}
                    onChange={(e) => setQuickSendSubject(e.target.value)}
                    placeholder="Enter subject..."
                    data-testid="input-quick-subject"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="quick-message">Message</Label>
              <Textarea
                id="quick-message"
                value={quickSendMessage}
                onChange={(e) => setQuickSendMessage(e.target.value)}
                placeholder={quickSendTarget?.type === 'sms' ? "Enter your text message..." : "Enter your email message..."}
                rows={4}
                data-testid="input-quick-message"
              />
              {quickSendTarget?.type === 'sms' && (
                <p className="text-xs text-gray-500">
                  {quickSendMessage.length}/160 characters
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuickSendTarget(null)}
                data-testid="button-quick-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleQuickSend}
                disabled={sendQuickSmsMutation.isPending || sendQuickEmailMutation.isPending || !quickSendMessage.trim()}
                data-testid="button-quick-send"
              >
                {sendQuickSmsMutation.isPending || sendQuickEmailMutation.isPending ? (
                  "Sending..."
                ) : (
                  <>Send {quickSendTarget?.type === 'sms' ? 'Text' : 'Email'}</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
