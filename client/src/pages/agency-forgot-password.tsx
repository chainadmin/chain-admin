import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { z } from "zod";
import { useState } from "react";
import AgencyAuthLayout from "@/components/agency-auth-layout";

const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, "Username or email is required"),
});

type ForgotPasswordData = z.infer<typeof forgotPasswordSchema>;

export default function AgencyForgotPassword() {
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<ForgotPasswordData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      identifier: "",
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordData) => {
      const response = await apiRequest("POST", "/api/agency/forgot-password", data);
      return await response.json();
    },
    onSuccess: () => {
      setEmailSent(true);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process request",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ForgotPasswordData) => {
    forgotPasswordMutation.mutate(data);
  };

  if (emailSent) {
    return (
      <AgencyAuthLayout
        badgeText="Password recovery"
        title="Check your email"
        description="If an account exists with the provided username or email, we've sent instructions to reset your password."
        contentClassName="p-8 sm:p-10"
      >
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0f1f3f]/40 p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-green-400 via-emerald-300 to-teal-400" />
          <div className="relative z-10 space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">Email Sent</h2>
              <p className="text-sm text-blue-100/70">
                Check your inbox for a password reset link. The link will expire in 1 hour.
              </p>
              <p className="text-sm text-blue-100/50">
                Don't see the email? Check your spam folder.
              </p>
            </div>
            <Button
              variant="link"
              onClick={() => (window.location.href = "/agency-login")}
              className="text-blue-100 hover:text-white"
              data-testid="link-back-to-login"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to login
            </Button>
          </div>
        </div>
      </AgencyAuthLayout>
    );
  }

  return (
    <AgencyAuthLayout
      badgeText="Password recovery"
      title="Forgot your password?"
      description="Enter your username or email address and we'll send you a link to reset your password."
      contentClassName="p-8 sm:p-10"
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0f1f3f]/40 p-6 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400" />
        <div className="relative z-10 space-y-6">
          <div className="space-y-2 text-center sm:text-left">
            <p className="text-sm uppercase tracking-wide text-blue-100/70">Password reset</p>
            <h2 className="text-2xl font-semibold text-white">Reset your password</h2>
            <p className="text-sm text-blue-100/70">
              We'll send a secure link to your email address to set a new password.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-sm font-semibold text-blue-100/80">
                      <Mail className="h-4 w-4" />
                      Username or Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="your.username or email@company.com"
                        data-testid="input-identifier"
                        disabled={forgotPasswordMutation.isPending}
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
                disabled={forgotPasswordMutation.isPending}
                data-testid="button-send-reset"
              >
                {forgotPasswordMutation.isPending ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>
          </Form>

          <div className="text-center">
            <Button
              variant="link"
              onClick={() => (window.location.href = "/agency-login")}
              className="text-blue-100 hover:text-white"
              data-testid="link-back-to-login"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to login
            </Button>
          </div>
        </div>
      </div>
    </AgencyAuthLayout>
  );
}
