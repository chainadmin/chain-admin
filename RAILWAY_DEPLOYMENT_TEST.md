# Railway Deployment Verification Steps

## After you deploy this version to Railway:

### Step 1: Clear Browser Cache
**CRITICAL - Do this first!**
- Chrome/Edge: `Ctrl + Shift + Delete` → Clear "Cached images and files"
- Or use Incognito mode
- Or hard refresh: `Ctrl + Shift + R`

### Step 2: Check Version in Browser Console
1. Open your Railway SMS page
2. Press F12 to open Developer Tools
3. Go to "Console" tab
4. You should see: `🔵 SMS PAGE VERSION: 2025-10-22-FINAL - Variables, Approval, Folders ALL FIXED`
5. **If you DON'T see this message, Railway is serving OLD cached code**

### Step 3: Check Railway Server Logs
Look for these lines in your Railway deployment logs:
```
Updating SMS campaigns table...
  ✓ folder_ids column added
  ✓ status default changed to pending_approval
  ✓ Updated X existing campaign(s) to pending_approval status
```

### Step 4: Test Each Feature

#### A) Variables Test
1. Go to SMS → Templates tab
2. Click "Create Template"
3. Scroll down in the modal
4. **EXPECTED**: Blue box with 30+ variables listed
5. **ACTUAL**: What do you see?

#### B) Approval Button Test  
1. Delete ALL old campaigns first
2. Create a brand new campaign
3. Refresh the page
4. **EXPECTED**: Green "Approve" button next to campaign
5. **ACTUAL**: What do you see?

#### C) Folder Filtering Test
1. Create campaign
2. Select "Specific Folder(s)"
3. Check ONE folder
4. Create campaign
5. **EXPECTED**: Shows folder name, only targets that folder
6. **ACTUAL**: What do you see?

## If Console Shows Wrong Version:
Railway is serving cached JavaScript. Try:
1. Rebuild the deployment in Railway
2. Clear Railway's build cache
3. Check if Railway is building from the correct Git branch
