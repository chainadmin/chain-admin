import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageCircle, ShieldCheck, Phone } from "lucide-react";
import { useLocation } from "wouter";
import PublicHeroLayout from "@/components/public-hero-layout";

export default function SmsOptInDisclosure() {
  const [, navigate] = useLocation();

  return (
    <PublicHeroLayout
      badgeText="Policy center"
      title="SMS opt-in disclosure"
      description="How Chain Software Group uses text messaging, the rights you have under federal law, and the ways you can manage consent."
      supportingContent={(
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
              <MessageCircle className="h-5 w-5 text-blue-200" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Clear consent choices</p>
              <p className="text-sm text-blue-100/70">Opt in voluntarily and update your preferences whenever you need to.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
              <ShieldCheck className="h-5 w-5 text-blue-200" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Compliance focused</p>
              <p className="text-sm text-blue-100/70">Our messaging practices align with the Telephone Consumer Protection Act (TCPA).</p>
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
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm shadow-lg shadow-blue-900/20 backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">SMS Opt-In Disclosure</h2>
              <p className="text-xs uppercase tracking-[0.2em] text-blue-200">Last updated January 2025</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-blue-100/60">
              <Phone className="h-4 w-4" />
              <span>Messaging transparency & consumer rights</span>
            </div>
          </div>

          <div className="prose prose-invert mt-6 max-w-none space-y-6 text-blue-100/80">
            <section>
              <h3>1. Consent overview</h3>
              <p>
                When you opt in, you authorize Chain Software Group ("Chain", "we", "us") to send informational SMS/text messages to the mobile number you provide during registration. Messages may cover account access, service updates, authentication codes, and reminders relevant to your relationship with Chain.
              </p>
              <p>
                Participation is completely voluntary. You may withhold or withdraw consent without affecting your ability to access the platform through other channels.
              </p>
            </section>

            <section>
              <h3>2. Message frequency and charges</h3>
              <p>
                Message frequency varies based on your activity and preferences. Standard message and data rates may apply as determined by your wireless carrier. Chain does not charge separate fees for SMS delivery.
              </p>
              <p>
                We send messages in compliance with the Telephone Consumer Protection Act (TCPA) and related FCC guidance, using consent and opt-out logs to document your preferences.
              </p>
            </section>

            <section>
              <h3>3. Managing your preferences</h3>
              <ul>
                <li><strong>Opt out anytime:</strong> Reply STOP to any message to halt SMS communications. You may also contact support@chainsoftwaregroup.com or call (716) 534-3086 to update your preference.</li>
                <li><strong>Need assistance:</strong> Reply HELP to receive customer support information.</li>
                <li><strong>Updating your number:</strong> Provide accurate, up-to-date contact details. Notify us immediately if you change or reassign your mobile number.</li>
              </ul>
            </section>

            <section>
              <h3>4. Data handling</h3>
              <p>
                We use your phone number solely to deliver the SMS updates you request and to maintain compliance records. We do not sell or lease your mobile number. Storage and processing of personal information follow our privacy policy and industry-standard security practices.
              </p>
            </section>

            <section>
              <h3>5. Contacting Chain</h3>
              <p>
                Reach our support team at support@chainsoftwaregroup.com or (716) 534-3086 if you have questions about this disclosure or wish to review your messaging status. Written requests may be mailed to 1845 Cleveland Ave, Niagara Falls, NY 14305.
              </p>
            </section>
          </div>
        </div>
      </div>
    </PublicHeroLayout>
  );
}
