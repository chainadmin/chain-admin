import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building2, Lock, Sparkles, UserCheck } from "lucide-react";
import { z } from "zod";
import { isSubdomainSupported } from "@shared/utils/subdomain";
import { persistTenantMetadata, setCookie } from "@/lib/cookies";
import AgencyAuthLayout from "@/components/agency-auth-layout";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginData = z.infer<typeof loginSchema>;

export default function AgencyLogin() {
  const { toast } = useToast();

  const form = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginData) => {
      const response = await apiRequest("POST", "/api/agency/login", data);
      const result = await response.json();
      
      // Store the JWT token
      if (result.token) {
        localStorage.setItem('authToken', result.token);
        setCookie('authToken', result.token);
      }

      // Persist tenant details for cross-subdomain navigation
      persistTenantMetadata({
        slug: result.tenant?.slug,
        name: result.tenant?.name,
      });

      return result;
    },
    onSuccess: (data) => {
      const userName = data.user.firstName && data.user.lastName 
        ? `${data.user.firstName} ${data.user.lastName}`
        : data.user.username || data.user.email;
      
      toast({
        title: "Login Successful",
        description: `Welcome back, ${userName}!`,
      });
      
      // Invalidate queries to refresh authentication state
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      // Redirect to agency dashboard
      setTimeout(() => {
        const agencySlug = data.tenant?.slug;
        
        if (agencySlug) {
          // Use path-based routing (works immediately without SSL issues)
          window.location.href = `/${agencySlug}/dashboard`;
        } else {
          // Fallback to regular dashboard
          window.location.href = "/dashboard";
        }
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginData) => {
    loginMutation.mutate(data);
  };

  return (
    <AgencyAuthLayout
      badgeText="Agency access"
      title="Welcome back, Chain agency partner"
      description="Log in to orchestrate outreach, manage account performance, and keep your entire team aligned in one streamlined workspace."
      supportingContent={(
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <Sparkles className="h-5 w-5 text-sky-200" />
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold text-white">Guided daily focus</p>
              <p className="text-sm text-blue-100/75">Surface the right accounts and outreach tasks for every collector automatically.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <Building2 className="h-5 w-5 text-sky-200" />
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold text-white">Branded consumer journeys</p>
              <p className="text-sm text-blue-100/75">Every channel—from statements to SMS—carries your agency look and tone.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <UserCheck className="h-5 w-5 text-sky-200" />
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold text-white">Team accountability</p>
              <p className="text-sm text-blue-100/75">Role-based workspaces keep supervisors informed and specialists on-task.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <Lock className="h-5 w-5 text-sky-200" />
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold text-white">Security-first platform</p>
              <p className="text-sm text-blue-100/75">SOC 2 aligned processes, MFA, and audit trails keep every action protected.</p>
            </div>
          </div>
        </div>
      )}
      contentClassName="p-8 sm:p-10"
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0f1f3f]/40 p-6 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400" />
        <div className="relative z-10 space-y-6">
          <div className="space-y-2 text-center sm:text-left">
            <p className="text-sm uppercase tracking-wide text-blue-100/70">Agency dashboard access</p>
            <h2 className="text-2xl font-semibold text-white">Sign in to your command center</h2>
            <p className="text-sm text-blue-100/70">
              Use the credentials created during onboarding. Need help? Contact Chain support and we&rsquo;ll get you connected fast.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-sm font-semibold text-blue-100/80">
                      <UserCheck className="h-4 w-4" />
                      Username
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="your.agency.user"
                        data-testid="input-username"
                        disabled={loginMutation.isPending}
                        className="h-11 rounded-xl border-white/20 bg-white/10 text-white placeholder:text-blue-100/60 focus-visible:ring-sky-400"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-sm font-semibold text-blue-100/80">
                      <Lock className="h-4 w-4" />
                      Password
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="••••••••"
                        data-testid="input-password"
                        disabled={loginMutation.isPending}
                        className="h-11 rounded-xl border-white/20 bg-white/10 text-white placeholder:text-blue-100/60 focus-visible:ring-sky-400"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full rounded-xl bg-white py-3 text-base font-semibold text-slate-900 transition hover:bg-white/90"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </Form>

          <div className="space-y-2 text-center text-sm text-blue-100/70">
            <p>
              Don&rsquo;t have an account yet?{" "}
              <Button
                variant="link"
                onClick={() => (window.location.href = "/agency-registration")}
                className="p-0 text-blue-100 hover:text-white"
                data-testid="link-register"
              >
                Start your agency trial
              </Button>
            </p>
            <p>
              Looking for consumer access?{" "}
              <Button
                variant="link"
                onClick={() => (window.location.href = "/consumer-login")}
                className="p-0 text-blue-100 hover:text-white"
                data-testid="link-consumer"
              >
                Visit the consumer portal
              </Button>
            </p>
          </div>
        </div>
      </div>
    </AgencyAuthLayout>
  );
}