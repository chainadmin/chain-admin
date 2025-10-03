import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import chainLogo from "@/assets/chain-logo.png";
import { useAgencyContext } from "@/hooks/useAgencyContext";
import { cn } from "@/lib/utils";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, isJwtAuth } = useAuth();
  const [location] = useLocation();
  const { agencySlug, buildAgencyUrl } = useAgencyContext();
  
  const { data: userData } = useQuery({
    queryKey: ["/api/auth/user"],
    enabled: !isJwtAuth, // Only fetch if not JWT auth
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
  
  // Build agency-specific navigation URLs
  const buildNavHref = (path: string) => {
    if (agencySlug) {
      return buildAgencyUrl(path);
    }
    return path;
  };
  
  const navigationItems = [
    { name: "Dashboard", href: buildNavHref("/dashboard"), icon: "fas fa-chart-bar" },
    { name: "Accounts", href: buildNavHref("/accounts"), icon: "fas fa-file-invoice-dollar" },
    { name: "Communications", href: buildNavHref("/communications"), icon: "fas fa-comments" },
    { name: "Payments", href: buildNavHref("/payments"), icon: "fas fa-credit-card" },
    { name: "Billing", href: buildNavHref("/billing"), icon: "fas fa-receipt" },
    ...(isOwner ? [{ name: "Company", href: buildNavHref("/company"), icon: "fas fa-building" }] : []),
    { name: "Settings", href: buildNavHref("/settings"), icon: "fas fa-cog" },
  ];

  const isActiveRoute = (href: string) => {
    return location === href;
  };

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
              aria-label="Open navigation menu"
              className="mr-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-blue-100/70 transition hover:bg-white/10 md:hidden"
            >
              <i aria-hidden="true" className="fas fa-bars text-lg"></i>
              <span className="sr-only">Open navigation menu</span>
            </button>
            <div className="flex flex-1 items-center justify-between gap-4">
              <div className="relative hidden w-full max-w-md md:block">
                <i aria-hidden="true" className="fas fa-search pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-100/60"></i>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-white/10 py-2.5 pl-11 pr-4 text-sm text-blue-50 placeholder:text-blue-100/60 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                  placeholder="Search consumers, accounts..."
                  type="search"
                />
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
                    localStorage.removeItem('authToken');
                    window.location.href = '/api/logout';
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

          <main className="relative flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
