import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import externalApiRouter from "./external-api";
import { storage } from "./storage";
import { smsService } from "./smsService";
import { emailService } from "./emailService";

async function withTestServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use("/api/v2", externalApiRouter);
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    await run(`http://127.0.0.1:${port}/api/v2`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// Production mounts this router (server/routes.ts) before its own
// app.use(express.json()) call, so the router must parse its own body
// rather than relying on a parser mounted ahead of it. Mirror that order
// here instead of installing express.json() first, the way withTestServer
// above does.
async function withProductionOrderedTestServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use("/api/v2", externalApiRouter);
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    await run(`http://127.0.0.1:${port}/api/v2`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function stubTenantAuth() {
  (storage as any).getTenantByExternalApiKey = async (key: string) =>
    key === "valid-key" ? { tenantId: "tenant-1" } : null;
  (storage as any).getTenant = async () => ({ id: "tenant-1", isActive: true, chainCoreEnabled: true });
  (storage as any).getTenantSettings = async () => ({ campaignIntegrationEnabled: true });
  (storage as any).isPhoneNumberBlocked = async () => false;
  (storage as any).getConsumersByPhoneNumber = async () => [];
}

test("POST /send_text delivers via smsService and echoes the caller's externalId", async () => {
  stubTenantAuth();
  const originalSendSms = smsService.sendSms;
  let calledWith: any;
  (smsService as any).sendSms = async (to: string, message: string, tenantId: string) => {
    calledWith = { to, message, tenantId };
    return { success: true };
  };

  try {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/send_text`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-key", "Content-Type": "application/json" },
        body: JSON.stringify({ fileNumber: "1001", phoneNumber: "2025550101", message: "Your payment is due", externalId: "dmp-attempt-1" }),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(body, { success: true, data: { externalId: "dmp-attempt-1" } });
      assert.equal(calledWith.to, "2025550101");
      assert.equal(calledWith.message, "Your payment is due");
      assert.equal(calledWith.tenantId, "tenant-1");
    });
  } finally {
    (smsService as any).sendSms = originalSendSms;
  }
});

test("POST /send_text returns success:false (still HTTP 200) when the provider fails", async () => {
  stubTenantAuth();
  const originalSendSms = smsService.sendSms;
  (smsService as any).sendSms = async () => ({ success: false, error: "Twilio rejected the number" });

  try {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/send_text`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-key", "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: "2025550101", message: "Hi" }),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(body, { success: false, error: "Twilio rejected the number" });
    });
  } finally {
    (smsService as any).sendSms = originalSendSms;
  }
});

test("POST /send_text blocks a number on the tenant's block list before calling smsService", async () => {
  stubTenantAuth();
  (storage as any).isPhoneNumberBlocked = async () => true;
  const originalSendSms = smsService.sendSms;
  let called = false;
  (smsService as any).sendSms = async () => { called = true; return { success: true }; };

  try {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/send_text`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-key", "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: "2025550101", message: "Hi" }),
      });
      const body = await response.json();
      assert.deepEqual(body, { success: false, error: "Phone number is blocked" });
      assert.equal(called, false);
    });
  } finally {
    (smsService as any).sendSms = originalSendSms;
  }
});

test("POST /send_email_c2c delivers via emailService", async () => {
  stubTenantAuth();
  const originalSendEmail = emailService.sendEmail;
  let calledWith: any;
  (emailService as any).sendEmail = async (options: any) => {
    calledWith = options;
    return { success: true, messageId: "msg-1" };
  };

  try {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/send_email_c2c`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-key", "Content-Type": "application/json" },
        body: JSON.stringify({ fileNumber: "1001", emailAddress: "ada@example.test", subject: "Receipt", body: "<p>Paid</p>", externalId: "dmp-attempt-2" }),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(body, { success: true, data: { externalId: "dmp-attempt-2" } });
      assert.equal(calledWith.to, "ada@example.test");
      assert.equal(calledWith.subject, "Receipt");
      assert.equal(calledWith.html, "<p>Paid</p>");
      assert.equal(calledWith.tenantId, "tenant-1");
    });
  } finally {
    (emailService as any).sendEmail = originalSendEmail;
  }
});

test("send routes reject a request without a valid bearer key", async () => {
  stubTenantAuth();
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/send_text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: "2025550101", message: "Hi" }),
    });
    assert.equal(response.status, 401);
  });
});

test("POST /send_text still parses the body when mounted ahead of the app's JSON parser (production order)", async () => {
  stubTenantAuth();
  const originalSendSms = smsService.sendSms;
  let calledWith: any;
  (smsService as any).sendSms = async (to: string, message: string, tenantId: string) => {
    calledWith = { to, message, tenantId };
    return { success: true };
  };

  try {
    await withProductionOrderedTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/send_text`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-key", "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: "2025550101", message: "Your payment is due" }),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(calledWith.to, "2025550101");
      assert.equal(calledWith.message, "Your payment is due");
    });
  } finally {
    (smsService as any).sendSms = originalSendSms;
  }
});

test("POST /send_email_c2c still parses the body when mounted ahead of the app's JSON parser (production order)", async () => {
  stubTenantAuth();
  const originalSendEmail = emailService.sendEmail;
  let calledWith: any;
  (emailService as any).sendEmail = async (options: any) => {
    calledWith = options;
    return { success: true, messageId: "msg-1" };
  };

  try {
    await withProductionOrderedTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/send_email_c2c`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-key", "Content-Type": "application/json" },
        body: JSON.stringify({ emailAddress: "ada@example.test", subject: "Receipt", body: "<p>Paid</p>" }),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(calledWith.to, "ada@example.test");
    });
  } finally {
    (emailService as any).sendEmail = originalSendEmail;
  }
});
