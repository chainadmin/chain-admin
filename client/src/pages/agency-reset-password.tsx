import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Lock, CheckCircle, AlertCircle } from "lucide-react";
import { z } from "zod";
import { useState, useEffect } from "react";
import AgencyAuthLayout from "@/components/agency-auth-layout";

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordData = z.infer<typeof resetPasswordSchema>;

export default function AgencyResetPassword() {
  const { toast } = useToast();
  const [resetComplete, setResetComplete] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (!tokenParam) {
      setTokenError("Invalid reset link. Please request a new password reset.");
    } else {
      setToken(tokenParam);
    }
  }, []);

  const form = useForm<ResetPasswordData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordData) => {
      const response = await apiRequest("POST", "/api/agency/reset-password", {
        token,
        newPassword: data.newPassword,
      });
      return await response.json();
    },
    onSuccess: () => {
      setResetComplete(true);
    },
    onError: (error: any) => {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ResetPasswordData) => {
    resetPasswordMutation.mutate(data);
  };

  if (tokenError) {
    return (
      <AgencyAuthLayout
        badgeText="Password recovery"
        title="Invalid Link"
        description="This password reset link is invalid or has expired."
        contentClassName="p-8 sm:p-10"
      >
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0f1f3f]/40 p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-400 via-rose-300 to-pink-400" />
          <div className="relative z-10 space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">Invalid Reset Link</h2>
              <p className="text-sm text-blue-100/70">{tokenError}</p>
            </div>
            <Button
              onClick={() => (window.location.href = "/agency/forgot-password")}
              className="rounded-xl bg-white py-3 text-base font-semibold text-slate-900 transition hover:bg-white/90"
              data-testid="button-request-new"
            >
              Request New Reset Link
            </Button>
          </div>
        </div>
      </AgencyAuthLayout>
    );
  }

  if (resetComplete) {
    return (
      <AgencyAuthLayout
        badgeText="Password recovery"
        title="Password Reset Complete"
        description="Your password has been successfully updated."
        contentClassName="p-8 sm:p-10"
      >
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0f1f3f]/40 p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-green-400 via-emerald-300 to-teal-400" />
          <div className="relative z-10 space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">Password Updated</h2>
              <p className="text-sm text-blue-100/70">
                Your password has been successfully reset. You can now log in with your new password.
              </p>
            </div>
            <Button
              onClick={() => (window.location.href = "/agency-login")}
              className="rounded-xl bg-white py-3 px-8 text-base font-semibold text-slate-900 transition hover:bg-white/90"
              data-testid="button-go-to-login"
            >
              Go to Login
            </Button>
          </div>
        </div>
      </AgencyAuthLayout>
    );
  }

  return (
    <AgencyAuthLayout
      badgeText="Password recovery"
      title="Set a new password"
      description="Choose a strong password to secure your account."
      contentClassName="p-8 sm:p-10"
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0f1f3f]/40 p-6 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400" />
        <div className="relative z-10 space-y-6">
          <div className="space-y-2 text-center sm:text-left">
            <p className="text-sm uppercase tracking-wide text-blue-100/70">New password</p>
            <h2 className="text-2xl font-semibold text-white">Create your new password</h2>
            <p className="text-sm text-blue-100/70">
              Your password must be at least 8 characters long.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-sm font-semibold text-blue-100/80">
                      <Lock className="h-4 w-4" />
                      New Password
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="••••••••"
                        data-testid="input-new-password"
                        disabled={resetPasswordMutation.isPending}
                        className="h-11 rounded-xl border-white/20 bg-white/10 text-white placeholder:text-blue-100/60 focus-visible:ring-sky-400"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-sm font-semibold text-blue-100/80">
                      <Lock className="h-4 w-4" />
                      Confirm Password
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="••••••••"
                        data-testid="input-confirm-password"
                        disabled={resetPasswordMutation.isPending}
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
                disabled={resetPasswordMutation.isPending}
                data-testid="button-reset-password"
              >
                {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </AgencyAuthLayout>
  );
}
