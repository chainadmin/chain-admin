# SMAX Integration Setup for Railway Production

## Multi-Tenant Credentials

**IMPORTANT:** Each agency has their own SMAX credentials stored in the database. The system automatically uses the correct credentials for each tenant.

### How It Works
- Each tenant's SMAX credentials are stored in `tenant_settings` table
- Settings include: `smax_api_key`, `smax_pin`, `smax_base_url`, `smax_enabled`
- When syncing, the system pulls the tenant's credentials from their settings
- Complete tenant isolation - each agency's credentials are used only for their accounts

### Configuring SMAX Credentials

**Option 1: Through Admin UI (Recommended)**
1. Log in as agency admin
2. Go to Settings → SMAX Integration
3. Enter your agency's SMAX credentials:
   - API Key (provided by SMAX)
   - PIN (provided by SMAX)
   - Base URL (usually `https://apiv2.smaxcollectionsoftware.com`)
4. Click "Test Connection" to verify
5. Save settings

**Option 2: Direct Database Update (For Initial Setup)**
```sql
UPDATE tenant_settings 
SET smax_enabled = true,
    smax_api_key = 'YOUR_AGENCY_API_KEY',
    smax_pin = 'YOUR_AGENCY_PIN',
    smax_base_url = 'https://apiv2.smaxcollectionsoftware.com'
WHERE tenant_id = 'YOUR_TENANT_ID';
```

**Note:** Replace `YOUR_AGENCY_API_KEY`, `YOUR_AGENCY_PIN`, and `YOUR_TENANT_ID` with actual values for each agency.

## How Authentication Works

### Dual-Format Support
The system supports both SMAX response formats automatically:
- **Railway Production**: `{state: "SUCCESS", result: {access_token: "..."}}`
- **Test Environment**: `{access_token: "..."}`

The code detects the format and extracts the token correctly in both environments.

### Token Caching
- Tokens are cached per tenant using composite key: `{apiKey}:{pin}:{baseUrl}`
- Each agency's tokens are isolated
- Tokens refresh automatically when expired

## Account Matching

For sync to work, accounts must match between systems:
- **Chain Database**: Uses `accountNumber` field
- **SMAX System**: Uses `filenumber` field
- **Matching Rule**: `Chain.accountNumber = SMAX.filenumber`

Make sure account numbers are consistent across both systems.

## Payment Integration

### Adding Payments to SMAX

Chain automatically syncs all payments to SMAX when they occur. The system uses the SMAX `/insert_payments_external` endpoint.

**What Gets Synced:**
- Online consumer payments (credit card)
- Manual admin payments
- Scheduled payment execution
- Payment arrangements

**Payment Data Format:**
```json
{
  "filenumber": "ABC123",
  "paymentamount": "150.00",
  "paymentmethod": "credit_card",
  "paymentdate": "2025-01-15",
  "transactionid": "txn_12345",
  "notes": "Payment via consumer portal"
}
```

**SMAX Endpoint:** `POST /insert_payments_external`

**When Payments Are Sent:**
- **Immediately** after payment is processed in Chain
- **Non-blocking** - payment succeeds even if SMAX is unavailable
- **Automatic** - no manual intervention required
- **Logged** - all sync attempts are logged for troubleshooting

**Requirements:**
- Account must have `filenumber` field populated
- SMAX must be enabled for the tenant
- Valid SMAX credentials configured

**Note:** If an account doesn't have a `filenumber`, the payment is still saved in Chain but is not sent to SMAX. The system logs a warning in this case.

### Adding Payment Arrangements to SMAX

When consumers set up payment plans, Chain syncs the arrangement to SMAX using the `/insertpaymentplan` endpoint.

**Arrangement Data Format:**
```json
{
  "filenumber": "ABC123",
  "arrangementtype": "Fixed Monthly",
  "monthlypayment": 100.00,
  "startdate": "2025-01-15",
  "enddate": "2025-06-15",
  "nextpaymentdate": "2025-02-15",
  "remainingpayments": 5,
  "totalbalance": 500.00,
  "cardtoken": "tok_12345",
  "cardlast4": "4242",
  "cardbrand": "Visa"
}
```

