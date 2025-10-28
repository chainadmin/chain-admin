# Webhook Setup for Railway Deployment

## Overview

This platform uses webhooks for real-time tracking of SMS delivery, email opens, and inbound communications. When deploying on Railway, you need to configure webhook URLs to point to your Railway domain.

---

## Step 1: Set APP_URL Environment Variable

In your Railway project, add the `APP_URL` environment variable:

1. Go to Railway Dashboard → Your Project → Service
2. Click **Variables** tab
3. Add new variable:
   - **Name:** `APP_URL`
   - **Value:** `https://your-railway-domain.railway.app` (use your actual Railway domain)

**Example:**
```
APP_URL=https://chain-production.up.railway.app
```

4. Click **Add** and **Redeploy** your service

---

## Step 2: Configure Twilio Webhooks

### SMS Status Callback (Delivery Tracking)

The SMS status callback is automatically configured in the code when sending messages. It uses your `APP_URL` to construct:
```
https://your-railway-domain.railway.app/api/webhooks/twilio
```

**No additional Twilio Console configuration needed** - this is set per-message via the API.

### Inbound SMS Webhook

Configure this in the Twilio Console for each phone number:

1. Go to [Twilio Console](https://console.twilio.com/) → Phone Numbers → Active Numbers
2. Select your phone number
3. Scroll to **Messaging Configuration**
4. Under "A MESSAGE COMES IN", set:
   - **Webhook:** `https://your-railway-domain.railway.app/api/webhooks/twilio-inbound`
   - **HTTP Method:** POST
5. Click **Save**

---

## Step 3: Configure Postmark Webhooks

### Email Tracking Webhook (Open/Click/Bounce/Delivery)

1. Go to [Postmark](https://account.postmarkapp.com/) → Your Server
2. Click **Webhooks** tab
3. Click **Add webhook**
4. Configure:
   - **Webhook URL:** `https://your-railway-domain.railway.app/api/webhooks/postmark`
   - **Select Events:**
     - ✅ Open
     - ✅ Click
     - ✅ Bounce
     - ✅ Delivery
     - ✅ Spam Complaint
   - **Include Bounce Content:** Yes
5. Click **Save webhook**

### Inbound Email Webhook

1. In the same Postmark server settings
2. Click **Inbound** tab
3. Set **Inbound webhook URL:** `https://your-railway-domain.railway.app/api/webhooks/postmark-inbound`
4. Click **Save changes**

---

## Step 4: Test Webhooks

### Test SMS Delivery Tracking

1. Send a test SMS from your platform
2. Check Railway logs for:
   ```
   📱 Twilio webhook received: { MessageSid: "...", MessageStatus: "delivered" }
   ✅ Twilio webhook processed successfully - X SMS segments recorded
   ```

### Test Inbound SMS

1. Reply to an SMS from a consumer
2. Check Railway logs for:
   ```
   📱 Inbound SMS received from +1234567890: "test message"
   ✅ Inbound SMS processed successfully
   ```

### Test Email Tracking

1. Send a test email from your platform
2. Open the email in your inbox
3. Check Railway logs for:
   ```
   Received Postmark webhook: { RecordType: "Open", Recipient: "..." }
   ```

### Test Inbound Email

1. Reply to an email sent from your platform
2. Check Railway logs for:
   ```
   📧 Inbound email received from: user@example.com
   ✅ Inbound email processed successfully
   ```

---

## Webhook URLs Summary

Replace `your-railway-domain.railway.app` with your actual Railway domain:

| Service | Webhook Type | URL |
|---------|-------------|-----|
| Twilio | SMS Status | `https://your-railway-domain.railway.app/api/webhooks/twilio` |
| Twilio | Inbound SMS | `https://your-railway-domain.railway.app/api/webhooks/twilio-inbound` |
| Postmark | Email Tracking | `https://your-railway-domain.railway.app/api/webhooks/postmark` |
| Postmark | Inbound Email | `https://your-railway-domain.railway.app/api/webhooks/postmark-inbound` |

---

## Troubleshooting

### Webhooks Not Receiving Data

1. **Check APP_URL is set correctly:**
   ```bash
   # In Railway logs, you should see the correct webhook URLs
   # when SMS is sent
   ```

2. **Verify Railway domain is accessible:**
   ```bash
   curl https://your-railway-domain.railway.app/api/health
   ```

3. **Check webhook authentication:**
   - Twilio webhooks are unauthenticated (validated by Twilio signature if needed)
   - Postmark webhooks are unauthenticated (can be secured by Postmark webhook secret)

4. **Review Railway logs:**
   - Go to Railway Dashboard → Your Service → Deployments
   - Click on the latest deployment
   - Check logs for webhook errors

### SMS Status Not Updating

- Ensure `APP_URL` environment variable is set
- Redeploy after setting the variable
- Check Twilio logs for webhook delivery attempts

### Email Opens Not Tracking

- Verify Postmark webhook is configured correctly
- Check that webhook URL matches your Railway domain exactly
- Ensure "Open" event is selected in Postmark webhook settings

---

## Security Notes

- All webhook endpoints accept POST requests only
- Webhooks are processed asynchronously to prevent blocking
- Failed webhook processing is logged but doesn't block the request
- Consider adding webhook signature validation for production (Twilio and Postmark support this)
