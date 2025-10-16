# SMAX Integration Setup for Railway Production

## Database Setup

Your Railway production database needs the SMAX credentials added. Run this SQL in your Railway database console:

```sql
UPDATE tenant_settings 
SET smax_enabled = true,
    smax_api_key = 'W4teqfYX7fbEnRMAduCO',
    smax_pin = 'WayPoint',
    smax_base_url = 'https://apiv2.smaxcollectionsoftware.com'
WHERE tenant_id = '3b9dd70a-e629-4552-9e68-94bb7818c84e';
```

**Note:** This updates the Waypoint Solutions tenant. For other agencies, use their specific tenant_id and SMAX credentials.

## How It Works

### Authentication (Dual-Format Support)
The system now supports both SMAX response formats:
- **Railway Production**: `{state: "SUCCESS", result: {access_token: "..."}}`
- **Test Environment**: `{access_token: "..."}`

The code checks for the nested format first, then falls back to flat format automatically.

### Account Matching
- **Chain** uses `accountNumber` field
- **SMAX** uses `filenumber` field
- These must match for sync to work

### Sync Process (Every 8 Hours)

Call this endpoint every 8 hours to sync SMAX → Chain:

**Endpoint:** `POST /api/smax/sync-accounts`

**What It Does:**
1. Pulls account balances from SMAX
2. Updates Chain database with latest balances
3. Imports new payments from SMAX
4. Avoids duplicates using transaction IDs
5. Returns detailed sync results

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

## Testing the Sync

### Test Authentication
```bash
curl -X POST https://your-app.railway.app/api/settings/test-smax \
  -H "Content-Type: application/json" \
  -d '{
    "smaxEnabled": true,
    "smaxApiKey": "W4teqfYX7fbEnRMAduCO",
    "smaxPin": "WayPoint",
    "smaxBaseUrl": "https://apiv2.smaxcollectionsoftware.com"
  }'
```

Expected: `{"success": true}`

### Test Sync
```bash
curl -X POST https://your-app.railway.app/api/smax/sync-accounts \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

## Multi-Tenant Support

Each agency maintains separate SMAX credentials:
- **Tenant A**: Has their own API key, PIN, base URL
- **Tenant B**: Has their own API key, PIN, base URL
- Token caching uses composite key: `{apiKey}:{pin}:{baseUrl}`
- Complete isolation - no credential mixing

## Consumer Portal Sync

When consumers log in:
1. They see balance from Chain database
2. Chain database is synced from SMAX every 8 hours
3. If they made a payment in SMAX call center → It appears in Chain after next sync
4. If they make a payment in Chain portal → It's immediately sent to SMAX

## Troubleshooting

### "Invalid API Key and Password"
- Check credentials in Railway database
- Verify SMAX base URL is correct
- Test authentication endpoint first

### Sync Not Working
- Check logs for specific errors
- Verify accounts have `accountNumber` set
- Ensure SMAX filenumbers match Chain accountNumbers

### Duplicate Payments
- System deduplicates using `transactionId`
- SMAX payments without transaction IDs may import multiple times

### Railway vs Replit Response Format
- Code handles both automatically
- No need to change anything when deploying to Railway