**SMAX Endpoint:** `POST /insertpaymentplan`

**Supported Arrangement Types:**
- Fixed Monthly
- Settlement
- Range
- Pay in Full
- Custom Terms

## Sync Process (Every 8 Hours)

The sync endpoint pulls data from SMAX into Chain for each tenant.

**Endpoint:** `POST /api/smax/sync-accounts`

**What It Does:**
1. Authenticates using tenant's SMAX credentials
2. Pulls account balances from SMAX
3. Updates Chain database with latest balances
4. Imports new payments from SMAX
5. Deduplicates using transaction IDs
6. Returns detailed sync results

**Response Example:**
```json
{
  "success": true,
  "message": "Sync completed: 15 accounts updated, 8 payments imported",
  "results": {
    "total": 20,
    "synced": 15,
    "failed": 2,
    "skipped": 3,
    "paymentsImported": 8,
    "errors": [
      "Account ABC123: No balance data from SMAX",
      "Account XYZ789: Connection timeout"
    ]
  }
}
```

## Setting Up 8-Hour Cron Job on Railway

### Option 1: Railway Cron (Recommended)
1. Add a new service in Railway
2. Set it as a "Cron" service
3. Schedule: `0 */8 * * *` (every 8 hours)
4. Command: 
```bash
curl -X POST https://your-app.railway.app/api/smax/sync-accounts \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

### Option 2: External Cron Service
Use a service like [cron-job.org](https://cron-job.org):
1. Create account
2. Add new cron job
3. URL: `https://your-app.railway.app/api/smax/sync-accounts`
4. Method: POST
5. Schedule: Every 8 hours
6. Add authentication headers (session cookie or API key)

### Option 3: Node Cron (Internal)
Add node-cron package and schedule internally (requires always-on dyno).

## Testing the Integration

### Test SMAX Connection
Use the admin UI test button, or manually:

```bash
curl -X POST https://your-app.railway.app/api/settings/test-smax \
  -H "Content-Type: application/json" \
  -d '{
    "smaxEnabled": true,
    "smaxApiKey": "YOUR_API_KEY",
    "smaxPin": "YOUR_PIN",
    "smaxBaseUrl": "https://apiv2.smaxcollectionsoftware.com"
  }'
```

Expected: `{"success": true}`

### Test Sync Manually
```bash
curl -X POST https://your-app.railway.app/api/smax/sync-accounts \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

## Consumer Portal Sync Flow

**How consumers see synced data:**

1. **Payment Made in SMAX Call Center:**
   - Payment recorded in SMAX system
   - Consumer account updated in SMAX

2. **After 8-Hour Sync:**
   - Chain pulls latest balance from SMAX
   - Chain imports the payment record
   - Payment appears in Chain database

3. **Consumer Logs Into Portal:**
   - Sees updated balance matching SMAX ✅
   - Sees payment in transaction history ✅

**Payment Made in Chain Portal:**
- Immediately saved to Chain database
- Immediately sent to SMAX via API
- Appears in both systems right away ✅

## Troubleshooting

### "Invalid API Key and Password"
- Verify credentials in tenant settings
- Check SMAX base URL is correct
- Test connection through admin UI first
- Ensure credentials are for the correct agency

### Sync Not Working
- Check server logs for specific errors
- Verify accounts have `accountNumber` set
- Ensure SMAX filenumbers match Chain accountNumbers
- Confirm SMAX is enabled in tenant settings

### Duplicate Payments
- System deduplicates using `transactionId`
- SMAX payments without transaction IDs may import multiple times
- Check for matching transaction IDs in both systems

### No Accounts Synced
- Verify tenant has accounts with `accountNumber` populated
- Check that SMAX has matching filenumbers
- Ensure SMAX authentication is working
- Review sync results for specific error messages

### Railway vs Replit Response Format
- Code handles both formats automatically
- No configuration changes needed when deploying to Railway
- Authentication works in both environments

## Security Notes

- Each tenant's credentials are stored securely in the database
- Credentials are never shared between tenants
- API keys and PINs should be kept confidential
- Use environment variables for any shared configuration
- Regular credential rotation is recommended
