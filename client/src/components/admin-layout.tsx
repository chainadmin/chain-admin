import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import chainLogo from "@/assets/chain-logo.png";
import { useAgencyContext } from "@/hooks/useAgencyContext";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const { agencySlug, buildAgencyUrl } = useAgencyContext();
  
  const { data: userData } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Only show company section for platform owners
  const isOwner = (userData as any)?.platformUser?.role === 'owner';
  
  // Build agency-specific navigation URLs
  const buildNavHref = (path: string) => {
    if (agencySlug) {
      return buildAgencyUrl(path);
    }
    return path;
  };
  
  const navigationItems = [
    { name: "Dashboard", href: buildNavHref("/dashboard"), icon: "fas fa-chart-bar" },
    { name: "Consumers", href: buildNavHref("/consumers"), icon: "fas fa-users" },
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
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto bg-white border-r border-gray-200">
            {/* Logo and Company */}
            <div className="flex items-center flex-shrink-0 px-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <img src={chainLogo} alt="Chain Logo" className="w-10 h-10 object-contain" />
                </div>
                <div className="ml-3">
                  <div className="text-lg font-semibold text-gray-900">
                    {(userData as any)?.platformUser?.tenant?.name || "Chain"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {(userData as any)?.platformUser?.tenant?.slug || "agency-pro"}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Navigation */}
            <nav className="mt-8 flex-1 px-2 space-y-1">
              {navigationItems.map((item) => (
                <Link key={item.name} href={item.href} data-testid={`nav-${item.name.toLowerCase()}`}>
                  <div
                    className={`${
                      isActiveRoute(item.href)
                        ? "bg-blue-50 border-r-2 border-blue-500 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                    } group flex items-center px-2 py-2 text-sm font-medium rounded-l-md cursor-pointer`}
                  >
                    <i className={`${item.icon} ${
                      isActiveRoute(item.href) ? "text-blue-500" : "text-gray-400"
                    } mr-3 text-sm`}></i>
                    {item.name}
                  </div>
                </Link>
              ))}
            </nav>
            
            {/* User Profile */}
            <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
              <div className="flex items-center">
                <div>
                  <img
                    className="inline-block h-9 w-9 rounded-full"
                    src={(user as any)?.profileImageUrl || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}
                    alt="User avatar"
                  />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-700">
                    {(user as any)?.firstName || (user as any)?.lastName 
                      ? `${(user as any).firstName} ${(user as any).lastName}` 
                      : (user as any)?.email}
                  </p>
                  <p className="text-xs font-medium text-gray-500">
                    {(userData as any)?.platformUser?.role?.replace('_', ' ') || "User"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top Header */}
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white border-b border-gray-200">
          <button className="px-4 border-r border-gray-200 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 md:hidden">
            <i className="fas fa-bars h-6 w-6"></i>
          </button>
          <div className="flex-1 px-4 flex justify-between">
            <div className="flex-1 flex">
              <div className="w-full flex md:ml-0">
                <div className="relative w-full text-gray-400 focus-within:text-gray-600">
                  <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none">
                    <i className="fas fa-search h-5 w-5"></i>
                  </div>
                  <input
                    className="block w-full h-full pl-8 pr-3 py-2 border-transparent text-gray-900 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-0 focus:border-transparent sm:text-sm"
                    placeholder="Search consumers, accounts..."
                    type="search"
                  />
                </div>
              </div>
            </div>
            <div className="ml-4 flex items-center md:ml-6">
              <button className="bg-white p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                <i className="fas fa-bell h-6 w-6"></i>
              </button>
              <Button 
                variant="ghost" 
                onClick={() => {
                  localStorage.removeItem('authToken');
                  window.location.href = '/';
                }}
                className="ml-3"
              >
                <i className="fas fa-sign-out-alt mr-2"></i>
                Logout
              </Button>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
