import { CHIAMO_REGISTRATION_NOTIFICATION_RECIPIENTS, CHIAMO_SUPPORT_EMAIL } from "@shared/chiamo";
import type { EmailOptions } from "./emailService";

export interface ChiamoLeadEmailDetails {
  businessName: string;
  firstName: string;
  lastName: string;
  businessEmail: string;
  businessPhone: string;
  phoneUsersNeeded: number;
  planInterest: string;
  textingInterest: boolean;
}

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

export function buildChiamoLeadEmails(lead: ChiamoLeadEmailDetails): { admin: EmailOptions; customer: EmailOptions } {
  const businessName = escapeHtml(lead.businessName);
  const firstName = escapeHtml(lead.firstName);
  const lastName = escapeHtml(lead.lastName);
  const businessEmail = escapeHtml(lead.businessEmail);
  const businessPhone = escapeHtml(lead.businessPhone);
  const planInterest = escapeHtml(lead.planInterest);

  return {
    admin: {
      to: CHIAMO_REGISTRATION_NOTIFICATION_RECIPIENTS.join(","),
      from: CHIAMO_SUPPORT_EMAIL,
      replyTo: CHIAMO_SUPPORT_EMAIL,
      subject: `New Chiamo Connect Company Registration: ${lead.businessName}`,
      html: `
        <h2>New Chiamo Connect Company Registration</h2>
        <p>A new company has registered its interest in Chiamo Connect:</p>
        <table style="border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; font-weight: bold;">Company Name:</td><td style="padding: 8px;">${businessName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Contact:</td><td style="padding: 8px;">${firstName} ${lastName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${businessEmail}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Phone:</td><td style="padding: 8px;">${businessPhone}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Phone Users:</td><td style="padding: 8px;">${lead.phoneUsersNeeded}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Plan Interest:</td><td style="padding: 8px;">${planInterest}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Business Texting:</td><td style="padding: 8px;">${lead.textingInterest ? "Interested" : "Not requested"}</td></tr>
        </table>
        <p><strong>Action Required:</strong> Reach out to this company to review its business phone needs.</p>
      `,
      tag: "chiamo-lead",
    },
    customer: {
      to: lead.businessEmail,
      from: CHIAMO_SUPPORT_EMAIL,
      replyTo: CHIAMO_SUPPORT_EMAIL,
      subject: "Thank you for registering with Chiamo Connect",
      html: `
        <p>Hello ${firstName},</p>
        <p>Thank you for registering with Chiamo Connect.</p>
        <p>We're excited to learn more about your business and how Chiamo Connect can support your communications. Our team will reach out soon to review your business phone needs, answer your questions, and help identify the right setup for your company.</p>
        <p>We look forward to speaking with you.</p>
        <p>
          Best regards,<br/>
          Chiamo Connect<br/>
          support@chiamoconnect.com<br/>
          chiamoconnect.com
        </p>
      `,
      tag: "chiamo-welcome-email",
    },
  };
}

export type ChiamoEmailDeliveryResult = {
  messageId: string;
  success: boolean;
  error?: string;
};

export async function sendChiamoLeadEmails(
  lead: ChiamoLeadEmailDetails,
  sendEmail: (email: EmailOptions) => Promise<ChiamoEmailDeliveryResult>,
) {
  const emails = buildChiamoLeadEmails(lead);
  const safeSend = async (email: EmailOptions): Promise<ChiamoEmailDeliveryResult> => {
    try {
      return await sendEmail(email);
    } catch (error) {
      return {
        messageId: "",
        success: false,
        error: error instanceof Error ? error.message : "Postmark delivery failed",
      };
    }
  };

  const [admin, customer] = await Promise.all([
    safeSend(emails.admin),
    safeSend(emails.customer),
  ]);
  return { admin, customer };
}
