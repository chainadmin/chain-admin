import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, Mail, Phone } from "lucide-react";
import { useLocation } from "wouter";
import PublicHeroLayout from "@/components/public-hero-layout";

export default function PrivacyPolicy() {
  const [, navigate] = useLocation();

  return (
    <PublicHeroLayout
      badgeText="Policy center"
      title="Privacy notice"
      description="Understand how Chain Software Group protects your information, communicates with you, and supports your rights as a consumer."
      supportingContent={(
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
              <ShieldCheck className="h-5 w-5 text-blue-200" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Security first</p>
              <p className="text-sm text-blue-100/70">Data encryption, role-based access, and audit trails keep your information safe.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
              <Mail className="h-5 w-5 text-blue-200" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Clear communication</p>
              <p className="text-sm text-blue-100/70">Opt in and out of SMS, email, or push at any time—your preferences are honored instantly.</p>
            </div>
          </div>
        </div>
      )}
      headerActions={(
        <Button
          variant="ghost"
          className="text-blue-100 hover:bg-white/10"
          onClick={() => navigate("/")}
        >
          Back to home
        </Button>
      )}
      showDefaultHeaderActions={false}
      contentClassName="p-8 sm:p-10"
    >
      <div className="space-y-8 text-left text-white">
        <Button
          onClick={() => window.history.back()}
          variant="ghost"
          className="w-fit text-blue-100 hover:bg-white/10"
          data-testid="button-back"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm shadow-lg shadow-blue-900/20 backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">Privacy notice</h2>
              <p className="text-xs uppercase tracking-[0.2em] text-blue-200">Last updated January 2025</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-blue-100/60">
              <Phone className="h-4 w-4" />
              <span>(716) 534-3086</span>
            </div>
          </div>

          <div className="prose prose-invert mt-6 max-w-none space-y-6 text-blue-100/80">
            <section>
              <h3>Controller/Processor roles</h3>
              <p>Chain operates the platform and generally acts as a processor/service provider for participating agencies, who are responsible for the debts and related notices. For some operations (e.g., app analytics, account creation) Chain may act as an independent controller.</p>
            </section>

            <section>
              <h3>What we collect</h3>
              <p>Identifiers (name, email, phone), account references provided by agencies, device data, app usage, communication preferences, consent logs.</p>
              <p>Payment details are processed by integrated processors; we store only tokens or metadata where needed—never full card or bank numbers.</p>
            </section>

            <section>
              <h3>Why we use data</h3>
              <p>Provide and secure the service, display account details, deliver communications (SMS/email/push), support you, prevent fraud, and comply with legal requirements.</p>
            </section>

            <section>
              <h3>Communications & consent</h3>
              <p>By opting in within the app, you agree to receive account-related messages by SMS, email, and push. Message and data rates may apply. Reply STOP to SMS to opt out; use unsubscribe links for email; disable push in device or app settings. Consent is not required to obtain services. We log all consent and opt-out events.</p>
            </section>

            <section>
              <h3>Sharing</h3>
              <p>We may share data with the agency responsible for your account, with vendors (hosting, messaging, analytics, payment), as required by law, or during a merger or acquisition with notice.</p>
            </section>

            <section>
              <h3>Your choices</h3>
              <p>Manage notification preferences in the app; opt out of SMS by replying STOP; request copies or deletion of data (subject to legal retention) via support@chainsoftwaregroup.com.</p>
            </section>

            <section>
              <h3>Data security & retention</h3>
              <p>We use industry safeguards such as encryption in transit and role-based access. Data is retained as long as needed for the purposes above or as required by law or agency contracts.</p>
            </section>

            <section>
              <h3>Contact</h3>
              <p>
                Email: <a href="mailto:support@chainsoftwaregroup.com">support@chainsoftwaregroup.com</a><br />
                Phone: (716) 534-3086<br />
                Mail: 1845 Cleveland Ave, Niagara Falls, NY
              </p>
            </section>
          </div>
        </div>
      </div>
    </PublicHeroLayout>
  );
}