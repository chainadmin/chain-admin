# SMS Throttle & Webhook Fixes

## Issues Fixed

### 1. SMS Throttle Race Condition ✅

**Problem:** Multiple simultaneous SMS requests bypassed the rate limit because the counter incremented AFTER sending, not before.

**Fix Applied:**
- Moved `incrementSentCount()` to run BEFORE `sendImmediately()`
- Added `decrementSentCount()` rollback on send failures
- Now prevents burst sending that exceeds configured limits

**Code Changed:** `server/smsService.ts` lines 147-163

### 2. Webhook Parsing ✅

**Status:** Already properly configured - no changes needed!
- `express.urlencoded({ extended: true })` middleware is already in place (line 799)
- Twilio's form-encoded payloads should parse correctly

---

## What You Need to Verify on Railway

### 1. Check APP_URL Environment Variable

**Critical for webhooks to work!**

In your Railway project:
```bash
APP_URL=https://chain-admin-production.up.railway.app
```

**How to verify:**
1. Go to Railway Dashboard → Your Project → Variables
2. Confirm `APP_URL` is set to your actual Railway domain
3. If missing or incorrect, add/update it and redeploy

### 2. Configure Twilio Webhooks

**Inbound SMS Handler:**
1. Go to Twilio Console → Phone Numbers
2. Select your phone number
3. Set "A MESSAGE COMES IN" webhook to:
   ```
   https://chain-admin-production.up.railway.app/api/webhooks/twilio-inbound
   ```
4. Method: POST

**Note:** Outbound SMS status callbacks are automatically configured in code - no Twilio Console setup needed!

### 3. Configure Postmark Webhooks

**Email Tracking:**
1. Go to Postmark → Your Server → Webhooks
2. Add webhook URL:
   ```
   https://chain-admin-production.up.railway.app/api/webhooks/postmark
   ```
3. Enable: Open, Click, Bounce, Delivery, Spam Complaint

**Inbound Email:**
1. Postmark → Your Server → Inbound
2. Set webhook URL:
   ```
   https://chain-admin-production.up.railway.app/api/webhooks/postmark-inbound
   ```

---

## Testing Instructions

### Test SMS Throttle

1. **Check current throttle limit:**
   - Go to Admin Dashboard → Settings
   - Find "SMS Throttle Limit" (default: 10 per minute)

2. **Test burst sending:**
   - Send 15+ SMS messages rapidly (within 10 seconds)
   - Expected: First 10 send immediately, rest queue
   - Check logs for "SMS queued" messages

3. **Verify queue processing:**
   - Wait 60 seconds
   - Queued messages should send automatically
   - Check SMS tracking records in database

### Test Webhooks

**SMS Delivery Tracking:**
1. Send test SMS from platform
2. Check Railway logs for:
   ```
   📱 Twilio webhook received
   ✅ Twilio webhook processed successfully
   ```
3. Verify SMS tracking status updates in database

**Email Tracking:**
1. Send test email from platform
2. Open the email
3. Check Railway logs for:
   ```
   Received Postmark webhook
   📧 Email opened
   ```
4. Verify email log tracking in database

**Inbound Communications:**
1. Reply to SMS/email sent from platform
2. Check Railway logs for webhook receipt
3. Verify reply appears in Email Inbox UI

---

## Troubleshooting

### Throttle Not Working

**Symptoms:** All messages send immediately, none queue
**Check:**
- Is `smsThrottleLimit` set in tenant_settings?
- Look for "SMS throttle" in logs
- Check `sentCounts` map is incrementing before send

### Webhooks Not Receiving

**Symptoms:** No webhook logs in Railway
**Check:**
1. Is `APP_URL` environment variable set correctly?
2. Are webhook URLs configured in Twilio/Postmark dashboards?
3. Can you access the webhook endpoint directly in browser?
   ```
   https://your-domain.railway.app/api/health
   ```
4. Check Railway firewall/network settings

### Webhooks Receiving But Not Processing

**Symptoms:** Webhook logs show "missing MessageSid" or empty body
**Check:**
- Verify middleware order in routes.ts (should be early)
- Test webhook with curl to verify body parsing:
  ```bash
  curl -X POST https://your-domain.railway.app/api/webhooks/twilio \
    -d "MessageSid=SM123" \
    -d "MessageStatus=delivered"
  ```

---

## Technical Details

### Throttle Implementation

**In-memory rate limiting per tenant:**
- Tracks send count per tenant
- Resets every 60 seconds
- Queues overflow messages
- Processes queue every 10 seconds

### Webhook Flow

**SMS Status Tracking:**
```
Twilio → /api/webhooks/twilio → Update sms_tracking table
```

**Email Tracking:**
```
Postmark → /api/webhooks/postmark → Update email_logs table
```

**Inbound Processing:**
```
Twilio/Postmark → /api/webhooks/*-inbound → Store in email_inbox
```

---

## Deployment Checklist

Before going live with SMS/Email campaigns:

- [ ] APP_URL environment variable set on Railway
- [ ] Twilio inbound webhook configured for phone number
- [ ] Postmark tracking webhook configured
- [ ] Postmark inbound webhook configured
- [ ] SMS throttle limit set appropriately for your plan
- [ ] Test SMS sends and tracks correctly
- [ ] Test email sends and tracks correctly
- [ ] Test inbound SMS replies are received
- [ ] Test inbound email replies are received

---

## Related Documentation

- **Full webhook setup:** See `WEBHOOK_SETUP_RAILWAY.md`
- **Railway deployment:** See `DEPLOY_TO_RAILWAY_FINAL.md`
