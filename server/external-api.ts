import express from "express";
import { z } from "zod";
import { storage } from "./storage";
import { smsService } from "./smsService";
import { emailService } from "./emailService";

type ExternalApiRequest = express.Request & { tenantId?: string };

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

router.post("/campaigns/send", async (req: ExternalApiRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const body = sendCampaignSchema.parse(req.body);
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

    res.json({
      campaignLogId: campaignLog.id,
      totalSent,
      totalFailed,
      totalSkipped,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.errors });
    }

    console.error("Error sending external campaign:", error);
    res.status(500).json({ message: "Failed to send campaign" });
  }
});

export default router;
