# Final Railway Deployment Instructions

## What We Fixed:
- ✅ All 3 SMS features ARE implemented in the code
- ✅ Variables display (lines 402-476 of sms.tsx)
- ✅ Approval button (line 771 of sms.tsx)
- ✅ Folder filtering (server/routes.ts resolveSmsCampaignAudience)
- ✅ Database migrations work correctly
- ✅ Local build process confirmed working
- ✅ Webhook URLs now support Railway deployment

## The Problem:
Railway is serving OLD cached files from a previous deployment. The Dockerfile builds correctly, but Docker layers or Railway's cache is preventing the new build from being deployed.

---

## IMPORTANT: Environment Variables for Railway

### Required Environment Variable for Webhooks

Add this environment variable in Railway to ensure webhooks work correctly:

```
APP_URL=https://your-railway-domain.railway.app
```

**Example:**
```
APP_URL=https://chain-production.up.railway.app
```

This variable is used for:
- Twilio SMS delivery webhooks (`/api/webhooks/twilio`)
- Twilio inbound SMS webhooks (`/api/webhooks/twilio-inbound`)
- Postmark email tracking webhooks (`/api/webhooks/postmark`)
- Postmark inbound email webhooks (`/api/webhooks/postmark-inbound`)

**How to set it:**
1. Go to your Railway project
2. Click on your service
3. Go to **Variables** tab
4. Add new variable: `APP_URL` = `https://your-actual-railway-domain.railway.app`
5. Redeploy

---

## Deploy Steps:

### 1. Push the Latest Code
```bash
git add .
git commit -m "Fix SMS campaigns - add version marker"
git push origin main
```

### 2. In Railway Dashboard - CLEAR THE CACHE

**Option A: Force Redeploy (Recommended)**
1. Go to your Railway project
2. Click on your service
3. Go to **Deployments** tab
4. Click the **"..."** menu on the latest deployment
5. Click **"Redeploy"**
6. If there's a checkbox for "Clear build cache", check it

**Option B: Remove Service and Redeploy**
1. In Railway, go to Settings
2. Remove the service entirely
3. Reconnect your GitHub repo
4. Let it deploy fresh

### 3. Wait for Deployment to Complete
Watch the build logs in Railway. You should see:
```
> vite build && esbuild server/index.ts ...
✓ built in 13.99s
```

### 4. VERIFY THE DEPLOYMENT

**Step A: Check HTML Version**
1. Open your Railway SMS page
2. Press `F12` → go to **Network** tab
3. Refresh the page (F5)
4. Click on the first request (usually the HTML document)
5. Click **Response** tab
6. **Look for:** `<!-- BUILD VERSION: 2025-10-22-SMS-FIX -->`
   - ✅ If you see this = **NEW CODE IS DEPLOYED**
   - ❌ If you don't see this = Still serving old cache

**Step B: Test Features**
Only do this if Step A shows the new version:

1. **Variables Test:**
   - Go to Templates → Create Template
   - Scroll down in the modal
   - Should see blue box with 30+ variables

2. **Approval Button Test:**
   - Delete all old campaigns
   - Create ONE new campaign
   - Refresh the page
   - Should see green "Approve" button

3. **Folder Test:**
   - Create campaign
   - Select "Specific Folder(s)"
   - Check one folder
   - Save campaign
   - Should show folder name

---

## If It STILL Doesn't Work:

### Check Your Railway Build Settings:
1. Railway → Your Service → **Settings**
2. **Build Command** should be: `npm install && npm run build`
3. **Start Command** should be: `npm start`

### Check Dockerfile is Being Used:
1. Make sure `railway.json` has:
   ```json
   {
     "build": {
       "builder": "DOCKERFILE"
     }
   }
   ```

### Nuclear Option - Rebuild Everything:
```bash
# In Railway dashboard:
# 1. Delete the entire service
# 2. Create new service from GitHub repo
# 3. Set environment variables again
# 4. Deploy
```

---

## What to Tell Me:

After you deploy, tell me:

1. **Does the HTML have the version marker?**
   - Check in Network tab → Response
   - Look for: `<!-- BUILD VERSION: 2025-10-22-SMS-FIX -->`

2. **Which features still don't work?**
   - Variables: YES / NO
   - Approval button: YES / NO  
   - Folder filtering: YES / NO

3. **Screenshot of the Railway build logs**
   - Show the part where it runs `vite build`
