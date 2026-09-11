import express from "express";
import { z } from "zod";
import { storage } from "./storage";
import { smsService } from "./smsService";
import { emailService } from "./emailService";

type ExternalApiRequest = express.Request & { tenantId?: string };

// Original contract: the caller references a template Chain already owns
// and stores by UUID, and only supplies raw contact values. Chain renders
// the template itself.
const sendCampaignSchema = z.object({
  campaignName: z.string().min(1),
  templateId: z.string().uuid(),
  type: z.enum(["sms", "email"]),
  fromNumber: z.string().optional(),
  contacts: z.array(z.object({
    fileNumber: z.string().optional().default(""),
    contactValue: z.string().min(1),
  })).min(1),
});

// DMP's contract: DMP owns and renders its own templates per debtor and
// ships the finished subject/body - it has no Chain template UUID to send,
// and never will, since the two systems keep independent template stores.
const sendRenderedCampaignSchema = z.object({
  campaignName: z.string().min(1),
  campaignType: z.enum(["sms", "email"]),
  accounts: z.array(z.object({
    fileNumber: z.string().optional().default(""),
    contactValue: z.string().min(1),
    renderedSubject: z.string().optional().default(""),
    renderedBody: z.string().min(1),
  })).min(1),
});

const router = express.Router();

router.use(async (req: ExternalApiRequest, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.slice(7).trim();
  const tenant = await storage.getTenantByExternalApiKey(token);

  if (!tenant?.tenantId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const activeTenant = await storage.getTenant(tenant.tenantId);
  if (!activeTenant || activeTenant.isActive !== true || activeTenant.chainCoreEnabled !== true) {
    return res.status(403).json({ message: "Chain API access is disabled" });
  }

  const settings = await storage.getTenantSettings(tenant.tenantId);
  if (!settings?.campaignIntegrationEnabled) {
    return res.status(403).json({ message: "Campaign integration is disabled" });
  }

  req.tenantId = tenant.tenantId;
  next();
});

router.get("/campaigns", async (req: ExternalApiRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const campaignType = req.query.type === "email" ? "email" : "sms";

    if (campaignType === "sms") {
      const templates = await storage.getSmsTemplatesByTenant(tenantId);
      return res.json(templates.map((template) => ({ id: template.id, name: template.name })));
    }

    const templates = await storage.getEmailTemplatesByTenant(tenantId);
    return res.json(templates.map((template) => ({ id: template.id, name: template.name })));
  } catch (error) {
    console.error("Error fetching external campaigns:", error);
    res.status(500).json({ message: "Failed to fetch campaigns" });
  }
});

async function sendCampaignWithChainTemplate(
  tenantId: string,
  body: z.infer<typeof sendCampaignSchema>,
  res: express.Response,
) {
  const contactType = body.type === "sms" ? "phone" : "email";

  const campaignLog = await storage.createCampaignLog({
    tenantId,
    campaignName: body.campaignName,
    templateId: body.templateId,
    campaignType: body.type,
    totalContacts: body.contacts.length,
    totalSent: 0,
    totalFailed: 0,
    totalSkipped: 0,
    status: "sending",
  });

  const smsTemplate = body.type === "sms"
    ? (await storage.getSmsTemplatesByTenant(tenantId)).find((template) => template.id === body.templateId)
    : null;
  const emailTemplate = body.type === "email"
    ? (await storage.getEmailTemplatesByTenant(tenantId)).find((template) => template.id === body.templateId)
    : null;

  if ((body.type === "sms" && !smsTemplate) || (body.type === "email" && !emailTemplate)) {
    await storage.updateCampaignLog(campaignLog.id, { status: "failed", totalFailed: body.contacts.length });
    return res.status(400).json({ message: "Template not found for tenant" });
  }

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const contact of body.contacts) {
    const item = await storage.createCampaignLogItem({
      campaignLogId: campaignLog.id,
      fileNumber: contact.fileNumber || "",
      contactValue: contact.contactValue,
      contactType,
      status: "pending",
    });

    if (body.type === "sms") {
      const normalizedPhone = contact.contactValue.replace(/\D/g, "");
      const isBlocked = await storage.isPhoneNumberBlocked(tenantId, normalizedPhone);
      if (isBlocked) {
        totalSkipped += 1;
        await storage.updateCampaignLogItem(item.id, {
          status: "skipped",
          skipReason: "blocked_number",
          errorMessage: "Phone number is blocked",
        });
        continue;
      }

      const consumers = await storage.getConsumersByPhoneNumber(normalizedPhone, tenantId);
      const optedOut = consumers.some((consumer: any) => Boolean(consumer.smsOptedOut));
      if (optedOut) {
        totalSkipped += 1;
        await storage.updateCampaignLogItem(item.id, {
          status: "skipped",
          skipReason: "opted_out",
          errorMessage: "Consumer has opted out of SMS",
        });
        continue;
      }

      const result = await smsService.sendSms(contact.contactValue, smsTemplate!.message, tenantId);
      if (result.success) {
        totalSent += 1;
        await storage.updateCampaignLogItem(item.id, { status: "sent" });
      } else {
        totalFailed += 1;
        await storage.updateCampaignLogItem(item.id, {
          status: "failed",
          errorMessage: result.error || "Failed to send SMS",
        });
      }
    } else {
      const result = await emailService.sendEmail({
        to: contact.contactValue,
        subject: emailTemplate!.subject,
        html: emailTemplate!.html,
        tenantId,
        useBroadcastStream: true,
        metadata: {
          source: "external_campaign_api",
          campaignLogId: campaignLog.id,
          fileNumber: contact.fileNumber || "",
        },
      });

      if (result.success) {
        totalSent += 1;
        await storage.updateCampaignLogItem(item.id, { status: "sent" });
      } else {
        totalFailed += 1;
        await storage.updateCampaignLogItem(item.id, {
          status: "failed",
          errorMessage: result.error || "Failed to send email",
        });
      }
    }
  }

  await storage.updateCampaignLog(campaignLog.id, {
    totalSent,
    totalFailed,
    totalSkipped,
    status: totalFailed === body.contacts.length ? "failed" : "completed",
  });

  res.json({ campaignLogId: campaignLog.id, totalSent, totalFailed, totalSkipped });
}

