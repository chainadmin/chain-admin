# iOS App Store Build Setup with GitHub + EAS

This guide shows you how to automatically build iOS apps and submit them to the App Store using GitHub Actions and Expo's EAS Build.

## Prerequisites

- ✅ iPhone with iOS 13+
- ✅ Apple Developer Account ($99/year) - https://developer.apple.com
- ✅ GitHub repository for this project
- ✅ Free Expo account

---

## Step 1: Create Expo Account

1. Go to https://expo.dev/signup
2. Sign up with your email
3. Verify your email

---

## Step 2: Get Your Expo Access Token

1. Log in to https://expo.dev
2. Click your profile → **Settings**
3. Go to **Access Tokens**
4. Click **Create Token**
5. Name it: `GitHub Actions`
6. **Copy the token** - you'll need it in Step 4!

---

## Step 3: Initialize EAS Project (One-time setup)

**On your local computer** (not in Replit):

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo
eas login

# Navigate to your project folder
cd /path/to/your/project

# Initialize EAS (creates projectId in app.json)
eas init

# Configure iOS credentials
eas credentials
```

When prompted, let EAS manage your iOS certificates and provisioning profiles automatically.

---

## Step 4: Add Expo Token to GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `EXPO_TOKEN`
5. Value: Paste the token from Step 2
6. Click **Add secret**

---

## Step 5: Push Code to GitHub

```bash
git add .
git commit -m "Add EAS Build configuration"
git push origin main
```

---

## Step 6: Trigger a Build from GitHub

1. Go to your GitHub repository
2. Click **Actions** tab
3. Click **EAS Build** workflow
4. Click **Run workflow** button
5. Select:
   - Platform: `ios`
   - Profile: `production`
6. Click **Run workflow**

---

## Step 7: Monitor the Build

1. The GitHub Action will start the build on Expo's servers
2. Go to https://expo.dev to see build progress
3. You'll get an email when the build completes (usually 10-20 minutes)
4. Download the `.ipa` file from Expo

---

## Step 8: Submit to App Store

**Option A: Automatic Submission (Easiest)**

```bash
eas submit --platform ios --latest
```

This automatically uploads your latest build to App Store Connect!

**Option B: Manual Upload**

1. Download the `.ipa` file from Expo
2. Install **Transporter** app from Mac App Store
3. Drag the `.ipa` file into Transporter
4. Click **Deliver** to upload to App Store Connect

---

## Step 9: Complete App Store Listing

1. Go to https://appstoreconnect.apple.com
2. Click **My Apps** → **+ New App**
3. Fill in:
   - Name: `Chain Consumer Portal`
   - Primary Language: English
   - Bundle ID: `com.chaincomms.platform`
   - SKU: `chain-consumer-portal`
4. Add screenshots from your iPhone
5. Write app description
6. Submit for review

---

## Updating the App

Every time you want to release a new version:

1. Update version in `app.json`:
   ```json
   "version": "1.0.1"
   ```

2. Trigger build from GitHub Actions (Step 6)

3. Submit to App Store (Step 8)

---

## Troubleshooting

### "No EXPO_TOKEN found"
- Make sure you added the secret in GitHub Settings → Secrets

### "Invalid credentials"
- Run `eas credentials` to reconfigure iOS certificates

### "Build failed"
- Check the build logs at https://expo.dev
- Make sure `npm run build` works locally

---

## Cost Breakdown

| Service | Cost |
|---------|------|
| Apple Developer | $99/year |
| Expo (free tier) | $0 |
| EAS Build | Free for 30 builds/month* |
| GitHub Actions | Free for public repos |

*Paid plans available for unlimited builds

---

## Next Steps

✅ Your iOS app will now be available in the App Store!

✅ Users can download it and use it instead of going to the website

✅ Every time you push to GitHub, you can trigger a new build

---

## Support

- Expo Docs: https://docs.expo.dev/build/introduction/
- EAS Build: https://docs.expo.dev/build/setup/
- App Store Connect: https://developer.apple.com/app-store-connect/
