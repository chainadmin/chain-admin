import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Scale, Bell } from "lucide-react";
import { useLocation } from "wouter";
import PublicHeroLayout from "@/components/public-hero-layout";

export default function TermsOfService() {
  const [, navigate] = useLocation();

  return (
    <PublicHeroLayout
      badgeText="Policy center"
      title="Consumer terms of service"
      description="The rules that govern your use of the Chain consumer experience, including messaging, payments, and dispute resolution."
      supportingContent={(
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
              <FileText className="h-5 w-5 text-blue-200" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Plain-language commitments</p>
              <p className="text-sm text-blue-100/70">Know exactly what you can expect when using the consumer portal.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
              <Scale className="h-5 w-5 text-blue-200" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Fair use principles</p>
              <p className="text-sm text-blue-100/70">Transparency around communications, payments, and dispute handling.</p>
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
              <h2 className="text-2xl font-semibold text-white">Consumer Terms of Service</h2>
              <p className="text-xs uppercase tracking-[0.2em] text-blue-200">Last updated January 2025</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-blue-100/60">
              <Bell className="h-4 w-4" />
              <span>Notifications & messaging guidelines</span>
            </div>
          </div>

          <div className="prose prose-invert mt-6 max-w-none space-y-6 text-blue-100/80">
            <section>
              <p>
                <strong>Company:</strong> Chain Software Group (“Chain”, “we”, “us”)<br />
                <strong>Website/App:</strong> chainsoftwaregroup.com<br />
                <strong>Contact:</strong> support@chainsoftwaregroup.com | (716) 534-3086 | 1845 Cleveland Ave, Niagara Falls, NY
              </p>
            </section>

            <section>
              <h3>1. Acceptance</h3>
              <p>By creating an account, accessing, or using the app, you agree to these terms and our privacy notice. If you do not agree, please discontinue use.</p>
            </section>

            <section>
              <h3>2. The service</h3>
              <p>The app provides a communication portal where consumers can view account information supplied by participating agencies and receive messages or notifications. Payment options may be offered by agencies through integrated processors. Chain is the platform provider and does not originate or service consumer debts.</p>
            </section>

            <section>
              <h3>3. Eligibility; your account</h3>
              <p>You must be 18+ and reside in the United States to use the app. You are responsible for maintaining the confidentiality of your login and for all activity under your account.</p>
            </section>

            <section>
              <h3>4. Consumer communications & consent</h3>
              <p>You agree that Chain and participating agencies may send automated and non-automated communications about your accounts by SMS/text, email, and push notifications.</p>
              <ul>
                <li><strong>SMS/Text:</strong> Message and data rates may apply. Message frequency varies. Reply STOP to stop, HELP for help.</li>
                <li><strong>Email:</strong> Unsubscribe using the link in any message.</li>
                <li><strong>Push:</strong> Disable push in your device or app settings.</li>
              </ul>
              <p><strong>Consent not required:</strong> Consent to automated messages is not required as a condition of any service, plan, or settlement.</p>
              <p><strong>Recordkeeping:</strong> We maintain consent and opt-out logs. Manage preferences in the app or contact support@chainsoftwaregroup.com or (716) 534-3086.</p>
            </section>

            <section>
              <h3>5. Payment features</h3>
              <p>Payments may be facilitated via third-party processors (e.g., card/ACH). You authorize the processor and the relevant agency to charge your selected payment method in line with any plan or one-time authorization you accept. Payment disputes, refunds, chargebacks, or payoff letters are handled by the agency responsible for your account.</p>
            </section>

            <section>
              <h3>6. Refunds and returns policy</h3>
              <p><strong>ALL PAYMENTS ARE FINAL.</strong> Any request for a refund, reversal, chargeback, or return of a payment made through this platform must be directed to the agency or creditor responsible for servicing your account ("Servicing Agency"). Chain Software Group acts solely as a technology platform provider and payment facilitator; we do not control, process, or have the authority to authorize refunds or payment reversals on behalf of any Servicing Agency.</p>
              <p>To request a refund or dispute a payment, you must contact the Servicing Agency directly using the contact information provided in your account portal or on any correspondence you have received from them. The Servicing Agency shall have sole discretion to approve or deny any refund request in accordance with their own policies and applicable law. Chain Software Group disclaims any liability arising from the Servicing Agency's decision to grant or deny a refund.</p>
              <p>You acknowledge that initiating a chargeback or payment dispute with your financial institution without first attempting to resolve the matter directly with the Servicing Agency may result in additional fees, collection activity, or adverse reporting, as permitted by law and the Servicing Agency's policies.</p>
            </section>

            <section>
              <h3>7. User conduct; prohibited uses</h3>
              <p>You agree not to use the app for unlawful purposes, attempt to access data that is not yours, interfere with security or integrity, reverse engineer or scrape the service, or impersonate others.</p>
            </section>

            <section>
              <h3>8. Privacy & data retention</h3>
              <p>Our collection and use of personal information is described in our privacy notice. Agencies are independent entities and may have their own privacy obligations as controllers of their consumer data.</p>
              <p><strong>Data retention:</strong> Chain Software Group retains consumer information (including names, email addresses, phone numbers, and account details) uploaded by participating agencies. This data is stored to provide platform services, maintain communication records, support dispute resolution, ensure regulatory compliance, and protect the integrity of our platform. Data may be retained beyond the duration of your relationship with any individual agency.</p>
            </section>

            <section>
              <h3>9. Disclaimers</h3>
              <p>The app is provided “as is.” We disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee the accuracy of account data provided by agencies.</p>
            </section>

            <section>
              <h3>10. Limitation of liability</h3>
              <p>To the maximum extent permitted by law, Chain and its affiliates are not liable for any indirect, incidental, special, consequential or punitive damages, or any loss of profits, data, or goodwill arising from or relating to your use of the app. Our total liability shall not exceed the greater of $100 or the amount you paid to us in the 12 months before the claim.</p>
            </section>

            <section>
              <h3>11. Dispute resolution; arbitration; class action waiver</h3>
              <p>Any dispute will be resolved by binding arbitration on an individual basis. You waive any right to participate in a class action or class-wide arbitration. You may opt out of arbitration within 30 days of account creation by emailing support@chainsoftwaregroup.com with your name and the subject “Arbitration Opt-Out.”</p>
            </section>

            <section>
              <h3>12. Changes</h3>
              <p>We may update these terms by posting the revised version with a new “last updated” date. Your continued use constitutes acceptance. Material changes will be notified within the app or by email/SMS where appropriate.</p>
            </section>

            <section>
              <h3>13. Termination</h3>
              <p>We may suspend or terminate your access for any reason. Sections intended to survive termination will continue in effect.</p>
            </section>

            <section>
              <h3>14. Contact</h3>
              <p>Questions? support@chainsoftwaregroup.com | 1845 Cleveland Ave, Niagara Falls, NY</p>
            </section>
          </div>
        </div>
      </div>
    </PublicHeroLayout>
  );
}