async function sendPreRenderedCampaign(
  tenantId: string,
  body: z.infer<typeof sendRenderedCampaignSchema>,
  res: express.Response,
) {
  const contactType = body.campaignType === "sms" ? "phone" : "email";

  const campaignLog = await storage.createCampaignLog({
    tenantId,
    campaignName: body.campaignName,
    templateId: null,
    campaignType: body.campaignType,
    totalContacts: body.accounts.length,
    totalSent: 0,
    totalFailed: 0,
    totalSkipped: 0,
    status: "sending",
  });

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const account of body.accounts) {
    const item = await storage.createCampaignLogItem({
      campaignLogId: campaignLog.id,
      fileNumber: account.fileNumber || "",
      contactValue: account.contactValue,
      contactType,
      status: "pending",
    });

    if (body.campaignType === "sms") {
      const normalizedPhone = account.contactValue.replace(/\D/g, "");
      const isBlocked = await storage.isPhoneNumberBlocked(tenantId, normalizedPhone);
      if (isBlocked) {
        totalSkipped += 1;
        await storage.updateCampaignLogItem(item.id, {
          status: "skipped",
          skipReason: "blocked_number",
          errorMessage: "Phone number is blocked",
        });
        continue;
      }

      const consumers = await storage.getConsumersByPhoneNumber(normalizedPhone, tenantId);
      const optedOut = consumers.some((consumer: any) => Boolean(consumer.smsOptedOut));
      if (optedOut) {
        totalSkipped += 1;
        await storage.updateCampaignLogItem(item.id, {
          status: "skipped",
          skipReason: "opted_out",
          errorMessage: "Consumer has opted out of SMS",
        });
        continue;
      }

      const result = await smsService.sendSms(account.contactValue, account.renderedBody, tenantId);
      if (result.success) {
        totalSent += 1;
        await storage.updateCampaignLogItem(item.id, { status: "sent" });
      } else {
        totalFailed += 1;
        await storage.updateCampaignLogItem(item.id, {
          status: "failed",
          errorMessage: result.error || "Failed to send SMS",
        });
      }
    } else {
      const result = await emailService.sendEmail({
        to: account.contactValue,
        subject: account.renderedSubject || body.campaignName,
        html: account.renderedBody,
        tenantId,
        useBroadcastStream: true,
        metadata: {
          source: "external_campaign_api",
          campaignLogId: campaignLog.id,
          fileNumber: account.fileNumber || "",
        },
      });

      if (result.success) {
        totalSent += 1;
        await storage.updateCampaignLogItem(item.id, { status: "sent" });
      } else {
        totalFailed += 1;
        await storage.updateCampaignLogItem(item.id, {
          status: "failed",
          errorMessage: result.error || "Failed to send email",
        });
      }
    }
  }

  await storage.updateCampaignLog(campaignLog.id, {
    totalSent,
    totalFailed,
    totalSkipped,
    status: totalFailed === body.accounts.length ? "failed" : "completed",
  });

  res.json({ campaignLogId: campaignLog.id, totalSent, totalFailed, totalSkipped });
}

router.post("/campaigns/send", async (req: ExternalApiRequest, res) => {
  try {
    const tenantId = req.tenantId!;

    // Two request shapes are accepted here: the original templateId +
    // contacts contract (the caller references a template Chain already
    // stores), and a pre-rendered contract (the caller - e.g. DMP - renders
    // its own template per contact and ships the finished text, since it
    // has no Chain template UUID to reference). Try the original contract
    // first since it is the one other integrations already rely on.
    const legacyParsed = sendCampaignSchema.safeParse(req.body);
    if (legacyParsed.success) {
      return await sendCampaignWithChainTemplate(tenantId, legacyParsed.data, res);
    }

    const renderedParsed = sendRenderedCampaignSchema.safeParse(req.body);
    if (renderedParsed.success) {
      return await sendPreRenderedCampaign(tenantId, renderedParsed.data, res);
    }

    return res.status(400).json({ message: "Invalid payload", errors: legacyParsed.error.errors });
  } catch (error) {
    console.error("Error sending external campaign:", error);
    res.status(500).json({ message: "Failed to send campaign" });
  }
});

export default router;
